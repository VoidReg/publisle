import { describe, expect, it } from "vitest";
import { fromMarkdown, formatMarkdown, toMarkdown } from "../src/index.ts";
import { createBlock, document } from "@publisle/schema";

const fence = "`".repeat(3);

describe("inline payload formatting", () => {
  it("preserves nested JSON, Markdown formatting and fence-like strings in both modes", () => {
    const input = document({
      blocks: [
        createBlock({
          type: "demo:scene",
          data: {
            activation: "interaction",
            content: {
              title: [
                {
                  type: "strong",
                  children: [{ type: "text", value: "Scene" }],
                },
              ],
            },
            payload: {
              objects: [{ id: "box", position: [1, 2, 3] }],
              text: "```\n:::interactive\n**bold**",
              enabled: true,
            },
          },
        }),
      ],
    });
    const pretty = toMarkdown(input);
    expect(pretty).toEqual(toMarkdown(input, { payloadFormatting: "pretty" }));
    const compact = toMarkdown(input, { payloadFormatting: "compact" });
    expect(pretty.markdown).toContain('"objects": [');
    expect(compact.markdown).toContain(
      '"objects":[{"id":"box","position":[1,2,3]}]',
    );
    expect(compact.markdown!.length).toBeLessThan(pretty.markdown!.length);
    for (const result of [pretty, compact]) {
      expect(result.diagnostics).toEqual([]);
      expect(result.markdown).toContain("**Scene**");
      const imported = fromMarkdown(result.markdown!);
      expect(imported.diagnostics).toEqual([]);
      expect(imported.document?.blocks).toEqual(input.blocks);
    }
  });
});

const source = `---
title: Counter guide
custom: retained
---

# Counter

The state is $q_n$.

- [x] Select a stage.

:::interactive{type="publisle:interactive-schematic" schemaVersion="2" activation="visible" label="Interactive clocked counter"}
:::title
Clocked counter
:::

:::description
Observe the output on each clock edge.
:::

:::instructions
Advance the clock, then assert reset.
:::

:::fallback
The counter starts at zero.
:::

${fence}publisle-payload
{
  "source": "./counter.json"
}
${fence}
:::
`;

describe("Markdown conversion", () => {
  it("imports the interactive envelope and metadata", () => {
    const result = fromMarkdown(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.metadata?.title).toBe("Counter guide");
    expect(result.document?.metadata?.extensions).toEqual({
      custom: "retained",
    });
    expect(result.document?.blocks[3]).toMatchObject({
      type: "publisle:interactive-schematic",
      schemaVersion: 2,
      data: {
        activation: "visible",
        accessibility: { label: "Interactive clocked counter" },
        payload: { source: "./counter.json" },
        content: {
          title: [{ type: "text", value: "Clocked counter" }],
        },
        fallback: [
          {
            type: "paragraph",
            content: [{ type: "text", value: "The counter starts at zero." }],
          },
        ],
      },
    });
  });

  it("formats idempotently and preserves semantic blocks", () => {
    const first = formatMarkdown(source);
    expect(first.markdown).toBeDefined();
    expect(first.markdown).toContain("$q_n$");
    expect(first.markdown).toContain("[x] Select a stage");
    expect(first.markdown).toContain('type="publisle:interactive-schematic"');
    expect(first.markdown).toContain('schemaVersion="2"');
    expect(first.markdown).toContain("publisle-payload");
    expect(first.markdown).toContain("./counter.json");
    const second = formatMarkdown(first.markdown ?? "");
    expect(second.markdown).toBe(first.markdown);
    const imported = fromMarkdown(first.markdown ?? "");
    const exported = imported.document
      ? toMarkdown(imported.document)
      : undefined;
    expect(exported?.markdown).toBe(first.markdown);
  });

  it("exports readable Markdown and reports lost interactive behavior", () => {
    const imported = fromMarkdown(source);
    expect(imported.document).toBeDefined();
    if (!imported.document) throw new Error("Expected a document.");
    const exported = toMarkdown(imported.document, { policy: "standard" });
    expect(exported.diagnostics).toContainEqual(
      expect.objectContaining({ code: "interactive-behavior-lost" }),
    );
    expect(exported.markdown).toContain("Clocked counter");
    expect(exported.markdown).toContain("The counter starts at zero.");
    expect(exported.markdown).not.toContain("publisle-payload");
  });
});

describe("complete portable Markdown model", () => {
  it("round-trips semantic inline nodes and extension blocks", () => {
    const input = document({
      blocks: [
        createBlock({
          type: "publisle:heading",
          data: {
            level: 2,
            label: "sec:intro",
            content: [{ type: "text", value: "Introduction" }],
          },
        }),
        createBlock({
          type: "publisle:paragraph",
          data: {
            content: [
              { type: "text", value: "See " },
              { type: "crossReference", target: "fig:flow" },
              { type: "text", value: " and " },
              {
                type: "citationReference",
                items: [{ id: "doe2026", locator: "12", label: "page" }],
                prefix: "see ",
              },
              { type: "softBreak" },
              {
                type: "strikethrough",
                children: [{ type: "text", value: "old" }],
              },
              { type: "hardBreak" },
              { type: "inlineMath", value: "\\textcolor{red}{x}" },
            ],
          },
        }),
        createBlock({
          type: "publisle:figure",
          data: {
            src: "flow.svg",
            alt: "Flow",
            label: "fig:flow",
            caption: [
              {
                type: "paragraph",
                content: [{ type: "text", value: "The flow." }],
              },
            ],
            credit: [{ type: "text", value: "ACME" }],
            original: { src: "flow.pdf", mediaType: "application/pdf" },
          },
        }),
        createBlock({
          type: "publisle:embed",
          data: {
            provider: "youtube",
            resourceId: "dQw4w9WgXcQ",
            title: "Video",
            aspectRatio: { width: 16, height: 9 },
            fallback: [
              {
                type: "paragraph",
                content: [{ type: "text", value: "Video fallback." }],
              },
            ],
          },
        }),
        createBlock({
          type: "publisle:diagram",
          data: {
            engine: "mermaid",
            source: "graph TD\nA-->B",
            alt: "A to B",
            label: "diagram:flow",
            fallback: [
              {
                type: "paragraph",
                content: [{ type: "text", value: "A points to B." }],
              },
            ],
          },
        }),
      ],
    });
    const exported = toMarkdown(input);
    expect(exported.diagnostics).toEqual([]);
    const imported = fromMarkdown(exported.markdown ?? "");
    expect(imported.diagnostics).toEqual([]);
    expect(imported.document?.blocks.map(({ type }) => type)).toEqual(
      input.blocks.map(({ type }) => type),
    );
    expect(imported.document?.blocks[1]?.data).toEqual(input.blocks[1]?.data);
    expect(imported.document?.blocks[2]?.data).toEqual(input.blocks[2]?.data);
    expect(imported.document?.blocks[3]?.data).toEqual(input.blocks[3]?.data);
    expect(imported.document?.blocks[4]?.data).toEqual(input.blocks[4]?.data);
  });

  it("represents task and ordinary list items distinctly", () => {
    const imported = fromMarkdown(
      "- ordinary\n- [x] complete\n- [ ] pending\n",
    );
    expect(imported.document?.blocks[0]?.data).toMatchObject({
      items: [
        { type: "listItem" },
        { type: "taskListItem", checked: true },
        { type: "taskListItem", checked: false },
      ],
    });
  });

  it("resolves reference-style links and images into native nodes", () => {
    const imported = fromMarkdown(
      'A [link][site] and ![logo][asset].\n\n[site]: https://example.com\n[asset]: logo.svg "Logo"\n',
    );
    expect(imported.diagnostics).toEqual([]);
    expect(imported.document?.blocks).toHaveLength(1);
    expect(imported.document?.blocks[0]?.data).toMatchObject({
      content: [
        { type: "text", value: "A " },
        { type: "link", url: "https://example.com" },
        { type: "text", value: " and " },
        { type: "inlineImage", url: "logo.svg", alt: "logo", title: "Logo" },
        { type: "text", value: "." },
      ],
    });
  });

  it("degrades extensions to readable standard Markdown", () => {
    const output = toMarkdown(
      document({
        blocks: [
          createBlock({
            type: "publisle:paragraph",
            data: {
              content: [
                { type: "crossReference", target: "fig:x" },
                { type: "text", value: " " },
                { type: "citationReference", items: [{ id: "doe2026" }] },
              ],
            },
          }),
          createBlock({
            type: "publisle:diagram",
            data: {
              engine: "mermaid",
              source: "graph TD",
              alt: "Graph",
              fallback: [
                {
                  type: "paragraph",
                  content: [{ type: "text", value: "Graph fallback" }],
                },
              ],
            },
          }),
        ],
      }),
      { policy: "standard" },
    );
    expect(output.markdown).not.toContain(":::");
    expect(output.markdown).not.toContain(":ref");
    expect(output.markdown).not.toContain(":cite");
    expect(output.markdown).toContain("fig\\:x \\[doe2026]");
    expect(output.markdown).toContain("Graph fallback");
    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({ code: "extension-semantics-lost" }),
    );
  });
});
