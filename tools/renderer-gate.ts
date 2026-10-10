import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPlainObject, parseJson } from "../packages/schema/src/index.ts";

const required = [
  "matches the shared migration fixtures exactly",
  "Python independently preserves the shared static rendering semantics",
  "matches shared migration, fallback and refusal outcomes in independent Python and TypeScript",
  "matches shared citation markers, references, classifications and capabilities in independent Python and citeproc-js",
] as const;

export function verifyRendererEvidence(report: unknown): void {
  if (!isPlainObject(report) || !Array.isArray(report["testResults"]))
    throw new Error("Missing renderer parity evidence");
  const passing = new Set<string>();
  for (const suite of report["testResults"] as unknown[]) {
    if (!isPlainObject(suite) || !Array.isArray(suite["assertionResults"]))
      throw new Error("Malformed renderer parity suite");
    for (const assertion of suite["assertionResults"] as unknown[]) {
      if (
        !isPlainObject(assertion) ||
        assertion["status"] !== "passed" ||
        typeof assertion["fullName"] !== "string"
      )
        throw new Error(
          "Renderer parity requires passing evidence; skipped tests fail",
        );
      passing.add(assertion["fullName"]);
    }
  }
  for (const title of required)
    if (![...passing].some((name) => name.endsWith(title)))
      throw new Error(`Missing renderer parity evidence: ${title}`);
}

async function main(): Promise<void> {
  const temporary = await mkdtemp(join(tmpdir(), "publisle-renderer-gate-"));
  try {
    execFileSync(process.execPath, ["tools/generate-citation-corpus.ts"], {
      stdio: "inherit",
      timeout: 60_000,
    });
    execFileSync(
      process.env["PUBLISLE_PYTHON"] ?? "python3",
      ["-B", "-m", "unittest", "discover", "-s", "tools/python", "-v"],
      { stdio: "inherit", timeout: 60_000 },
    );
    const output = join(temporary, "renderer.json");
    execFileSync(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "packages/block-sdk/tests/migrations.test.ts",
        "packages/adapter-core/tests/python-rendering.test.ts",
        "packages/adapter-core/tests/renderer-parity.test.ts",
        "packages/research/tests/citation-parity.test.ts",
        "--reporter=default",
        "--reporter=json",
        `--outputFile=${output}`,
      ],
      { stdio: "inherit", timeout: 60_000 },
    );
    verifyRendererEvidence(parseJson(await readFile(output)));
    console.log(
      "Renderer parity: static content, MathML, portable migrations, built-in citations and fallback/refusal evidence passed; full CSL is not claimed.",
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
