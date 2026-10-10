import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { it, expect } from "vitest";
import { parseDocument, parseJson } from "@publisle/schema";
import { createRegistry } from "@publisle/core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { preparePublication } from "../src/node.ts";

const fixtures = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url));

/** KaTeX and the independent converter both produce these trees after normalization. */
function normalizeMathml(mathml: string): string {
  return mathml
    .replace(/<annotation[\s\S]*?<\/annotation>/gu, "")
    .replace(/<\/?semantics>/gu, "")
    .replace(/>\s+</gu, "><")
    .trim();
}

it("registers every TypeScript rendering diagnostic code in the shared registry", async () => {
  const registry = JSON.parse(
    await readFile(fixtures("../../contracts/rendering-codes.json"), "utf8"),
  ) as { codes: Record<string, string> };
  const sources = await Promise.all(
    ["render-plan.ts", "publication.ts", "html.ts"].map((name) =>
      readFile(fixtures(`../src/${name}`), "utf8"),
    ),
  );
  const emitted = new Set<string>();
  for (const source of sources)
    for (const match of source.matchAll(/code: "([a-z][a-z-]+)"/gu))
      emitted.add(match[1]!);
  const unknown = [...emitted].filter((code) => !(code in registry.codes));
  expect(unknown, "unregistered rendering codes").toEqual([]);
});

it("Python independently preserves the shared static rendering semantics", async () => {
  const fixture = fixtures("../../contracts/fixtures/static-rendering.json");
  const expectations = JSON.parse(
    await readFile(
      fixtures("../../contracts/fixtures/static-rendering-mathml.json"),
      "utf8",
    ),
  ) as {
    expectations: { tex: string; display: boolean; mathml: string }[];
  };
  const source = parseDocument(parseJson(await readFile(fixture, "utf8")));
  const publication = preparePublication(source, {
    registry: createRegistry(coreBlockDefinitions),
  });
  const { stdout } = await promisify(execFile)("python3", [
    "-B",
    fixtures("../../../tools/python/render.py"),
    fixture,
    "--codes",
    fixtures("../../contracts/rendering-codes.json"),
  ]);
  const python = JSON.parse(stdout) as { html: string; diagnostics: unknown[] };
  expect(python.diagnostics).toEqual([]);
  for (const text of [
    "Portable methods",
    "structure",
    "مرحبا",
    "Measured figure",
    "Results table",
    "Authored research note",
    "First result",
    "Second result",
  ]) {
    expect(python.html).toContain(text);
    expect(publication.html).toContain(text);
  }
  for (const tag of [
    "h2",
    "strong",
    "ol",
    "blockquote",
    "pre",
    "table",
    "th",
    "td",
    "math",
  ])
    expect(
      python.html.match(new RegExp(`<${tag}(?: |>)`, "gu"))?.length,
      tag,
    ).toBe(publication.html.match(new RegExp(`<${tag}(?: |>)`, "gu"))?.length);
  expect(python.html).toContain('dir="rtl"');
  expect(publication.html).toContain('dir="rtl"');
  for (const html of [publication.html, python.html]) {
    expect(html).toMatch(/^<(?:div|article)\b[^>]*lang="en"[^>]*dir="ltr"/u);
    expect(html).toContain('alt="Diagram description"');
    const headers = html.match(/<th\b[^>]*>/gu) ?? [];
    expect(headers).toHaveLength(2);
    expect(headers.every((tag) => tag.includes('scope="col"'))).toBe(true);
    expect(html.match(/<td\b[^>]*scope=/gu)).toBeNull();
  }

  // Both renderers must produce the shared normalized MathML trees, in order.
  const collect = (html: string) => {
    const trees: string[] = [];
    for (const match of html.matchAll(/<math[\s\S]*?<\/math>/gu))
      trees.push(normalizeMathml(match[0]!));
    return trees;
  };
  const expected = expectations.expectations.map((entry) =>
    normalizeMathml(entry.mathml),
  );
  expect(collect(publication.html)).toEqual(expected);
  expect(collect(python.html)).toEqual(expected);
});
