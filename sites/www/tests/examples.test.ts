// Every loadable playground example must compile with the playground registry
// without error-level diagnostics, so a click in the playground never yields
// a broken document.
import { describe, expect, it } from "vitest";
import { playgroundExamples } from "../src/lib/playground-examples";
import { compilePublication } from "@publisle/adapter-core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { createRegistry, prepare } from "@publisle/core";
import { fromMarkdown, toMarkdown } from "@publisle/markdown";

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
      expect(
        imported.document.blocks.some(
          (block) => block.type === "publisle:raw-html",
        ),
      ).toBe(false);
      expect(artifact.html).not.toContain(":::");
      expect(artifact.html).not.toContain("::caption");
      expect(artifact.html).not.toContain("::fallback");
      const exported = toMarkdown(imported.document);
      expect(exported.markdown).toBeDefined();
      if (exported.markdown === undefined)
        throw new Error("Markdown export failed.");
      const roundTripped = fromMarkdown(exported.markdown);
      expect(
        roundTripped.document?.blocks.map(({ type, data }) => ({ type, data })),
      ).toEqual(
        imported.document.blocks.map(({ type, data }) => ({ type, data })),
      );
      expect(artifact.html.length).toBeGreaterThan(0);
    });
  }

  function compileExample(id: string) {
    const example = playgroundExamples.find((item) => item.id === id);
    if (!example) throw new Error(`Missing example: ${id}`);
    const document = fromMarkdown(example.markdown).document;
    if (!document) throw new Error(`Import failed: ${id}`);
    const prepared = prepare(document, { registry }).document;
    if (!prepared) throw new Error(`Preparation failed: ${id}`);
    return { document, artifact: compilePublication(prepared) };
  }

  it("preserves figure and table captions and accessible headers", () => {
    const { document, artifact } = compileExample("figures-tables");
    expect(document.blocks.map((block) => block.type)).toEqual([
      "publisle:heading",
      "publisle:figure",
      "publisle:heading",
      "publisle:table",
    ]);
    expect(document.blocks[1]?.data).toMatchObject({
      src: "/favicon.svg",
      alt: "Publisle brand mark",
      caption: [{ type: "paragraph" }],
    });
    expect(document.blocks[3]?.data).toMatchObject({
      headerRows: 1,
      caption: [{ type: "paragraph" }],
    });
    expect(artifact.html).toContain(
      "<figcaption><p>Figures carry alternative text and captions as first-class document data.</p></figcaption>",
    );
    expect(artifact.html).toContain(
      "<figcaption><p>Table captions travel with the data model, not the styling.</p></figcaption>",
    );
    expect(artifact.html).toContain('<th scope="col">Block</th>');
    expect(artifact.html).toContain('<th scope="col">Preserves</th>');
  });

  it("preserves diagram and embed fallback content", () => {
    const { document, artifact } = compileExample("diagrams-embeds");
    expect(document.blocks[1]?.data).toMatchObject({
      source: "graph TD\n  A[Document] --> B[Portable]\n  B --> C[Static HTML]",
      caption: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              value:
                "Diagram source is portable; each host renders it with its own engine.",
            },
          ],
        },
      ],
      fallback: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              value: "Document, Portable, and Static HTML, connected in order.",
            },
          ],
        },
      ],
    });
    expect(document.blocks[2]?.data).toMatchObject({
      fallback: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              value:
                "The embed ships a static fallback for print and no-JS readers.",
            },
          ],
        },
      ],
    });
    expect(artifact.html).toContain(
      "Document, Portable, and Static HTML, connected in order.",
    );
  });

  it("keeps the full article table caption attached to its table", () => {
    const { document, artifact } = compileExample("full-article");
    expect(
      document.blocks.find((block) => block.type === "publisle:table")?.data,
    ).toMatchObject({ headerRows: 1, caption: [{ type: "paragraph" }] });
    expect(artifact.html).toContain(
      "<figcaption><p>Three runs of the counter under the model of Section Model.</p></figcaption>",
    );
  });

  for (const id of ["interactive-schematic", "full-article"]) {
    it(`publishes an interaction-activated counter with fallback: ${id}`, () => {
      const { artifact } = compileExample(id);
      expect(artifact.islands).toHaveLength(1);
      expect(artifact.islands[0]).toMatchObject({
        implementation: "publisle:interactive-schematic",
        activation: "interaction",
        mode: "mount",
      });
      expect(artifact.html).toContain("The counter starts at zero.");
      expect(artifact.html).toContain("Explore Clocked counter</button>");
      expect(artifact.html).toContain("data-publisle-activate");
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
