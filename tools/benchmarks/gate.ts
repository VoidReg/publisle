/** Compare calibration observations with the accepted budgets. This does not invent caps. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { summarize } from "./report.ts";

export interface BudgetCaps {
  readonly timingP95Ms: Readonly<Record<string, number>>;
  readonly bytes: Readonly<Record<string, number>>;
}

export interface MetricObservation {
  readonly name: string;
  readonly kind: "timing" | "bytes";
  readonly value: number;
  readonly samples?: number;
}

export interface BudgetFinding {
  readonly name: string;
  readonly kind: "timing" | "bytes";
  readonly status: "pass" | "fail" | "noisy" | "retry";
  readonly observed: number;
  readonly cap: number;
  readonly rerun?: number;
  readonly reason?: string;
}

export interface BudgetReport {
  readonly status: "pass" | "fail" | "noisy" | "retry";
  readonly findings: readonly BudgetFinding[];
}

export function preparationCaps(caps: BudgetCaps): BudgetCaps {
  return {
    timingP95Ms: pick(
      caps.timingP95Ms,
      (name) => !name.includes("ActivationMs"),
    ),
    bytes: pick(caps.bytes, (name) => !name.includes("/")),
  };
}

export function readerCaps(caps: BudgetCaps): BudgetCaps {
  return {
    timingP95Ms: pick(caps.timingP95Ms, (name) =>
      name.includes("ActivationMs"),
    ),
    bytes: pick(caps.bytes, (name) => name.includes("/")),
  };
}

export function judgeMetrics(
  observations: readonly MetricObservation[],
  caps: BudgetCaps,
  options: {
    readonly enforceTiming: boolean;
    readonly requireComplete: boolean;
    readonly rerun?: readonly MetricObservation[];
  },
): BudgetReport {
  const findings: BudgetFinding[] = [];
  const consider = (
    kind: "timing" | "bytes",
    table: Readonly<Record<string, number>>,
  ) => {
    if (kind === "timing" && !options.enforceTiming) return;
    for (const [name, cap] of Object.entries(table)) {
      const observed = observations.find(
        (entry) => entry.name === name && entry.kind === kind,
      );
      if (!observed) {
        if (options.requireComplete)
          findings.push({
            name,
            kind,
            status: "fail",
            observed: Number.NaN,
            cap,
            reason: "missing",
          });
        continue;
      }
      if (!Number.isFinite(observed.value)) {
        findings.push({
          name,
          kind,
          status: "fail",
          observed: observed.value,
          cap,
          reason: "invalid",
        });
        continue;
      }
      if (kind === "bytes") {
        findings.push({
          name,
          kind,
          status: observed.value > cap ? "fail" : "pass",
          observed: observed.value,
          cap,
        });
        continue;
      }
      if ((observed.samples ?? 30) < 30) {
        findings.push({
          name,
          kind,
          status: "fail",
          observed: observed.value,
          cap,
          reason: "short-run",
        });
        continue;
      }
      const second = options.rerun?.find(
        (entry) => entry.name === name && entry.kind === kind,
      );
      const over = timingOver(observed.value, cap);
      if (!options.rerun) {
        findings.push({
          name,
          kind,
          status: over ? "retry" : "pass",
          observed: observed.value,
          cap,
        });
        continue;
      }
      if (
        !second ||
        !Number.isFinite(second.value) ||
        (second.samples ?? 30) < 30
      ) {
        findings.push({
          name,
          kind,
          status: "fail",
          observed: observed.value,
          cap,
          reason: "incomplete-rerun",
        });
        continue;
      }
      const rerunOver = timingOver(second.value, cap);
      findings.push({
        name,
        kind,
        status:
          over && rerunOver ? "fail" : over || rerunOver ? "noisy" : "pass",
        observed: observed.value,
        rerun: second.value,
        cap,
      });
    }
  };
  consider("bytes", caps.bytes);
  consider("timing", caps.timingP95Ms);
  return { status: overall(findings), findings };
}

/** Caps are whole milliseconds, so a p95 is over only once it reaches the next millisecond. */
function timingOver(value: number, cap: number): boolean {
  return value >= cap + 1;
}

function overall(findings: readonly BudgetFinding[]): BudgetReport["status"] {
  if (findings.some((finding) => finding.status === "fail")) return "fail";
  if (findings.some((finding) => finding.status === "noisy")) return "noisy";
  if (findings.some((finding) => finding.status === "retry")) return "retry";
  return "pass";
}

function pick(
  table: Readonly<Record<string, number>>,
  include: (name: string) => boolean,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(table).filter(([name]) => include(name)),
  );
}

interface PreparationRun {
  complete: boolean;
  samples: { name: string; unit: string; values: number[] }[];
}
interface ReaderSample {
  firstActivationMs: number;
  remainingActivationMs: number;
  initialRequests: string[];
  requests: string[];
  initialJsBytes: number;
  activatedJsBytes: number;
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
  assets: { fileName: string; gzipBytes: number }[];
  samples: ReaderSample[];
}
interface ReaderRun {
  complete: boolean;
  metadata: { repetitions: number };
  results: ReaderResult[];
}

export function preparationObservations(
  run: PreparationRun,
): MetricObservation[] {
  if (!run.complete)
    throw new Error("Incomplete preparation run cannot be gated");
  return run.samples.flatMap((sample): MetricObservation[] => {
    if (sample.unit === "ms")
      return [
        {
          name: sample.name,
          kind: "timing" as const,
          value: summarize(sample.values).p95,
          samples: sample.values.length,
        },
      ];
    if (sample.unit === "bytes")
      return [
        {
          name: sample.name,
          kind: "bytes" as const,
          value: Math.max(...sample.values),
          samples: sample.values.length,
        },
      ];
    return [];
  });
}

export function readerObservations(run: ReaderRun): MetricObservation[] {
  if (!run.complete) throw new Error("Incomplete reader run cannot be gated");
  const observations: MetricObservation[] = [];
  for (const result of run.results) {
    const prefix = `${result.framework}/${result.mode}/${String(result.islandsPerPlacement)} × ${String(result.placements)}`;
    const timing = (metric: "firstActivationMs" | "remainingActivationMs") => {
      const values = result.samples.map((sample) => sample[metric]);
      observations.push({
        name: `${prefix} ${metric}`,
        kind: "timing",
        value: summarize(values).p95,
        samples: values.length,
      });
    };
    timing("firstActivationMs");
    timing("remainingActivationMs");
    const bytes = (name: string, value: number) =>
      observations.push({
        name: `${prefix} ${name}`,
        kind: "bytes",
        value,
        samples: 1,
      });
    bytes("htmlBytes", result.htmlBytes);
    bytes("htmlGzipBytes", result.htmlGzipBytes);
    bytes("cssBytes", result.cssBytes);
    bytes("propsBytes", result.propsBytes);
    const sampleBytes = (name: string, values: number[]) =>
      observations.push({
        name: `${prefix} ${name}`,
        kind: "bytes",
        value: Math.max(...values),
        samples: values.length,
      });
    sampleBytes(
      "initialJsBytes",
      result.samples.map((sample) => sample.initialJsBytes),
    );
    sampleBytes(
      "activatedJsBytes",
      result.samples.map((sample) => sample.activatedJsBytes),
    );
    const gzip = (paths: readonly string[]) =>
      result.assets
        .filter(
          (asset) =>
            asset.fileName.endsWith(".js") &&
            paths.includes(`/${asset.fileName}`),
        )
        .reduce((total, asset) => total + asset.gzipBytes, 0);
    sampleBytes(
      "initialJsGzipBytes",
      result.samples.map((sample) => gzip(sample.initialRequests)),
    );
    sampleBytes(
      "activatedJsGzipBytes",
      result.samples.map((sample) => gzip(sample.requests)),
    );
  }
  return observations;
}

export function parseBudgetCaps(value: unknown): BudgetCaps {
  if (
    !value ||
    typeof value !== "object" ||
    !("timingP95Ms" in value) ||
    !("bytes" in value)
  )
    throw new Error("Budget file must contain timingP95Ms and bytes");
  const timing = (value as { timingP95Ms: unknown }).timingP95Ms;
  const bytes = (value as { bytes: unknown }).bytes;
  return {
    timingP95Ms: finiteTable(timing, "timing"),
    bytes: finiteTable(bytes, "bytes"),
  };
}

function finiteTable(value: unknown, label: string): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Budget ${label} must be an object`);
  const table: Record<string, number> = {};
  for (const [name, cap] of Object.entries(value)) {
    if (typeof cap !== "number" || !Number.isSafeInteger(cap) || cap <= 0)
      throw new Error(
        `Budget ${label} cap for ${name} must be a positive integer`,
      );
    table[name] = cap;
  }
  return table;
}

export function gateExitCode(status: BudgetReport["status"]): number {
  if (status === "pass" || status === "noisy") return 0;
  if (status === "retry") return 2;
  return 1;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const scope = argument("--scope");
  const input = argument("--input");
  const rerun = argument("--rerun");
  if ((scope !== "preparation" && scope !== "reader") || !input)
    throw new Error(
      "Usage: gate.ts --scope preparation|reader --input <dir> [--rerun <dir>] [--enforce-reader-timing]",
    );
  const caps = parseBudgetCaps(
    JSON.parse(
      await readFile(
        resolve(
          argument("--budgets") ?? "tools/benchmarks/accepted-budgets.json",
        ),
        "utf8",
      ),
    ),
  );
  const selected =
    scope === "preparation" ? preparationCaps(caps) : readerCaps(caps);
  const load = async (directory: string) =>
    JSON.parse(await readFile(resolve(directory, "samples.json"), "utf8")) as
      PreparationRun | ReaderRun;
  const primary = await load(input);
  const second = rerun ? await load(rerun) : undefined;
  const observations =
    scope === "preparation"
      ? preparationObservations(primary as PreparationRun)
      : readerObservations(primary as ReaderRun);
  const rerunObservations = second
    ? scope === "preparation"
      ? preparationObservations(second as PreparationRun)
      : readerObservations(second as ReaderRun)
    : undefined;
  const report = judgeMetrics(observations, selected, {
    enforceTiming:
      scope === "preparation" ||
      process.argv.includes("--enforce-reader-timing"),
    requireComplete:
      scope === "preparation" ||
      process.argv.includes("--enforce-reader-timing"),
    ...(rerunObservations ? { rerun: rerunObservations } : {}),
  });
  const notable = report.findings.filter(
    (finding) => finding.status !== "pass",
  );
  console.log(
    JSON.stringify(
      { status: report.status, findings: notable },
      (_, value: unknown) =>
        typeof value === "number" && !Number.isFinite(value) ? null : value,
      2,
    ),
  );
  process.exitCode = gateExitCode(report.status);
}
