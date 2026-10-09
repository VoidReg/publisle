/** Produce reviewable proposals; this command never enforces thresholds. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { summarize } from "./report.ts";

export function timingProposal(runs: readonly (readonly number[])[]) {
  if (runs.length < 3 || runs.some((values) => values.length < 30))
    throw new Error(
      "Timing proposals require three complete runs of at least 30 samples",
    );
  const summaries = runs.map(summarize);
  const observedP50 = Math.max(...summaries.map((summary) => summary.p50));
  const observedP95 = Math.max(...summaries.map((summary) => summary.p95));
  const variance = Math.max(...summaries.map((summary) => summary.variance));
  // Conservative review heuristic, not a confidence interval or a probability claim.
  const proposedCap = Math.ceil(observedP95 + 2 * Math.sqrt(variance));
  return { observedP50, observedP95, variance, proposedCap };
}
interface PreparationRun {
  complete: boolean;
  environment: {
    node: string;
    cpu: string;
    warmups: number;
    repeats: number;
    shortRepeats: number;
    gzip: string;
  };
  samples: { name: string; unit: string; values: number[] }[];
}
interface ReaderRun {
  complete: boolean;
  metadata: {
    node: string;
    browser: string;
    repetitions: number;
    gzipLevel: number;
  };
  results: {
    framework: string;
    mode: string;
    islandsPerPlacement: number;
    placements: number;
    htmlBytes: number;
    htmlGzipBytes: number;
    cssBytes: number;
    propsBytes: number;
    assets: { fileName: string; gzipBytes: number }[];
    samples: {
      initialRequests: string[];
      requests: string[];
      firstActivationMs: number;
      remainingActivationMs: number;
      initialJsBytes: number;
      activatedJsBytes: number;
    }[];
  }[];
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const directories = process.argv
    .slice(2)
    .map((directory) => resolve(directory));
  if (directories.length < 3)
    throw new Error(
      "Provide at least three full calibration artifact directories",
    );
  const commits = await Promise.all(
    directories.map((directory) =>
      readFile(resolve(directory, "commit.txt"), "utf8"),
    ),
  );
  const inputs = await Promise.all(
    directories.map((directory) =>
      readFile(resolve(directory, "inputs.sha256"), "utf8"),
    ),
  );
  if (new Set(commits).size !== 1 || new Set(inputs).size !== 1)
    throw new Error("Calibration source/input revisions differ");
  const preparation: PreparationRun[] = [];
  const reader: ReaderRun[] = [];
  for (const directory of directories) {
    preparation.push(
      JSON.parse(
        await readFile(resolve(directory, "preparation/samples.json"), "utf8"),
      ) as PreparationRun,
    );
    reader.push(
      JSON.parse(
        await readFile(resolve(directory, "reader/samples.json"), "utf8"),
      ) as ReaderRun,
    );
  }
  if (
    preparation.some((run) => !run.complete) ||
    reader.some((run) => !run.complete || run.metadata.repetitions < 30)
  )
    throw new Error("Incomplete or smoke calibration cannot establish budgets");
  if (
    new Set(
      preparation.map((run) =>
        JSON.stringify([
          run.environment.node,
          run.environment.warmups,
          run.environment.repeats,
          run.environment.shortRepeats,
          run.environment.gzip,
        ]),
      ),
    ).size > 1 ||
    new Set(
      reader.map((run) =>
        JSON.stringify([
          run.metadata.node,
          run.metadata.browser,
          run.metadata.repetitions,
          run.metadata.gzipLevel,
        ]),
      ),
    ).size > 1
  )
    throw new Error(
      "Software/sampling configurations differ; recalibrate before proposing budgets",
    );
  const timingRows: string[] = [];
  for (const sample of preparation[0]?.samples ?? []) {
    if (sample.unit !== "ms") continue;
    const runs = preparation.map((run) => {
      const entry = run.samples.find(
        (candidate) => candidate.name === sample.name,
      );
      if (!entry) throw new Error(`Missing workload: ${sample.name}`);
      return entry.values;
    });
    const proposal = timingProposal(runs);
    timingRows.push(
      `| ${sample.name} | ${proposal.observedP50.toFixed(3)} | ${proposal.observedP95.toFixed(3)} | ${proposal.variance.toFixed(3)} | ${String(proposal.proposedCap)} |`,
    );
  }
  const byteRows: string[] = [];
  const byteRow = (name: string, values: number[]) => {
    if (
      !values.length ||
      values.some((value) => !Number.isFinite(value) || value < 0)
    )
      throw new Error(`Invalid byte measurements: ${name}`);
    const maximum = Math.max(...values),
      minimum = Math.min(...values);
    const cap = Math.ceil(
      maximum + Math.max(maximum - minimum, maximum * 0.01),
    );
    byteRows.push(
      `| ${name} | ${String(minimum)} | ${String(maximum)} | ${String(cap)} |`,
    );
  };
  for (const sample of preparation[0]?.samples ?? []) {
    if (sample.unit !== "bytes" || sample.name.startsWith("matched")) continue;
    const values = preparation.flatMap((run) => {
      const entry = run.samples.find(
        (candidate) => candidate.name === sample.name,
      );
      if (!entry) throw new Error(`Missing byte workload: ${sample.name}`);
      return entry.values;
    });
    byteRow(sample.name, values);
  }
  for (const fixture of reader[0]?.results ?? []) {
    const name = `${fixture.framework}/${fixture.mode}/${String(fixture.islandsPerPlacement)} × ${String(fixture.placements)}`;
    const matches = reader.map((run) => {
      const entry = run.results.find(
        (candidate) =>
          candidate.framework === fixture.framework &&
          candidate.mode === fixture.mode &&
          candidate.islandsPerPlacement === fixture.islandsPerPlacement &&
          candidate.placements === fixture.placements,
      );
      if (!entry) throw new Error(`Missing reader fixture: ${name}`);
      return entry;
    });
    for (const metric of [
      "firstActivationMs",
      "remainingActivationMs",
    ] as const) {
      const proposal = timingProposal(
        matches.map((entry) => entry.samples.map((sample) => sample[metric])),
      );
      timingRows.push(
        `| ${name} ${metric} | ${proposal.observedP50.toFixed(3)} | ${proposal.observedP95.toFixed(3)} | ${proposal.variance.toFixed(3)} | ${String(proposal.proposedCap)} |`,
      );
    }
    for (const metric of [
      "htmlBytes",
      "htmlGzipBytes",
      "cssBytes",
      "propsBytes",
      "initialJsBytes",
      "activatedJsBytes",
    ] as const) {
      const values = matches.flatMap((entry) =>
        metric === "initialJsBytes" || metric === "activatedJsBytes"
          ? entry.samples.map((sample) => sample[metric])
          : [entry[metric]],
      );
      byteRow(`${name} ${metric}`, values);
    }
    for (const [metric, pathsKey] of [
      ["initialJsGzipBytes", "initialRequests"],
      ["activatedJsGzipBytes", "requests"],
    ] as const) {
      const values = matches.flatMap((entry) =>
        entry.samples.map((sample) =>
          entry.assets
            .filter(
              (asset) =>
                asset.fileName.endsWith(".js") &&
                sample[pathsKey].includes(`/${asset.fileName}`),
            )
            .reduce((total, asset) => total + asset.gzipBytes, 0),
        ),
      );
      byteRow(`${name} ${metric}`, values);
    }
  }
  const markdown = `# Proposed CI performance budgets — awaiting review\n\nInputs: ${directories.map((directory) => `\`${directory}\``).join(", ")}. CPU models: ${preparation.map((run) => run.environment.cpu).join("; ")}. Node ${preparation[0]?.environment.node ?? "unknown"}; Chromium ${reader[0]?.metadata.browser ?? "unknown"}. These values are proposals only, with no enforcement.\n\nTiming caps use the largest observed run p95 plus twice the largest run standard deviation, rounded upward to whole milliseconds. This is conservative headroom for review, not a confidence interval. Byte caps use the largest observation plus the larger of observed spread or 1% as an explicit small review allowance beyond observed identifier/compression variation. Review each allowance before acceptance.\n\n| Workload | Largest run p50 ms | Largest run p95 ms | Largest run sample variance ms² | Proposed p95 cap ms |\n| --- | --- | --- | --- | --- |\n${timingRows.join("\n")}\n\n| Reader fixture/metric | Observed min bytes | Observed max bytes | Proposed cap bytes |\n| --- | --- | --- | --- |\n${byteRows.join("\n")}\n\nThree independent runner repetitions are calibration evidence, not proof of stable tail latency. Smoke runs cannot produce this proposal. Script, heap, long tasks and CLS remain observations. CSS and props overlap HTML/JS. An accepted deterministic breach fails immediately; timing gets one clean rerun, with both results preserved. Noisy disagreement stays in the log and does not fail the job. A breach that is present in both runs fails. No cap is raised automatically.\n`;
  const destination = resolve(
    directories[0] ?? "benchmarks/calibration",
    "budget-proposal.md",
  );
  await writeFile(destination, markdown);
  console.log(destination);
}
