// Every loadable playground example must compile with the core registry
// without error-level diagnostics, so a click in the playground never yields
// a broken document.
import { describe, expect, it } from "vitest";
import { playgroundExamples } from "../src/lib/playground-examples";
import { compilePublication } from "@publisle/adapter-core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { createRegistry, prepare } from "@publisle/core";
import { fromMarkdown } from "@publisle/markdown";

const registry = createRegistry([
  ...coreBlockDefinitions,
  interactiveSchematicDefinition,
]);

describe("playground examples", () => {
  for (const example of playgroundExamples) {
    it(`compiles without errors: ${example.title}`, () => {
      const imported = fromMarkdown(example.markdown, {
        sourceName: `${example.id}.md`,
      });
      const importErrors = imported.diagnostics.filter(
        (item) => item.level === "error",
      );
      expect(importErrors).toEqual([]);
      if (!imported.document) {
        throw new Error(`${example.title}: import produced no document.`);
      }

      const result = prepare(imported.document, { registry });
      const prepareErrors = result.diagnostics.filter(
        (item) => item.level === "error",
      );
      expect(prepareErrors).toEqual([]);
      if (!result.document) {
        throw new Error(`${example.title}: preparation produced no document.`);
      }

      const artifact = compilePublication(result.document);
      expect(artifact.html.length).toBeGreaterThan(0);
    });
  }

  it("example ids and titles are unique", () => {
    expect(new Set(playgroundExamples.map((e) => e.id)).size).toBe(
      playgroundExamples.length,
    );
    expect(new Set(playgroundExamples.map((e) => e.title)).size).toBe(
      playgroundExamples.length,
    );
  });
});
