import { createBlock, document } from "@publisle/schema";
import { describe, expect, it } from "vitest";
import { fromMyST, MYST_LOSS_TABLE, toMyST } from "../src/index.ts";

describe("MyST mapping", () => {
  it("maps a supported paragraph and records unsupported interactive behavior", () => {
    const input = document({
      blocks: [
        createBlock({
          type: "publisle:paragraph",
          data: { content: [{ type: "text", value: "Supported prose" }] },
        }),
        createBlock({
          type: "publisle:diagram",
          data: { engine: "mermaid", source: "graph LR", alt: "Flow" },
        }),
      ],
    });
    const exported = toMyST(input);
    expect(exported.source).toContain("Supported prose");
    expect(exported.source).toContain("```{publisle}");
    expect(exported.losses.map((loss) => loss.code)).toEqual([
      "unsupported-interactive",
    ]);
    const imported = fromMyST(exported.source);
    expect(imported.document?.blocks.map((block) => block.type)).toEqual([
      "publisle:paragraph",
      "publisle:diagram",
    ]);
    expect(imported.document?.blocks[1]?.data).toMatchObject({
      source: "graph LR",
    });
    expect(MYST_LOSS_TABLE.map((row) => row.construct)).toContain("round-trip");
  });

  it("keeps an unsupported role as text and marks cite as lossy", () => {
    const imported = fromMyST("See {doc}`intro` and {cite}`doe`.");
    expect(imported.losses.map((loss) => loss.code)).toEqual([
      "unsupported-myst-role",
      "citation-style-lost",
    ]);
    expect(JSON.stringify(imported.document?.blocks)).toContain("intro");
    expect(JSON.stringify(imported.document?.blocks)).toContain("doe");
    const broken = fromMyST("```{publisle}\nnot-json\n```\n");
    expect(broken.losses.map((loss) => loss.code)).toContain(
      "opaque-source-unreadable",
    );
  });
});
