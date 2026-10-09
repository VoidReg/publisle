/** Real production builds, unthrottled desktop Chromium; no invented device labels. */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cpus, totalmem } from "node:os";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright-core";
import { fourierHost } from "./fourier-host.ts";

const outputIndex = process.argv.indexOf("--output");
const output = resolve(
  outputIndex < 0
    ? "benchmarks/browser"
    : (process.argv[outputIndex + 1] ?? "benchmarks/browser"),
);
const smoke = process.argv.includes("--smoke");
const repetitions = smoke ? 3 : 30;
const executablePath =
  process.env["PUBLISLE_BROWSER_PATH"] ??
  (!process.env["CI"] && existsSync("/usr/bin/google-chrome")
    ? "/usr/bin/google-chrome"
    : undefined);
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ["--no-sandbox"],
});
const results: unknown[] = [];
const metadata = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpu: cpus()[0]?.model,
  memory: totalmem(),
  browser: browser.version(),
  repetitions,
  warmups: 2,
  gzipLevel: 6,
  percentile: "nearest rank",
  variance: "sample variance",
  device:
    "Actual host, unthrottled desktop Chromium; no simulated mobile devices",
  concurrency: 1,
  unsupported: [
    "MDX compiler and structured-publishing comparators not installed or measured",
    "Separate parse versus evaluation attribution (ScriptDuration aggregates script work)",
    "Whole browser/process memory; recorded heap is Chromium document JS heap only",
    "Host cache hit and incremental rebuilds (uncached baseline only)",
    "Twenty distinct production island implementations; preparation fixture is synthetic",
    "External dataset delivery; sized preparation fixture is inline code",
  ],
};
await mkdir(output, { recursive: true });
const checkpoint = async (complete: boolean) =>
  writeFile(
    resolve(output, "samples.json"),
    JSON.stringify({ complete, metadata, results }, null, 2) + "\n",
  );
try {
  for (const framework of ["react", "svelte"] as const)
    for (const mode of ["native", "artifact"] as const)
      for (const islands of smoke ? [1] : [1, 5, 100]) {
        await fourierHost({
          framework,
          mode,
          islands,
          browser: async (fixture) => {
            const forbidden = fixture.modules.filter((id) =>
              /\/packages\/(?:schema|core|contracts|markdown|block-sdk)\/|\/blocks\/(?:core|technical)\/|\/node_modules\/(?:\.pnpm\/)?ajv(?:@|\/)/u.test(
                id,
              ),
            );
            if (forbidden.length)
              throw new Error(`Reader tooling leaked: ${forbidden.join(", ")}`);
            const implementationChunks = fixture.chunks
              .filter((chunk) =>
                chunk.modules.some((id) =>
                  id.includes("fourier-demo/src/PartialSum"),
                ),
              )
              .map((chunk) => `/${chunk.fileName}`);
            const samples = [];
            let htmlBytes = 0,
              htmlGzipBytes = 0,
              cssBytes = 0;
            for (let run = -2; run < repetitions; run++) {
              const context = await browser.newContext();
              try {
                const page = await context.newPage();
                const requests: string[] = [];
                const errors: string[] = [];
                page.on("request", (request) =>
                  requests.push(new URL(request.url()).pathname),
                );
                page.on("pageerror", (error) => errors.push(error.message));
                await page.addInitScript(() => {
                  const records = {
                    longTasks: [] as number[],
                    layoutShifts: [] as number[],
                  };
                  Object.assign(window, { __metrics: records });
                  new PerformanceObserver((list) => {
                    for (const entry of list.getEntries())
                      records.longTasks.push(entry.duration);
                  }).observe({ type: "longtask", buffered: true });
                  new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                      const shift = entry as PerformanceEntry & {
                        value: number;
                        hadRecentInput: boolean;
                      };
                      if (!shift.hadRecentInput)
                        records.layoutShifts.push(shift.value);
                    }
                  }).observe({ type: "layout-shift", buffered: true });
                });
                const cdp = await context.newCDPSession(page);
                await cdp.send("Performance.enable");
                const response = await page.goto(fixture.url);
                if (!response) throw new Error("Missing document response");
                const html = await response.text();
                htmlBytes = Buffer.byteLength(html);
                htmlGzipBytes = gzipSync(html, { level: 6 }).byteLength;
                cssBytes = Buffer.byteLength(
                  /<style>([\s\S]*?)<\/style>/u.exec(html)?.[1] ?? "",
                );
                await page.waitForFunction(
                  () =>
                    (window as unknown as { __fixtureReady: boolean })
                      .__fixtureReady,
                );
                const initialRequests = [...requests];
                if (
                  initialRequests.some((path) =>
                    implementationChunks.includes(path),
                  )
                )
                  throw new Error(
                    "Island implementation requested before activation",
                  );
                const before = await cdp.send("Performance.getMetrics");
                const started = performance.now();
                await page.locator("[data-publisle-activate]").first().focus();
                await page.keyboard.press("Enter");
                await page.locator('[role="status"]').first().waitFor();
                const firstActivationMs = performance.now() - started;
                const allStarted = performance.now();
                await page
                  .locator("[data-publisle-activate]")
                  .evaluateAll((elements) => {
                    elements.slice(1).forEach((element) => {
                      (element as HTMLElement).click();
                    });
                  });
                await page.waitForFunction(
                  (count) =>
                    document.querySelectorAll('[role="status"]').length ===
                    count,
                  islands * 2,
                );
                const remainingActivationMs = performance.now() - allStarted;
                await page.evaluate(
                  () =>
                    new Promise<void>((done) =>
                      requestAnimationFrame(() =>
                        requestAnimationFrame(() => {
                          done();
                        }),
                      ),
                    ),
                );
                const after = await cdp.send("Performance.getMetrics");
                const metrics = await page.evaluate(
                  () =>
                    (
                      window as unknown as {
                        __metrics: {
                          longTasks: number[];
                          layoutShifts: number[];
                        };
                      }
                    ).__metrics,
                );
                const metric = (values: typeof before, name: string) =>
                  values.metrics.find((entry) => entry.name === name)?.value ??
                  0;
                const delivered = (paths: readonly string[]) =>
                  fixture.assets.filter((asset) =>
                    paths.includes(`/${asset.fileName}`),
                  );
                if (errors.length) throw new Error(errors.join("\n"));
                if (run >= 0)
                  samples.push({
                    firstActivationMs,
                    remainingActivationMs,
                    initialRequests,
                    requests,
                    initialJsBytes: delivered(initialRequests)
                      .filter((asset) => asset.fileName.endsWith(".js"))
                      .reduce((total, asset) => total + asset.bytes, 0),
                    activatedJsBytes: delivered(requests)
                      .filter((asset) => asset.fileName.endsWith(".js"))
                      .reduce((total, asset) => total + asset.bytes, 0),
                    scriptSeconds: metric(after, "ScriptDuration"),
                    activationScriptSeconds:
                      metric(after, "ScriptDuration") -
                      metric(before, "ScriptDuration"),
                    taskSeconds: metric(after, "TaskDuration"),
                    jsHeapUsedBytes: metric(after, "JSHeapUsedSize"),
                    longTasks: metrics.longTasks,
                    cls: metrics.layoutShifts.reduce(
                      (total, value) => total + value,
                      0,
                    ),
                  });
              } finally {
                await context.close();
              }
            }
            results.push({
              framework,
              mode,
              islandsPerPlacement: islands,
              placements: 2,
              htmlBytes,
              htmlGzipBytes,
              cssBytes,
              propsBytes: fixture.propsBytes,
              assets: fixture.assets,
              accounting: fixture.accounting,
              implementationChunks,
              samples,
            });
            await checkpoint(false);
            console.log(
              `${framework}/${mode}/${String(islands)}: ${String(repetitions)} samples saved`,
            );
          },
        });
      }
  await checkpoint(true);
} finally {
  await browser.close();
}
