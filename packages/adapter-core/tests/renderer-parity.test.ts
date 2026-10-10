import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { createRegistry, prepare } from "@publisle/core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { parseDocument } from "@publisle/schema";
import { compilePublication } from "../src/publication.ts";

const path = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url));
const python = promisify(execFile);
const registry = createRegistry([
  ...coreBlockDefinitions,
  interactiveSchematicDefinition,
]);

// This suite binds TypeScript to the same portable static role as Python:
// built-in registry only, no host renderers or executable host migrations.
const capabilities = {
  role: "static-renderer",
  schemaVersion: 1,
  fullCSL: false,
  plugins: false,
  migrations: "builtin-portable",
};

interface Result {
  html: string;
  diagnostics: { code: string }[];
  classification: string;
  capabilities: Record<string, unknown>;
}

it("matches shared migration, fallback and refusal outcomes in independent Python and TypeScript", async () => {
  const fixture = JSON.parse(
    await readFile(
      path("../../contracts/fixtures/renderer-parity.json"),
      "utf8",
    ),
  ) as {
    capabilities: Record<string, unknown>;
    cases: {
      name: string;
      document: unknown;
      expected: {
        classification: string;
        codes: string[];
        paragraphs: string[];
      };
    }[];
  };
  expect(fixture.cases.length).toBeGreaterThan(0);
  expect(fixture.capabilities).toEqual(capabilities);
  const temporary = await mkdtemp(join(tmpdir(), "publisle-renderer-parity-"));
  try {
    for (const item of fixture.cases) {
      const input = join(temporary, "document.json");
      await writeFile(input, JSON.stringify(item.document));
      const { stdout } = await python(
        process.env["PUBLISLE_PYTHON"] ?? "python3",
        [
          "-B",
          path("../../../tools/python/render.py"),
          input,
          "--codes",
          path("../../contracts/rendering-codes.json"),
        ],
      );
      const independent = JSON.parse(stdout) as Result;
      const source = parseDocument(item.document);
      const original = structuredClone(source);
      const prepared = prepare(source, { registry });
      const rejected =
        !prepared.document ||
        prepared.diagnostics.some((d) => d.level === "error");
      const compiled = rejected
        ? undefined
        : compilePublication(prepared.document!, {});
      const diagnostics = compiled?.diagnostics ?? prepared.diagnostics;
      const classification = rejected
        ? "rejected"
        : diagnostics.length
          ? "fallback-with-diagnostic"
          : "rendered";
      expect(classification, item.name).toBe(item.expected.classification);
      expect(independent.classification, item.name).toBe(classification);
      const codes = (values: { code: string }[]) =>
        [...new Set(values.map((d) => d.code))].sort();
      expect(codes([...diagnostics]), item.name).toEqual(item.expected.codes);
      expect(codes(independent.diagnostics), item.name).toEqual(
        item.expected.codes,
      );
      expect(independent.capabilities, item.name).toEqual(fixture.capabilities);
      if (rejected) expect(independent.html, item.name).toBe("");
      else {
        // Compare authored fallback structure and text; host wrappers differ.
        const paragraphs = (html: string) =>
          [...html.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gu)].map(
            (match) => match[1],
          );
        expect(paragraphs(compiled!.html), item.name).toEqual(
          item.expected.paragraphs,
        );
        expect(paragraphs(independent.html), item.name).toEqual(
          item.expected.paragraphs,
        );
      }
      expect(source, item.name).toEqual(original);
      if (source.blocks[0]?.schemaVersion === 1 && prepared.document) {
        expect(prepared.document.blocks[0]?.schemaVersion).toBe(2);
        const migration = await python(
          process.env["PUBLISLE_PYTHON"] ?? "python3",
          ["-B", path("../../../tools/python/migrations.py"), input],
        );
        const migrated = JSON.parse(migration.stdout) as {
          document: { blocks: { data: unknown }[] };
        };
        expect(migrated.document.blocks[0]?.data).toEqual(
          prepared.document.blocks[0]?.data,
        );
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
