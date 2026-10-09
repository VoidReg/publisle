import { createBlock, document } from "@publisle/schema";
import { describe, expect, it } from "vitest";
import { fromMarkdown, toMarkdown } from "../src/index.ts";

describe("scholarly markdown preservation", () => {
  it("round-trips direction, header rows, and bibliography entries", () => {
    const input = document({
      metadata: { language: "ar", direction: "rtl", title: "ملاحظة" },
      blocks: [
        createBlock({
          type: "publisle:heading",
          data: {
            level: 2,
            role: "abstract",
            content: [{ type: "text", value: "ملخص" }],
          },
        }),
        createBlock({
          type: "publisle:paragraph",
          data: {
            content: [{ type: "text", value: "مرحبا", direction: "rtl" }],
          },
        }),
        createBlock({
          type: "publisle:table",
          data: {
            align: [null],
            headerRows: 0,
            rows: [[[{ type: "text", value: "خلية" }]]],
          },
        }),
        createBlock({
          type: "publisle:bibliography",
          data: {
            entries: [{ id: "doe", title: "Note", raw: "Doe, Note, 2026." }],
          },
        }),
      ],
    });
    const exported = toMarkdown(input);
    const markdown = exported.markdown;
    if (markdown === undefined) throw new Error("Export produced no Markdown");
    const imported = fromMarkdown(markdown);
    expect(imported.diagnostics).toEqual([]);
    expect(imported.document?.metadata).toMatchObject({
      language: "ar",
      direction: "rtl",
      title: "ملاحظة",
    });
    expect(imported.document?.blocks.map((block) => block.data)).toEqual(
      input.blocks.map((block) => block.data),
    );
    const standard = toMarkdown(input, { policy: "standard" });
    expect(standard.markdown).toContain("Doe, Note, 2026.");
    expect(standard.markdown).toContain("مرحبا");
  });
});
