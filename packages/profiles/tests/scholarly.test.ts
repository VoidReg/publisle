import { parseInlineNodes, tableDefinition } from "@publisle/blocks-core";
import {
  createBlock,
  document,
  parsePublicationMetadata,
} from "@publisle/schema";
import { describe, expect, it } from "vitest";
import {
  localizationProfile,
  printProfile,
  scholarlyProfile,
} from "../src/index.ts";

const arabic = "مرحبا";

describe("scholarly and publishing profiles", () => {
  it("keeps unresolved citations and exact multilingual text", () => {
    const source = document({
      metadata: { language: "ar", direction: "rtl" },
      blocks: [
        createBlock({
          type: "publisle:paragraph",
          data: {
            content: [{ type: "text", value: arabic, direction: "rtl" }],
          },
        }),
        createBlock({
          type: "publisle:paragraph",
          data: {
            content: [
              { type: "citationReference", items: [{ id: "missing-paper" }] },
            ],
          },
        }),
        createBlock({
          type: "publisle:bibliography",
          data: { entries: [{ id: "doe", raw: "Doe, 2026." }] },
        }),
      ],
    });
    expect(source.blocks).toHaveLength(3);
    expect(
      scholarlyProfile()
        .inspect(source)
        .map((item) => item.code),
    ).toEqual(["unresolved-citation"]);
    expect(
      localizationProfile()
        .inspect(source)
        .map((item) => item.code),
    ).toEqual(["host-direction-policy"]);
    expect(
      parseInlineNodes([{ type: "text", value: arabic, direction: "rtl" }]),
    ).toEqual([{ type: "text", value: arabic, direction: "rtl" }]);
  });

  it("rejects an invalid direction and reports a missing print alternative", () => {
    expect(() => parsePublicationMetadata({ direction: "sideways" })).toThrow(
      /direction/u,
    );
    const diagram = createBlock({
      type: "publisle:diagram",
      data: { engine: "mermaid", source: "graph LR", alt: "A graph" },
    });
    expect(printProfile().inspect(document({ blocks: [diagram] }))).toEqual([
      expect.objectContaining({ code: "missing-print-alternative" }),
    ]);
    expect(
      tableDefinition.schema.parse({
        align: [null],
        headerRows: 0,
        rows: [[[{ type: "text", value: "only" }]]],
      }),
    ).toMatchObject({ headerRows: 0 });
    expect(() =>
      tableDefinition.schema.parse({
        align: [null],
        headerRows: 2,
        rows: [[[{ type: "text", value: "only" }]]],
      }),
    ).toThrow(/headerRows/u);
  });
});
