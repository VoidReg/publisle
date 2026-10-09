import { definitions } from "./definitions.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { compilePublication } from "../../packages/adapter-core/src/index.ts";
import { createRegistry, prepare } from "../../packages/core/src/index.ts";
import type {
  Block,
  BlockType,
  Document,
} from "../../packages/schema/src/index.ts";
import { withPreparationTimings } from "../../packages/core/src/performance.ts";
import {
  contractGraph,
  corpus,
  datasetArticle,
  distinctArticle,
  islandArticle,
  matchedMdxSource,
  matchedStaticHtml,
  repeatedArticle,
  staticArticle,
  walkContractGraph,
} from "./fixtures.ts";

const registry = createRegistry(definitions);
const article = staticArticle();
function checked(
  input: Document<Block<BlockType, unknown>> = article,
  selectedRegistry = registry,
) {
  const result = prepare(input, { registry: selectedRegistry });
  if (!result.document) throw new Error(JSON.stringify(result.diagnostics));
  return { ...result, document: result.document };
}
const worker = process.argv.includes("--worker");
if (worker) {
  const start = performance.now();
  checked();
  console.log(JSON.stringify({ preparationMs: performance.now() - start }));
} else {
  const outputArgument = process.argv.indexOf("--output");
  const output = resolve(
    outputArgument < 0
      ? "benchmarks/latest"
      : (process.argv[outputArgument + 1] ?? "benchmarks/latest"),
  );
  await mkdir(output, { recursive: true });
  const profiling = process.argv.includes("--profile");
  if (profiling) {
    const child = spawnSync(
      process.execPath,
      [
        ...process.execArgv,
        "--cpu-prof",
        `--cpu-prof-dir=${output}`,
        "--cpu-prof-name=preparation.cpuprofile",
        import.meta.filename,
        "--worker",
      ],
      { encoding: "utf8" },
    );
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(child.stderr);
    const phases = withPreparationTimings(() => checked());
    await writeFile(
      resolve(output, "phases.json"),
      JSON.stringify(phases.timings, null, 2),
    );
    console.log(JSON.stringify(phases.timings, null, 2));
  } else {
    const warmups = 5;
    const repeats = 30;
    interface Sample {
      name: string;
      unit: "ms" | "bytes";
      values: number[];
      note: string;
      warmups: number;
    }
    const environment = {
      date: new Date().toISOString(),
      node: process.version,
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      memoryMiB: Math.round(totalmem() / 2 ** 20),
      warmups,
      repeats,
      shortRepeats: 100,
      percentile: "nearest-rank",
      gzip: "zlib default",
      device: process.env["CI"]
        ? "CI runner CPU recorded, no device emulation"
        : "development machine, no pinned CPU or device profile",
    };
    const samples: Sample[] = [];
    function record(
      name: string,
      run: () => unknown,
      note: string,
      count = repeats,
    ) {
      const values: number[] = [];
      for (let i = 0; i < warmups + count; i++) {
        const start = performance.now();
        run();
        const elapsed = performance.now() - start;
        if (i >= warmups) values.push(elapsed);
      }
      samples.push({ name, unit: "ms", values, note, warmups });
      writeFileSync(
        resolve(output, "samples.json"),
        JSON.stringify({ environment, samples, complete: false }, null, 2),
      );
      console.log(`${name}: ${quantile(values, 0.5).toFixed(3)} ms`);
    }
    function bytes(name: string, value: number, note: string) {
      samples.push({ name, unit: "bytes", values: [value], note, warmups: 0 });
    }
    for (const size of [100, 1000, 10000]) {
      const input = staticArticle(size);
      record(
        `static-${String(size)} prepare reused registry`,
        () => checked(input),
        "Input and registry constructed outside timing; uncached preparation.",
      );
      record(
        `static-${String(size)} input clone`,
        () => structuredClone(input),
        "Cloning only.",
        100,
      );
    }
    record(
      "registry construction",
      () => createRegistry(definitions),
      "Includes declaration checks and registry identity.",
      100,
    );
    record(
      "static-1000 prepare new registry",
      () => checked(article, createRegistry(definitions)),
      "Registry construction plus uncached preparation.",
    );
    record(
      "static-1000 repeated same input",
      () => checked(article),
      "Repeated uncached preparation; no memoization.",
    );
    record(
      "static-1000 fixture construction",
      () => staticArticle(),
      "Authoring helpers and fixture creation only.",
      100,
    );
    record(
      "static-1000 end-to-end",
      () =>
        compilePublication(
          checked(structuredClone(staticArticle()), createRegistry(definitions))
            .document,
        ),
      "Fixture construction, cloning, registry construction, preparation and serialization.",
    );
    const prepared = checked().document;
    record(
      "static-1000 publication serialization",
      () => compilePublication(prepared),
      "Already prepared document.",
      100,
    );
    const publication = compilePublication(prepared);
    const matched = matchedStaticHtml();
    bytes(
      "publisle static html",
      Buffer.byteLength(publication.html),
      "Publication HTML only.",
    );
    bytes(
      "publisle static html gzip",
      gzipSync(publication.html).length,
      "Default zlib compression.",
    );
    bytes(
      "matched static html",
      Buffer.byteLength(matched),
      "Handwritten HTML for the same sentences; no competing compiler.",
    );
    bytes(
      "matched static html gzip",
      gzipSync(matched).length,
      "Default zlib compression.",
    );
    bytes(
      "matched mdx source",
      Buffer.byteLength(matchedMdxSource()),
      "Source only; MDX compilation is unsupported.",
    );
    const fixtures = {
      "islands-5": islandArticle(),
      "repeated-100": repeatedArticle(),
      "distinct-20": distinctArticle(),
      "inline-code-100kb": datasetArticle(),
    };
    const snapshots: Record<string, unknown> = {
      static: { input: article, result: checked(), publication },
    };
    for (const [name, input] of Object.entries(fixtures)) {
      record(
        `${name} prepare`,
        () => checked(input),
        "Uncached preparation only; cloning, mounting and serialization excluded.",
      );
      const result = checked(input);
      const compiled = compilePublication(result.document);
      snapshots[name] = { input, result, publication: compiled };
      bytes(
        `${name} html`,
        Buffer.byteLength(compiled.html),
        "HTML only; excludes host bundles and network delivery.",
      );
    }
    await writeFile(
      resolve(output, "snapshots.json"),
      JSON.stringify(snapshots, null, 2),
    );
    const documents = corpus();
    record(
      "corpus-10000 prepare",
      () => {
        for (const input of documents) checked(input);
      },
      "Sequential whole-corpus elapsed time; reused registry.",
    );
    const graph = contractGraph();
    record(
      "contract-graph-1000 walk",
      () => {
        if (walkContractGraph(graph) !== 1000)
          throw new Error("Incomplete graph");
      },
      "Identity and edge checks only; no schema compilation.",
      100,
    );
    const cold: number[] = [];
    const processElapsed: number[] = [];
    for (let i = 0; i < repeats; i++) {
      const start = performance.now();
      const child = spawnSync(
        process.execPath,
        [...process.execArgv, import.meta.filename, "--worker"],
        { encoding: "utf8" },
      );
      if (child.error) throw child.error;
      if (child.status !== 0) throw new Error(child.stderr);
      processElapsed.push(performance.now() - start);
      cold.push(
        (JSON.parse(child.stdout) as { preparationMs: number }).preparationMs,
      );
    }
    samples.push({
      name: "static-1000 process-cold prepare",
      unit: "ms",
      values: cold,
      warmups: 0,
      note: "First prepare in each fresh process; registry and fixture already constructed.",
    });
    samples.push({
      name: "static-1000 process start-to-exit",
      unit: "ms",
      values: processElapsed,
      warmups: 0,
      note: "Parent elapsed time including process startup, imports, registry, fixture and first preparation.",
    });
    await writeFile(
      resolve(output, "samples.json"),
      JSON.stringify({ environment, samples, complete: true }, null, 2),
    );
    await writeFile(
      resolve(output, "snapshots.json"),
      JSON.stringify(snapshots, null, 2),
    );
    const corpusSample = samples.find(
      (sample) => sample.name === "corpus-10000 prepare",
    );
    if (!corpusSample) throw new Error("Missing corpus measurement");
    const markdown = `# Preparation performance measurements\n\nThese measurements establish preparation and serialization costs, not comparative whole-system speed or performance budgets. The static fixture demonstrates negligible HTML size overhead.\n\nRegenerate with \`node tools/benchmarks/measure.ts\`. This rewrites this report and retains raw samples and correctness snapshots in \`benchmarks/latest/\` (ignored). Profile separately with \`node tools/benchmarks/measure.ts --profile\`.\n\n## Conditions\n\n${Object.entries(
      environment,
    )
      .map(([key, value]) => `- ${key}: ${String(value)}`)
      .join(
        "\n",
      )}\n- Warmups are excluded. Each workload records its own count; cold processes have no warmups.\n- p50/p95 use nearest rank; variance is sample variance in squared units. Byte rows are deterministic single observations.\n- Corpus throughput at median elapsed time: ${(10000 / (quantile(corpusSample.values, 0.5) / 1000)).toFixed(1)} documents/second.\n\n## Results\n\n| Workload | Samples | p50 | p95 | Variance | Boundary |\n| --- | --- | --- | --- | --- | --- |\n${samples.map((sample) => `| ${sample.name} | ${String(sample.values.length)} | ${quantile(sample.values, 0.5).toFixed(3)} ${sample.unit} | ${quantile(sample.values, 0.95).toFixed(3)} ${sample.unit} | ${variance(sample.values).toFixed(3)} | ${sample.note} |`).join("\n")}\n\n## Profiling findings\n\nThe [preparation analysis](performance-analysis.md) records the optimization and its before/after evidence. Canonical JSON byte accounting now avoids buffer allocations for small emitted fragments and retains native encoding for large strings. Declaration validation, JSON bounds and identity semantics remain unchanged.\n\n## Limits\n\n- Repeated prepare is uncached. Host-cache hits and incremental preparation are not implemented or measured.\n- HTML sizes exclude CSS, JavaScript, island props delivered separately, requests, activation latency and reader memory.\n- Repeated paragraphs compress unusually well; mixed-content size comparisons remain follow-up work.\n- Inline code text is not fetched dataset delivery. Island preparation does not measure browser mounting or selective bundle loading.\n- MDX compilation, other publishing toolchains and browser delivery measurements remain unsupported.\n- Timing variability reflects this machine and execution order; cold processes are reported separately from warmed workloads.\n`;
    const { format } = await import("prettier");
    await writeFile(
      resolve(output, "report.md"),
      await format(markdown, { parser: "markdown" }),
    );
    if (!process.env["CI"])
      await writeFile(
        "docs/standards/performance.md",
        await format(markdown, { parser: "markdown" }),
      );
  }
}
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? 0;
}
function variance(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return (
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(values.length - 1, 1)
  );
}
