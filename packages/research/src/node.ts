import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { ResearchLoss } from "./article.ts";
import type { Block, BlockType, Document } from "@publisle/schema";
import { createLatexPackage, type LatexPackageOptions } from "./package.ts";
import type { LatexPackage } from "./package.ts";

const execute = promisify(execFile);
export interface CompileLatexOptions {
  /** Base directory for local manuscript assets. */
  readonly sourceDirectory: string;
  /** Total latexmk process timeout, default 120 seconds. */
  readonly timeoutMs?: number;
  readonly compiler?: "auto" | "native" | "container";
  readonly containerImage?: string;
}
export interface CompiledLatexPackage {
  readonly pdf: Uint8Array;
  readonly files: Readonly<Record<string, string | Uint8Array>>;
  readonly diagnostics: readonly ResearchLoss[];
}
function packagePath(directory: string, name: string): string {
  if (isAbsolute(name) || name.split(/[\\/]/u).includes(".."))
    throw new Error(`Unsafe package path: ${name}`);
  return join(directory, name);
}

// Killing the process group also terminates TeX/BibTeX children on POSIX.
function runLatexmk(
  args: readonly string[],
  directory: string,
  timeout: number,
  backend: { command: string; prefix: readonly string[] },
): Promise<string> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(backend.command, [...backend.prefix, ...args], {
      cwd: directory,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TEXMFOUTPUT: directory,
        openin_any: "p",
        openout_any: "p",
      },
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failure: Error | undefined;
    const stop = (error: Error) => {
      failure ??= error;
      try {
        if (process.platform !== "win32" && child.pid !== undefined)
          process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const timer = setTimeout(() => {
      stop(
        new Error(`LaTeX compilation timed out after ${String(timeout)} ms.`),
      );
    }, timeout);
    const collect = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 4 * 1024 * 1024)
        stop(new Error("LaTeX compilation exceeded the 4 MiB output limit."));
      else chunks.push(chunk);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      failure ??= error;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8");
      if (failure) rejectRun(failure);
      else if (code !== 0)
        rejectRun(
          new Error(
            `latexmk exited with code ${String(code)}.\n${output.slice(-6000)}`,
          ),
        );
      else resolveRun(output);
    });
  });
}

/** Node-only local TeX compilation. Does not publish or overwrite output paths. */
export async function compileLatexPackage(
  source: LatexPackage,
  options: CompileLatexOptions,
): Promise<CompiledLatexPackage> {
  const timeout = options.timeoutMs ?? 120_000;
  if (!Number.isSafeInteger(timeout) || timeout <= 0)
    throw new Error("Compilation timeout must be a positive integer.");
  const backend = await selectCompiler(source, options);
  const directory = await mkdtemp(join(tmpdir(), "publisle-tex-"));
  const files: Record<string, string | Uint8Array> = {
    ...source.files,
    ...source.resources,
  };
  try {
    for (const [name, value] of Object.entries({
      ...source.files,
      ...source.resources,
    })) {
      const path = packagePath(directory, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, value, { flag: "wx" });
    }
    const base = await realpath(options.sourceDirectory);
    for (const asset of source.assets) {
      const path = await realpath(resolve(base, asset.source));
      const local = relative(base, path);
      if (
        isAbsolute(local) ||
        local === ".." ||
        local.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
      )
        throw new Error(
          `Figure asset escapes manuscript directory: ${asset.source}`,
        );
      const destination = packagePath(directory, asset.destination);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(path, destination, constants.COPYFILE_EXCL);
      files[asset.destination] = new Uint8Array(await readFile(destination));
    }
    let stdout = "";
    const containerName = `publisle-${randomUUID()}`;
    try {
      stdout = await runLatexmk(
        [
          source.engine === "pdflatex" ? "-pdf" : "-lualatex",
          "-norc",
          "-interaction=nonstopmode",
          "-halt-on-error",
          "-file-line-error",
          "-no-shell-escape",
          "manuscript.tex",
        ],
        directory,
        timeout,
        backend.kind === "native"
          ? { command: "latexmk", prefix: [] }
          : {
              command: "docker",
              prefix: [
                "run",
                "--rm",
                "--pull=never",
                "--name",
                containerName,
                "--read-only",
                "--tmpfs",
                "/tmp:rw,nosuid,size=512m",
                "--network=none",
                "--cap-drop=ALL",
                "--security-opt=no-new-privileges",
                "--user",
                backend.user ?? "1000:1000",
                "--mount",
                `type=bind,source=${directory},target=/work`,
                "--workdir",
                "/work",
                "--env",
                "HOME=/tmp",
                "--env",
                "TEXMFVAR=/tmp/texmf-var",
                "--env",
                // LuaTeX 2025 reads Unicode data via absolute paths. The
                // container exposes only the compiler and the package mount.
                "openin_any=r",
                "--env",
                "openout_any=p",
                backend.image ?? "",
                "latexmk",
              ],
            },
      );
    } catch (error) {
      const log = await readFile(
        join(directory, "manuscript.log"),
        "utf8",
      ).catch(() => "");
      throw new Error(
        `Local LaTeX compilation failed (requires latexmk, ${source.engine}, template dependencies): ${error instanceof Error ? error.message : String(error)}\n${log.slice(-6000)}`,
        { cause: error },
      );
    } finally {
      if (backend.kind === "container")
        await execute("docker", ["rm", "--force", containerName], {
          timeout: 10_000,
        }).catch(() => undefined);
    }
    const log = await readFile(join(directory, "manuscript.log"), "utf8");
    if (
      /Missing character:|undefined references|Citation .* undefined|Reference .* undefined/iu.test(
        log,
      )
    )
      throw new Error(
        `LaTeX output has missing glyphs or unresolved references:\n${log
          .split("\n")
          .filter((line) => /Missing character:|undefined/iu.test(line))
          .join("\n")}`,
      );
    const diagnostics = [...source.diagnostics];
    for (const line of log.split("\n"))
      if (/Overfull \\[hv]box/u.test(line))
        diagnostics.push({ code: "latex-layout-overflow", message: line });
    const pdf = new Uint8Array(
      await readFile(join(directory, "manuscript.pdf")),
    );
    files["manuscript.pdf"] = pdf;
    files["manuscript.bbl"] = await readFile(
      join(directory, "manuscript.bbl"),
      "utf8",
    ).catch(() => "");
    files["manuscript.log"] = log;
    files["build.log"] = stdout;
    const engineVersion =
      backend.kind === "native"
        ? (
            await execute(source.engine, ["--version"], { timeout: 5000 })
          ).stdout.split("\n")[0]
        : backend.image;
    const fontVersions: Record<string, string> = {};
    if (backend.kind === "native")
      for (const [script, font] of Object.entries(source.fonts))
        fontVersions[script] = (
          await execute(
            "fc-match",
            ["-f", "%{family}: %{fontversion}\n", font],
            { timeout: 5000 },
          )
        ).stdout.trim();
    const dependencyDigests: Record<string, string> = {};
    const dependencyVersions: Record<string, string> = {};
    if (backend.kind === "native")
      for (const name of source.requirements) {
        const provided = source.resources?.[name] ?? source.files[name];
        const bytes =
          provided === undefined
            ? await readFile(
                (
                  await execute("kpsewhich", [name], { timeout: 5000 })
                ).stdout.trim(),
              )
            : typeof provided === "string"
              ? Buffer.from(provided)
              : provided;
        dependencyDigests[name] =
          "sha256:" + createHash("sha256").update(bytes).digest("hex");
        const version =
          /\\Provides(?:Package|Class)\{[^}]+\}\s*\[([^\]]+)\]/u.exec(
            new TextDecoder().decode(bytes),
          )?.[1];
        if (version) dependencyVersions[name] = version;
      }
    files["manifest.json"] =
      JSON.stringify(
        {
          template: source.template,
          pdfStandard: source.pdfStandard,
          pdfUaValidation: source.pdfStandard ? "not-run" : "unavailable",
          engine: source.engine,
          engineVersion,
          compiler: backend.kind,
          containerImage: backend.image,
          templateVersion: source.templateVersion,
          requirements: source.requirements,
          dependencyDigests,
          dependencyVersions,

          fonts: source.fonts,
          fontVersions,
          diagnostics,
          files: [...Object.keys(files), "manifest.json"].sort(),
        },
        null,
        2,
      ) + "\n";
    return { pdf, files, diagnostics };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Atomically claims a new output directory; compilation must already have succeeded. */
export async function writeLatexPackage(
  compiled: {
    readonly files: CompiledLatexPackage["files"];
    readonly pdf?: Uint8Array;
    readonly diagnostics?: readonly ResearchLoss[];
  },
  outputDirectory: string,
): Promise<void> {
  await mkdir(outputDirectory);
  try {
    for (const [name, value] of Object.entries(compiled.files)) {
      const path = packagePath(outputDirectory, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, value, { flag: "wx" });
    }
  } catch (error) {
    await rm(outputDirectory, { recursive: true, force: true });
    throw error;
  }
}

const compilerLock = join(homedir(), ".cache", "publisle", "compiler.json");
export interface CompilerStatus {
  readonly available: boolean;
  readonly missing: readonly string[];
  readonly latexFormat?: string;
}
async function taggingFormat(image?: string): Promise<string | undefined> {
  const directory = await mkdtemp(join(tmpdir(), "publisle-format-"));
  const containerName = `publisle-format-${randomUUID()}`;
  try {
    const args = [
      "-interaction=nonstopmode",
      "-no-shell-escape",
      "-draftmode",
      "\\typeout{PUBLISLE-FORMAT:\\fmtversion}\\stop",
    ];
    const output = await execute(
      image ? "docker" : "lualatex",
      image
        ? [
            "run",
            "--rm",
            "--pull=never",
            "--name",
            containerName,
            "--network=none",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--read-only",
            "--tmpfs",
            "/tmp:rw,nosuid,size=128m",
            "--workdir",
            "/tmp",
            "--env",
            "HOME=/tmp",
            "--env",
            "TEXMFVAR=/tmp/texmf-var",
            "--env",
            "openin_any=r",
            image,
            "lualatex",
            ...args,
          ]
        : args,
      {
        cwd: directory,
        env: {
          ...process.env,
          TEXMFVAR: directory,
          TEXMFOUTPUT: directory,
          openin_any: "p",
          openout_any: "p",
        },
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      },
    );
    return /PUBLISLE-FORMAT:(\d{4}-\d{2}-\d{2})/u.exec(output.stdout)?.[1];
  } finally {
    if (image)
      await execute("docker", ["rm", "--force", containerName], {
        timeout: 10_000,
      }).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
}
export async function doctorCompiler(
  source: LatexPackage,
): Promise<CompilerStatus> {
  const missing: string[] = [];
  let latexFormat: string | undefined;
  if (source.engine === "lualatex") {
    latexFormat = await taggingFormat().catch(() => undefined);
    if (!latexFormat)
      missing.push("LuaLaTeX initialization under restricted native input");
    else if (source.pdfStandard && latexFormat < "2025-11-01")
      missing.push("LaTeX format >= 2025-11-01 (PDF/UA tagging)");
  }
  for (const command of ["latexmk", source.engine, "bibtex", "kpsewhich"])
    try {
      await execute(command, ["--version"], { timeout: 5000 });
    } catch {
      missing.push(command);
    }
  for (const dependency of source.requirements) {
    if (
      source.files[dependency] !== undefined ||
      source.resources?.[dependency] !== undefined
    )
      continue;
    try {
      if (
        !(
          await execute("kpsewhich", [dependency], { timeout: 5000 })
        ).stdout.trim()
      )
        missing.push(dependency);
    } catch {
      missing.push(dependency);
    }
  }
  for (const font of Object.values(source.fonts))
    try {
      const matched = (
        await execute("fc-match", ["-f", "%{family}", font], { timeout: 5000 })
      ).stdout;
      if (!matched.toLowerCase().includes(font.toLowerCase()))
        missing.push(`font:${font}`);
    } catch {
      missing.push(`font:${font}`);
    }
  return {
    available: missing.length === 0,
    missing,
    ...(latexFormat ? { latexFormat } : {}),
  };
}
async function selectCompiler(
  source: LatexPackage,
  options: CompileLatexOptions,
): Promise<{ kind: "native" | "container"; image?: string; user?: string }> {
  const mode = options.compiler ?? "auto";
  const native =
    mode === "container" ? undefined : await doctorCompiler(source);
  if (native?.available) return { kind: "native" };
  if (mode === "native")
    throw new Error(
      `Native compiler is incomplete: ${native?.missing.join(", ") ?? "unknown"}`,
    );
  let image = options.containerImage;
  if (!image)
    try {
      const lock = JSON.parse(await readFile(compilerLock, "utf8")) as {
        image: string;
      };
      image = lock.image;
    } catch {
      /* No installed compiler. */
    }
  if (image && /^sha256:[a-f0-9]{64}$/u.test(image))
    try {
      await execute("docker", ["image", "inspect", image], { timeout: 5000 });
      if (source.pdfStandard) {
        const format = await taggingFormat(image);
        if (!format || format < "2025-11-01")
          throw new Error(
            "Installed compiler predates PDF/UA tagging; run publisle setup compiler.",
          );
      }
      const security = (
        await execute(
          "docker",
          ["info", "--format", "{{json .SecurityOptions}}"],
          { timeout: 5000 },
        )
      ).stdout;
      return {
        kind: "container",
        image,
        user: security.includes("rootless")
          ? "0:0"
          : `${String(process.getuid?.() ?? 1000)}:${String(process.getgid?.() ?? 1000)}`,
      };
    } catch {
      /* Never pull implicitly. */
    }
  throw new Error(
    `No complete compiler is installed${native ? ` (missing: ${native.missing.join(", ")})` : ""}. Run publisle setup compiler explicitly, or install the native dependencies.`,
  );
}
export interface SetupCompilerOptions {
  /** Published immutable registry reference, including @sha256: digest. */
  readonly image?: string;
  /** Build the bundled frozen recipe instead of pulling a published image. */
  readonly localBuild?: boolean;
}

/** Explicit setup is the only operation that downloads or builds a compiler. */
export async function setupCompiler(
  options: SetupCompilerOptions = {},
): Promise<string> {
  if (options.localBuild && options.image)
    throw new Error("Choose a published compiler image or a local build.");
  const release = JSON.parse(
    await readFile(
      new URL("../compiler/release.json", import.meta.url),
      "utf8",
    ),
  ) as { recipeVersion: number; publishedImage: string | null };
  const publishedImage = options.localBuild
    ? undefined
    : (options.image ?? release.publishedImage ?? undefined);
  if (
    publishedImage &&
    !/^[a-z0-9][a-z0-9.:/-]*@sha256:[a-f0-9]{64}$/u.test(publishedImage)
  )
    throw new Error(
      "Compiler image must be an immutable registry@sha256: reference.",
    );
  const tag = `publisle-compiler:${String(release.recipeVersion)}`;
  if (publishedImage) {
    try {
      await execute("docker", ["pull", publishedImage], {
        timeout: 1_800_000,
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch (error) {
      throw new Error(
        "Could not pull the pinned compiler. Retry setup, or use publisle setup compiler --build for the bundled local recipe.",
        { cause: error },
      );
    }
  } else {
    await execute(
      "docker",
      [
        "build",
        "--tag",
        tag,
        "--file",
        new URL("../compiler/Dockerfile", import.meta.url).pathname,
        new URL("../compiler/", import.meta.url).pathname,
      ],
      { timeout: 1_800_000, maxBuffer: 8 * 1024 * 1024 },
    );
  }
  const inspected = JSON.parse(
    (
      await execute("docker", ["image", "inspect", publishedImage ?? tag], {
        timeout: 5000,
      })
    ).stdout,
  ) as {
    Id: string;
    RepoDigests?: string[];
    Os: string;
    Architecture: string;
  }[];
  const details = inspected[0];
  if (!details || !/^sha256:[a-f0-9]{64}$/u.test(details.Id))
    throw new Error("Compiler did not return a pinned image digest.");
  if (publishedImage && !details.RepoDigests?.includes(publishedImage))
    throw new Error(
      "Pulled compiler does not match the requested registry digest.",
    );
  if (
    details.Os !== "linux" ||
    !["amd64", "arm64"].includes(details.Architecture)
  )
    throw new Error("Compiler must be a linux/amd64 or linux/arm64 image.");
  await mkdir(dirname(compilerLock), { recursive: true });
  await writeFile(
    compilerLock,
    JSON.stringify({
      image: details.Id,
      recipeVersion: release.recipeVersion,
      platform: `${details.Os}/${details.Architecture}`,
      ...(publishedImage ? { publishedImage } : {}),
    }) + "\n",
  );
  return details.Id;
}
/** Unicode-safe default PDF API. Never falls back to the legacy text exporter. */
export async function exportPdf(
  document: Document<Block<BlockType, unknown>>,
  options: LatexPackageOptions & CompileLatexOptions,
): Promise<CompiledLatexPackage> {
  return compileLatexPackage(createLatexPackage(document, options), options);
}

export { lookupDoi, fetchBibliography, importCslJson } from "./remote.ts";

/** In-memory ZIP construction, followed by exclusive creation of the destination. */
export async function writePackageArchive(
  compiled: Pick<CompiledLatexPackage, "files">,
  outputFile: string,
): Promise<void> {
  const { zipSync, strToU8 } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(compiled.files)) {
    packagePath("/", name);
    entries[name] = typeof value === "string" ? strToU8(value) : value;
  }
  await writeFile(outputFile, zipSync(entries), { flag: "wx" });
}

/** Collect and validate an article/assets JATS package without network access. */
export async function collectJatsPackage(
  source: import("./jats.ts").JatsPackage,
  sourceDirectory: string,
): Promise<{
  files: Readonly<Record<string, string | Uint8Array>>;
  diagnostics: readonly ResearchLoss[];
}> {
  const directory = await mkdtemp(join(tmpdir(), "publisle-jats-"));
  const files: Record<string, string | Uint8Array> = { ...source.files };
  try {
    const base = await realpath(sourceDirectory);
    for (const asset of source.assets) {
      const path = await realpath(resolve(base, asset.source));
      const local = relative(base, path);
      if (
        isAbsolute(local) ||
        local === ".." ||
        local.startsWith("../") ||
        local.startsWith("..\\")
      )
        throw new Error("JATS asset escapes manuscript directory.");
      files[asset.destination] = new Uint8Array(await readFile(path));
    }
    for (const [name, value] of Object.entries(files)) {
      const path = packagePath(directory, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, value, { flag: "wx" });
    }
    const dtd = new URL(
      "../vendor/jats/JATS-Archiving-1-3-MathML2-DTD/JATS-archivearticle1-3.dtd",
      import.meta.url,
    ).pathname;
    await execute(
      "xmllint",
      ["--nonet", "--noout", "--dtdvalid", dtd, join(directory, "article.xml")],
      { timeout: 10_000, maxBuffer: 1024 * 1024 },
    );
    const schemaDirectory = dirname(dtd);
    for (const name of await readdir(schemaDirectory)) {
      const path = join(schemaDirectory, name);
      if (/\.(?:dtd|ent|mod)$/u.test(name))
        files[`schema/${name}`] = new Uint8Array(await readFile(path));
    }
    files["BUILD.md"] =
      "# Validate offline\n\nxmllint --nonet --noout --dtdvalid schema/JATS-archivearticle1-3.dtd article.xml\n";
    files["manifest.json"] =
      JSON.stringify(
        {
          format: "jats",
          version: "1.3",
          validation: "offline-dtd",
          files: Object.keys(files).sort(),
          diagnostics: source.diagnostics,
        },
        null,
        2,
      ) + "\n";
    return { files, diagnostics: source.diagnostics };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function doctorCompilers(
  source: LatexPackage,
  options: { readonly veraPdf?: boolean } = {},
): Promise<{
  native: CompilerStatus;
  container: {
    available: boolean;
    runtimeAvailable: boolean;
    image?: string;
    publishedImage?: string;
    platform?: string;
  };
  veraPdf?: { available: boolean; version?: string };
}> {
  const native = await doctorCompiler(source);
  const runtimeAvailable = await execute("docker", ["info"], { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  const installed = await readFile(compilerLock, "utf8")
    .then(
      (value) =>
        JSON.parse(value) as {
          image?: string;
          publishedImage?: string;
          platform?: string;
        },
    )
    .catch(
      (): {
        image?: string;
        publishedImage?: string;
        platform?: string;
      } => ({}),
    );
  const imageStatus = {
    runtimeAvailable,
    ...(installed.image ? { image: installed.image } : {}),
    ...(installed.publishedImage
      ? { publishedImage: installed.publishedImage }
      : {}),
    ...(installed.platform ? { platform: installed.platform } : {}),
  };
  const validator = options.veraPdf
    ? {
        veraPdf: await execute("verapdf", ["--version"], { timeout: 10_000 })
          .then(({ stdout }) => ({
            available: true,
            version: stdout.split("\n")[0] ?? "",
          }))
          .catch(() => ({ available: false })),
      }
    : {};
  try {
    const backend = await selectCompiler(source, {
      sourceDirectory: ".",
      compiler: "container",
    });
    return {
      native,
      ...validator,
      container: {
        ...imageStatus,
        available: true,
        ...(backend.image ? { image: backend.image } : {}),
      },
    };
  } catch {
    return {
      native,
      container: { ...imageStatus, available: false },
      ...validator,
    };
  }
}
