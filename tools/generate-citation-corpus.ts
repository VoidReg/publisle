import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolvePortableCitations } from "../packages/research/src/portable-citations.ts";

const file = new URL(
  "../packages/contracts/fixtures/citations.json",
  import.meta.url,
);
const engine = createRequire(
  new URL("../packages/research/package.json", import.meta.url),
)("citeproc/package.json") as { version: string };
if (engine.version !== "2.4.63")
  throw new Error(
    "Citation expectations require the reviewed citeproc-js 2.4.63 pin.",
  );
const previous = await readFile(file, "utf8");
const corpus = JSON.parse(previous) as {
  generator: string;
  cases: {
    name: string;
    document: unknown;
    style: string;
    locale: string;
    expected?: unknown;
  }[];
};
corpus.generator =
  "citeproc-js 2.4.63 via resolvePortableCitations; normalized text and diagnostic code sets";
for (const fixture of corpus.cases) {
  const { diagnostics, ...result } = resolvePortableCitations(
    fixture.document,
    fixture.style,
    fixture.locale,
  );
  fixture.expected = {
    ...result,
    codes: [...new Set(diagnostics.map((item) => item.code))].sort(),
  };
}
// Use the repository formatter separately, so --check compares semantic JSON.
if (process.argv.includes("--write"))
  await writeFile(file, JSON.stringify(corpus, null, 2) + "\n");
else if (JSON.stringify(JSON.parse(previous)) !== JSON.stringify(corpus))
  throw new Error(
    "Citation expectations are stale. Regenerate with --write and review the diff.",
  );
console.log(
  `Citation corpus: ${String(corpus.cases.length)} expectations ${process.argv.includes("--write") ? "generated" : "verified"}.`,
);
