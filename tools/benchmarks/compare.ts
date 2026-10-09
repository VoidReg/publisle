import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deepStrictEqual } from "node:assert";
import { createRegistry, prepare } from "../../packages/core/src/index.ts";
import { compilePublication } from "../../packages/adapter-core/src/index.ts";
import type {
  Document,
  Block,
  BlockType,
  PrepareResult,
} from "../../packages/schema/src/index.ts";
import { definitions } from "./definitions.ts";

const before = resolve(process.argv[2] ?? "benchmarks/before");
const after = resolve(process.argv[3] ?? "benchmarks/latest");
interface Snapshot {
  input: Document<Block<BlockType, unknown>>;
  result: PrepareResult;
  publication: unknown;
}
const snapshots = JSON.parse(
  await readFile(resolve(before, "snapshots.json"), "utf8"),
) as Record<string, Snapshot>;
const registry = createRegistry(definitions);
for (const [name, snapshot] of Object.entries(snapshots)) {
  const input = snapshot.input;
  const result = prepare(input, { registry });
  deepStrictEqual(
    result,
    snapshot.result,
    `${name}: prepared output/diagnostics/identities changed`,
  );
  if (!result.document) throw new Error(`${name}: preparation failed`);
  deepStrictEqual(
    compilePublication(result.document),
    snapshot.publication,
    `${name}: publication changed`,
  );
}
interface Measurements {
  complete: boolean;
  environment: Record<string, unknown>;
  samples: { name: string; unit: string; values: number[] }[];
}
const old = JSON.parse(
  await readFile(resolve(before, "samples.json"), "utf8"),
) as Measurements;
const current = JSON.parse(
  await readFile(resolve(after, "samples.json"), "utf8"),
) as Measurements;
if (!old.complete || !current.complete)
  throw new Error("Cannot compare incomplete benchmark runs");
for (const key of [
  "node",
  "cpu",
  "logicalCpus",
  "warmups",
  "repeats",
  "shortRepeats",
  "percentile",
  "gzip",
]) {
  deepStrictEqual(
    current.environment[key],
    old.environment[key],
    `Benchmark conditions differ: ${key}`,
  );
}
function median(values: number[]) {
  return (
    [...values].sort((a, b) => a - b)[Math.ceil(values.length / 2) - 1] ?? 0
  );
}
const rows = current.samples.flatMap((sample) => {
  if (sample.unit !== "ms") return [];
  const previous = old.samples.find((entry) => entry.name === sample.name);
  if (!previous) return [];
  const a = median(previous.values),
    b = median(sample.values);
  return [
    `| ${sample.name} | ${a.toFixed(3)} | ${b.toFixed(3)} | ${((b / a - 1) * 100).toFixed(1)}% |`,
  ];
});
const markdown = `# Preparation optimization comparison\n\nAll ${String(Object.keys(snapshots).length)} baseline fixtures retain exactly the same prepared output, diagnostics, identities and publication output when replayed with their original IDs.\n\nBefore: ${String(old.environment["date"])}. After: ${String(current.environment["date"])}. Both runs use the same harness and environment settings, five excluded warmups, 30 preparation samples and 100 short-operation samples. Values are uninstrumented nearest-rank medians. This is a development-machine comparison, not a performance guarantee.\n\n| Operation | Before ms | After ms | Change |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`;
await writeFile(resolve(after, "comparison.md"), markdown);
console.log(markdown);
