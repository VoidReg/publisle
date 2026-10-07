import { describe, expect, it } from "vitest";
import { fromMarkdown, formatMarkdown, toMarkdown } from "../src/index.ts";

const fence = "`".repeat(3);
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
