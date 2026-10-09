import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { it, expect } from "vitest";
import { parseDocument, parseJson } from "@publisle/schema";
import { createRegistry } from "@publisle/core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { preparePublication } from "../src/node.ts";
it("Python independently preserves the shared static rendering semantics", async () => {
  const fixture = fileURLToPath(
    new URL("../../contracts/fixtures/static-rendering.json", import.meta.url),
  );
  const source = parseDocument(parseJson(await readFile(fixture, "utf8")));
  const publication = preparePublication(source, {
    registry: createRegistry(coreBlockDefinitions),
  });
  const { stdout } = await promisify(execFile)("python3", [
    "-B",
    fileURLToPath(new URL("../../../tools/python/render.py", import.meta.url)),
    fixture,
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
  ])
    expect(
      python.html.match(new RegExp(`<${tag}(?: |>)`, "gu"))?.length,
      tag,
    ).toBe(publication.html.match(new RegExp(`<${tag}(?: |>)`, "gu"))?.length);
  expect(python.html).toContain('dir="rtl"');
  expect(publication.html).toContain('dir="rtl"');
});
