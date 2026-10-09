import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
interface ReaderSample {
  firstActivationMs: number;
  remainingActivationMs: number;
  initialJsBytes: number;
  activatedJsBytes: number;
  scriptSeconds: number;
  activationScriptSeconds: number;
  jsHeapUsedBytes: number;
  longTasks: number[];
  cls: number;
}
interface ReaderResult {
  framework: string;
  mode: string;
  islandsPerPlacement: number;
  placements: number;
  htmlBytes: number;
  htmlGzipBytes: number;
  cssBytes: number;
  propsBytes: number;
  samples: ReaderSample[];
}
export function summarize(values: readonly number[]) {
  if (!values.length || values.some((value) => !Number.isFinite(value)))
    throw new Error("Missing or invalid samples");
  const sorted = [...values].sort((a, b) => a - b);
  const mean =
    values.reduce((total, value) => total + value, 0) / values.length;
  return {
    samples: values.length,
    p50: sorted[Math.ceil(values.length * 0.5) - 1] ?? 0,
    p95: sorted[Math.ceil(values.length * 0.95) - 1] ?? 0,
    variance:
      values.reduce((total, value) => total + (value - mean) ** 2, 0) /
      Math.max(1, values.length - 1),
  };
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const directory = resolve(process.argv[2] ?? "benchmarks/browser");
  const run = JSON.parse(
    await readFile(resolve(directory, "samples.json"), "utf8"),
  ) as {
    complete: boolean;
    metadata: Record<string, unknown>;
    results: ReaderResult[];
  };
  if (!run.complete) throw new Error("Cannot report an incomplete reader run");
  const metrics = [
    "firstActivationMs",
    "remainingActivationMs",
    "initialJsBytes",
    "activatedJsBytes",
    "scriptSeconds",
    "activationScriptSeconds",
    "jsHeapUsedBytes",
    "cls",
  ] as const;
  const rows = run.results.flatMap((result) =>
    metrics.map((metric) => {
      const stats = summarize(result.samples.map((sample) => sample[metric]));
      return `| ${result.framework}/${result.mode}/${String(result.islandsPerPlacement)} × ${String(result.placements)} | ${metric} | ${String(stats.samples)} | ${stats.p50.toFixed(3)} | ${stats.p95.toFixed(3)} | ${stats.variance.toFixed(3)} |`;
    }),
  );
  const sizes = run.results.map(
    (result) =>
      `| ${result.framework}/${result.mode}/${String(result.islandsPerPlacement)} × ${String(result.placements)} | ${String(result.htmlBytes)} | ${String(result.htmlGzipBytes)} | ${String(result.cssBytes)} | ${String(result.propsBytes)} | ${String(result.samples.reduce((total, sample) => total + sample.longTasks.length, 0))} |`,
  );
  const markdown = `# Production reader observations\n\nTwo placements per fixture. Island counts are per placement. These are observations, not budgets or whole-system comparisons. Raw samples retain every request and long-task duration.\n\n${Object.entries(
    run.metadata,
  )
    .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
    .join(
      "\n",
    )}\n\n| Fixture | HTML bytes | HTML gzip bytes | Inline CSS bytes (included in HTML) | Logical props bytes (included in JS) | Recorded long tasks |\n| --- | --- | --- | --- | --- | --- |\n${sizes.join("\n")}\n\n| Fixture | Metric | Samples | p50 | p95 | Sample variance |\n| --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\nActivation wall times include automation, scheduling, fetch and mounting. ScriptDuration is Chromium's document-level aggregate, not a separate parse/eval measurement. Heap is document JavaScript heap after activation, without forced GC. CLS excludes shifts with recent input; activation shifts may therefore be excluded. Contexts are fresh for every observation (cold HTTP cache), after two excluded warmup contexts; framework code may be warmed in the browser process. CSS/props logical sizes overlap delivered HTML/JS and must not be added twice.\n`;
  await writeFile(resolve(directory, "report.md"), markdown);
  console.log(markdown);
}
