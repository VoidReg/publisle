import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromMarkdown, toMarkdown } from "@publisle/markdown";
import { prepare } from "@publisle/core";
import { compilePublication } from "@publisle/adapter-core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { CORE_REGISTRY } from "../src/editor.ts";
import { mermaidSources } from "../src/diagram-preview.ts";

describe("Fourier feature article", () => {
  it("uses every native block and inline type and renders valid math and references", () => {
    const source = readFileSync(
      new URL("../../articles/fourier-series.md", import.meta.url),
      "utf8",
    );
    const imported = fromMarkdown(source);
    expect(imported.diagnostics).toEqual([]);
    expect(imported.document).toBeDefined();
    const doc = imported.document!;
    expect(mermaidSources(doc)).toHaveLength(3);
    const types = new Set(doc.blocks.map((block) => block.type));
    for (const definition of coreBlockDefinitions)
      expect(types.has(definition.type), definition.type).toBe(true);
    expect(types.has("demo:interactive-scene")).toBe(true);
    expect(types.has("publisle:interactive-schematic")).toBe(true);
    const nodeTypes = new Set<string>();
    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
      } else if (typeof value === "object" && value !== null) {
        const data = value as Record<string, unknown>;
        if (typeof data["type"] === "string") nodeTypes.add(data["type"]);
        for (const child of Object.values(data)) visit(child);
      }
    };
    visit(doc);
    for (const type of [
      "text",
      "emphasis",
      "strong",
      "strikethrough",
      "inlineCode",
      "link",
      "hardBreak",
      "softBreak",
      "inlineImage",
      "inlineMath",
      "footnoteReference",
      "citationReference",
      "crossReference",
      "listItem",
      "taskListItem",
      "rawHtml",
    ]) {
      expect(nodeTypes.has(type), type).toBe(true);
    }
    const result = prepare(doc, { registry: CORE_REGISTRY });
    expect(result.diagnostics).toEqual([]);
    const publication = compilePublication(result.document!);
    expect(
      publication.diagnostics.filter((item) => item.level === "error"),
    ).toEqual([]);
    expect(publication.html).not.toContain("publisle-math-error");
    expect(publication.html).toContain("katex");
    for (const label of ["symmetry", "convergence", "workflow"])
      expect(publication.html).toContain(`reference-diagram:${label}`);
    expect(publication.islands.map((island) => island.implementation)).toEqual([
      "demo:interactive-scene",
      "publisle:interactive-schematic",
    ]);
    for (const payloadFormatting of ["pretty", "compact"] as const) {
      const output = toMarkdown(doc, { payloadFormatting });
      expect(output.diagnostics).toEqual([]);
      const restored = fromMarkdown(output.markdown!);
      expect(restored.diagnostics).toEqual([]);
      expect(restored.document).toEqual(doc);
    }
  });
});
