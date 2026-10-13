import { createServer } from "node:http";
import { isIP } from "node:net";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { LIMITS, TEMPLATES, ServiceError, validateRequest } from "./limits.mjs";
import { Admission } from "./queue.mjs";
import { fetchImages } from "./images.mjs";
import { runWorker } from "./worker.mjs";

const execute = promisify(execFile);

async function convertImages(image, directory, signal) {
  const output = await runWorker(image, directory, "images", signal);
  const converted = [];
  let offset = 0;
  while (offset < output.length) {
    const line = output.indexOf(10, offset);
    if (line < offset || line - offset > 4096)
      throw new Error("Invalid image worker output");
    const asset = JSON.parse(output.subarray(offset, line).toString("utf8"));
    if (
      !/^image-[0-9]+\.(png|jpg)$/.test(asset.file) ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes <= 0 ||
      line + 1 + asset.bytes > output.length
    )
      throw new Error("Invalid converted image");
    await writeFile(
      join(directory, asset.file),
      output.subarray(line + 1, line + 1 + asset.bytes),
      { flag: "wx", mode: 0o600 },
    );
    converted.push({ source: asset.source, file: asset.file });
    offset = line + 1 + asset.bytes;
  }
  return converted;
}

export async function checkReadiness(image, allowUnverified = false) {
  if (!/^sha256:[a-f0-9]{64}$/.test(image ?? "")) return false;
  try {
    await execute("docker", ["image", "inspect", image], {
      timeout: 5000,
      maxBuffer: 262144,
    });
    if (allowUnverified) return process.env.NODE_ENV !== "production";
    const cgroup = (await readFile("/proc/self/cgroup", "utf8"))
      .trim()
      .split("::")[1];
    if (
      !cgroup?.includes("/publisle-pdf.slice/") ||
      process.env.DOCKER_HOST !==
        `unix:///run/user/${process.getuid()}/docker.sock`
    )
      return false;
    const base = `/sys/fs/cgroup${cgroup.slice(0, cgroup.indexOf("/publisle-pdf.slice/") + "/publisle-pdf.slice".length)}`;
    const verification = JSON.parse(
      await readFile(
        process.env.PDF_VERIFICATION_FILE ?? "/etc/publisle-pdf-verified.json",
        "utf8",
      ),
    );
    if (
      verification.image !== image ||
      verification.passed !== true ||
      verification.aggregateCpu !== 0.5 ||
      verification.aggregateMemoryMiB !== 512 ||
      TEMPLATES.some(
        (template) =>
          !verification.samples?.some(
            (sample) =>
              sample.template === template.id &&
              sample.pdfBytes > 0 &&
              !sample.failure,
          ),
      )
    )
      return false;
    const [memory, swap, cpu, runtime] = await Promise.all([
      readFile(`${base}/memory.max`, "utf8"),
      readFile(`${base}/memory.swap.max`, "utf8"),
      readFile(`${base}/cpu.max`, "utf8"),
      readFile(`${base}/user@${process.getuid()}.service/cgroup.procs`, "utf8"),
    ]);
    const [quota, period] = cpu.trim().split(/\s+/).map(Number);
    const info = JSON.parse(
      (
        await execute("docker", ["info", "--format", "{{json .}}"], {
          timeout: 5000,
          maxBuffer: 262144,
        })
      ).stdout,
    );
    return (
      Number(memory.trim()) <= 512 * 1024 * 1024 &&
      Number(swap.trim()) === 0 &&
      quota > 0 &&
      quota / period <= 0.5 &&
      runtime.trim().length > 0 &&
      info.CgroupVersion === "2" &&
      info.CgroupDriver === "systemd" &&
      info.SecurityOptions?.some((value) => value.includes("rootless")) === true
    );
  } catch {
    return false;
  }
}

export async function compileJob(request, signal, options) {
  const directory = await mkdtemp(
    join(options.jobDirectory ?? tmpdir(), "publisle-pdf-"),
  );
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(LIMITS.jobMs)]);
  const started = performance.now();
  let resultCode = "ok";
  try {
    await writeFile(join(directory, "request.json"), JSON.stringify(request), {
      flag: "wx",
      mode: 0o600,
    });
    const prepared = JSON.parse(
      (await runWorker(options.image, directory, "prepare", deadline)).toString(
        "utf8",
      ),
    );
    if (
      !Array.isArray(prepared.sources) ||
      prepared.sources.some((source) => typeof source !== "string")
    )
      throw new Error("Invalid worker output");
    const assets = await fetchImages(
      prepared.sources,
      directory,
      deadline,
      options.assetBase,
      options.imageDependencies,
    );
    await writeFile(
      join(directory, "prepared.json"),
      JSON.stringify({ document: prepared.document, assets }),
      { flag: "wx", mode: 0o600 },
    );
    if (assets.length) {
      const converted = await convertImages(options.image, directory, deadline);
      await writeFile(
        join(directory, "prepared.json"),
        JSON.stringify({ document: prepared.document, assets: converted }),
        { mode: 0o600 },
      );
    }
    const output = await runWorker(
      options.image,
      directory,
      "compile",
      deadline,
    );
    const line = output.indexOf(10);
    if (line < 0 || line > 16384) throw new Error("Invalid worker output");
    const metadata = JSON.parse(output.subarray(0, line).toString("utf8"));
    const pdf = output.subarray(line + 1);
    if (!metadata.ok || pdf.subarray(0, 5).toString() !== "%PDF-")
      throw new Error("Invalid worker output");
    return { pdf, diagnostics: metadata.diagnostics };
  } catch (error) {
    resultCode = signal.aborted
      ? "cancelled"
      : deadline.aborted
        ? "timeout"
        : (error.code ?? "compilation-failed");
    if (deadline.aborted && !signal.aborted)
      throw new ServiceError(
        "timeout",
        "PDF compilation exceeded its time limit.",
        504,
      );
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
    console.log(
      JSON.stringify({
        event: "pdf-job",
        code: resultCode,
        durationMs: Math.round(performance.now() - started),
      }),
    );
  }
}

export function createApi(options = {}) {
  const admission = new Admission(options.limits ?? LIMITS);
  const allowedOrigins = new Set(options.origins ?? ["https://publisle.xyz"]);
  let ready = options.ready ?? false;
  const controllers = new Set();
  const json = (response, status, payload) => {
    if (response.destroyed) return;
    const body = JSON.stringify(payload);
    response.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
      "cache-control": "no-store",
    });
    response.end(body);
  };
  const server = createServer(
    { requestTimeout: 45000, headersTimeout: 10000, maxHeaderSize: 8192 },
    (request, response) => {
      response.setHeader("x-content-type-options", "nosniff");
      response.setHeader("cache-control", "no-store");
      const origin = request.headers.origin;
      if (origin && !allowedOrigins.has(origin)) {
        json(response, 403, {
          ok: false,
          code: "origin-denied",
          message: "Origin is not allowed.",
        });
        return;
      }
      if (origin) {
        response.setHeader("access-control-allow-origin", origin);
        response.setHeader("vary", "Origin");
        response.setHeader(
          "access-control-expose-headers",
          "Retry-After, X-Publisle-Diagnostics",
        );
      }
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "Content-Type, Accept",
          "access-control-max-age": "600",
        });
        response.end();
        return;
      }
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (request.method === "GET" && pathname === "/health") {
        json(response, 200, {
          status: "ok",
          service: "publisle-api",
          services: { pdf: ready },
        });
        return;
      }
      if (request.method === "GET" && pathname === "/pdf/capabilities") {
        json(response, 200, {
          enabled: ready,
          templates: TEMPLATES,
          requiredMetadata: ["title", "authors"],
          limits: LIMITS,
        });
        return;
      }
      if (request.method === "GET" && pathname === "/") {
        json(response, 200, {
          service: "publisle-api",
          endpoints: [
            "GET /health",
            "GET /pdf/capabilities",
            "POST /pdf/compile",
          ],
        });
        return;
      }
      if (request.method !== "POST" || pathname !== "/pdf/compile") {
        json(response, 404, {
          ok: false,
          code: "not-found",
          message: "Not found.",
        });
        return;
      }
      if (!ready) {
        json(response, 503, {
          ok: false,
          code: "unavailable",
          message: "PDF compilation is unavailable.",
        });
        request.resume();
        return;
      }
      const controller = new AbortController();
      controllers.add(controller);
      response.on("close", () => controller.abort());
      void (async () => {
        let release;
        try {
          if (
            request.headers["content-type"]?.split(";")[0]?.trim() !==
            "application/json"
          )
            throw new ServiceError(
              "invalid-content-type",
              "Expected application/json.",
              415,
            );
          if (
            Number(request.headers["content-length"] ?? 0) > LIMITS.requestBytes
          )
            throw new ServiceError(
              "request-limit",
              "Editor source exceeds 256 KiB.",
              413,
            );
          let ip = request.socket.remoteAddress ?? "unknown";
          if (
            options.trustProxy &&
            ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)
          ) {
            const forwarded = request.headers["x-forwarded-for"];
            const address =
              typeof forwarded === "string"
                ? forwarded.split(",").at(-1)?.trim()
                : undefined;
            if (address && isIP(address)) ip = address;
          }
          release = await admission.acquire(ip, controller.signal);
          const chunks = [];
          let size = 0;
          for await (const chunk of request) {
            size += chunk.length;
            if (size > LIMITS.requestBytes)
              throw new ServiceError(
                "request-limit",
                "Editor source exceeds 256 KiB.",
                413,
              );
            chunks.push(chunk);
          }
          let value;
          try {
            value = JSON.parse(
              new TextDecoder("utf-8", { fatal: true }).decode(
                Buffer.concat(chunks),
              ),
            );
          } catch {
            throw new ServiceError(
              "invalid-request",
              "Invalid JSON source.",
              400,
            );
          }
          const input = validateRequest(value);
          const result = await (
            options.compile ??
            ((job, signal) => compileJob(job, signal, options))
          )(input, controller.signal);
          if (controller.signal.aborted) return;
          if (request.headers.accept?.includes("application/pdf")) {
            const diagnostics = Buffer.from(
              JSON.stringify(result.diagnostics ?? []),
            ).toString("base64");
            response.writeHead(200, {
              "content-type": "application/pdf",
              "content-disposition": 'attachment; filename="publisle.pdf"',
              "content-length": result.pdf.length,
              "x-publisle-diagnostics":
                diagnostics.length <= 8192 ? diagnostics : "W10=",
            });
            response.end(result.pdf);
          } else
            json(response, 200, {
              ok: true,
              pdfBase64: result.pdf.toString("base64"),
              diagnostics: result.diagnostics ?? [],
            });
        } catch (error) {
          if (!controller.signal.aborted) {
            if (error.status === 429) response.setHeader("retry-after", "60");
            json(response, error.status ?? 422, {
              ok: false,
              code: error.code ?? "compilation-failed",
              message:
                error instanceof ServiceError
                  ? error.message
                  : "Could not compile this document. Check image URLs, source, and service limits.",
            });
          }
        } finally {
          request.resume();
          release?.();
          controllers.delete(controller);
        }
      })();
    },
  );
  server.maxConnections = 32;
  return {
    server,
    setReady(value) {
      ready = value;
    },
    shutdown() {
      ready = false;
      for (const controller of controllers) controller.abort();
      server.close();
      server.closeAllConnections();
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const enabled = process.env.PDF_ENABLED === "true";
  const image = process.env.PDF_WORKER_IMAGE;
  const localQa = process.env.PDF_LOCAL_QA === "true";
  const options = {
    image,
    assetBase: process.env.PDF_ASSET_BASE ?? "https://publisle.xyz/",
    jobDirectory: process.env.PDF_JOB_DIRECTORY,
    trustProxy: true,
    origins: (process.env.PDF_ORIGINS ?? "https://publisle.xyz").split(","),
    ready: enabled && (await checkReadiness(image, localQa)),
  };
  const api = createApi(options);
  api.server.listen(Number(process.env.PORT ?? 8787), "127.0.0.1", () =>
    console.log(`Publisle API ready (PDF: ${options.ready})`),
  );
  const timer = setInterval(() => {
    void checkReadiness(image, localQa).then((ready) =>
      api.setReady(enabled && ready),
    );
  }, 30000);
  timer.unref();
  for (const event of ["SIGTERM", "SIGINT"])
    process.once(event, () => {
      clearInterval(timer);
      api.shutdown();
    });
}
