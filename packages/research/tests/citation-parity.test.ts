import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import {
  resolvePortableCitations,
  type PortableCitations,
} from "../src/portable-citations.ts";

const fixturePath = fileURLToPath(
  new URL("../../contracts/fixtures/citations.json", import.meta.url),
);
interface CitationCase {
  name: string;
  document: unknown;
  style: string;
  locale: string;
  expected: Omit<PortableCitations, "diagnostics"> & { codes: string[] };
}
const comparable = ({ diagnostics, ...result }: PortableCitations) => ({
  ...result,
  codes: [...new Set(diagnostics.map((item) => item.code))].sort(),
});

it("matches shared citation markers, references, classifications and capabilities in independent Python and citeproc-js", async () => {
  const corpus = JSON.parse(await readFile(fixturePath, "utf8")) as {
    cases: CitationCase[];
  };
  expect(corpus.cases.length).toBeGreaterThan(0);
  expect(
    corpus.cases.some((item) => item.expected.classification === "rejected"),
  ).toBe(true);
  for (const style of ["numeric", "author-date"])
    for (const locale of ["en-US", "fr-FR"])
      expect(
        corpus.cases.some(
          (item) =>
            item.style === style &&
            item.locale === locale &&
            item.expected.classification === "rendered",
        ),
      ).toBe(true);
  const temporary = await mkdtemp(join(tmpdir(), "publisle-citation-parity-"));
  try {
    const source = join(temporary, "requests.json");
    // Give Python only source inputs. It never reads generated expectations.
    await writeFile(
      source,
      JSON.stringify(
        corpus.cases.map(({ document, style, locale }) => ({
          document,
          style,
          locale,
        })),
      ),
    );
    const { stdout } = await promisify(execFile)(
      process.env["PUBLISLE_PYTHON"] ?? "python3",
      [
        "-B",
        fileURLToPath(
          new URL("../../../tools/python/citations.py", import.meta.url),
        ),
        source,
        "--requests",
      ],
      { maxBuffer: 8 * 1024 * 1024, timeout: 30_000 },
    );
    const independent = JSON.parse(stdout) as PortableCitations[];
    expect(independent.length).toBe(corpus.cases.length);
    for (const [index, item] of corpus.cases.entries()) {
      const original = structuredClone(item.document);
      const result = resolvePortableCitations(
        item.document,
        item.style,
        item.locale,
      );
      expect(comparable(result), item.name).toEqual(item.expected);
      const python = independent[index];
      if (!python)
        throw new Error(`Missing independent citation evidence: ${item.name}`);
      expect(comparable(python), item.name).toEqual(item.expected);
      expect(item.document, item.name).toEqual(original);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
