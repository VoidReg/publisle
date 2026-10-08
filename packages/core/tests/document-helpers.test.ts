import { describe, expect, it } from "vitest";
import {
  coreBlockDefinitions,
  figure,
  heading,
  math,
  paragraph,
  quote,
} from "@publisle/blocks-core";
import { document } from "@publisle/schema";
import {
  assertPrepared,
  createRegistry,
  getDocumentMetadata,
  getDocumentOutline,
  getDocumentReferences,
  prepare,
} from "../src/index.ts";

const registry = createRegistry(coreBlockDefinitions);

function fixture() {
  return assertPrepared(
    prepare(
      document({
        metadata: {
          title: "A paper",
          authors: [{ name: "Ada", identifiers: { local: "author-1" } }],
          extensions: { "host:settings": { tags: ["math"] } },
        },
        blocks: [
          heading({
            level: 1,
            label: "intro",
            content: [{ type: "text", value: "Introduction" }],
          }),
          paragraph({ content: [{ type: "text", value: "Body" }] }),
          heading({
            level: 3,
            content: [
              { type: "strong", children: [{ type: "text", value: "Use " }] },
              {
                type: "link",
                url: "https://example.com",
                children: [{ type: "inlineCode", value: "FFT" }],
              },
              { type: "softBreak" },
              { type: "inlineMath", value: "x^2" },
              { type: "hardBreak" },
              { type: "inlineImage", url: "icon.svg", alt: "icon" },
              {
                type: "crossReference",
                target: "intro",
                children: [
                  {
                    type: "emphasis",
                    children: [{ type: "text", value: " intro" }],
                  },
                ],
              },
              { type: "footnoteReference", identifier: "note" },
              { type: "citationReference", items: [{ id: "paper" }] },
              { type: "rawHtml", value: "<b>not text</b>" },
            ],
          }),
          quote({
            children: [
              {
                type: "heading",
                level: 2,
                content: [{ type: "text", value: "Nested" }],
              },
            ],
          }),
          heading({ level: 6, content: [] }),
          figure({ src: "one.svg", alt: "One", label: "fig-one" }),
          figure({ src: "two.svg", alt: "Two", label: "fig-two" }),
          math({ value: "x=1", display: true, label: "eq-one" }),
        ],
      }),
      { registry },
    ),
  );
}

function freezeDeep(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  for (const child of Object.values(value)) freezeDeep(child);
  Object.freeze(value);
}

describe("pure document helpers", () => {
  it("does not invent metadata, headings or references for empty documents", () => {
    const prepared = assertPrepared(
      prepare(document({ blocks: [] }), { registry }),
    );
    expect(getDocumentMetadata(prepared)).toBeUndefined();
    expect(getDocumentOutline(prepared)).toEqual([]);
    expect(getDocumentReferences(prepared)).toEqual([]);
  });

  it("copies all authored metadata including nested extensions", () => {
    const prepared = fixture();
    const metadata = getDocumentMetadata(prepared);
    expect(metadata).toEqual(prepared.metadata);
    expect(metadata).not.toBe(prepared.metadata);
    expect(metadata?.authors).not.toBe(prepared.metadata?.authors);
    expect(metadata?.extensions).not.toBe(prepared.metadata?.extensions);
  });

  it("projects top-level headings in order without inventing anchors or a hierarchy", () => {
    const prepared = fixture();
    expect(getDocumentOutline(prepared)).toEqual([
      {
        blockId: prepared.blocks[0]?.id,
        level: 1,
        title: "Introduction",
        label: "intro",
      },
      {
        blockId: prepared.blocks[2]?.id,
        level: 3,
        title: "Use FFT x^2 icon intro",
      },
      { blockId: prepared.blocks[4]?.id, level: 6, title: "" },
    ]);
  });

  it("preserves prepared targets and kind-specific numbering without recomputation", () => {
    const prepared = fixture();
    const references = getDocumentReferences(prepared);
    expect(references).toEqual(prepared.references.targets);
    expect(references).toMatchObject([
      { kind: "heading", label: "intro", title: "Introduction" },
      { kind: "figure", label: "fig-one", ordinal: 1 },
      { kind: "figure", label: "fig-two", ordinal: 2 },
      { kind: "equation", label: "eq-one", ordinal: 1 },
    ]);
    expect(references).not.toBe(prepared.references.targets);
    expect(references[0]).not.toBe(prepared.references.targets[0]);
  });

  it("returns stable independent views without changing frozen input or cache identity", () => {
    const prepared = fixture();
    const snapshot = structuredClone(prepared);
    freezeDeep(prepared);
    const metadata = getDocumentMetadata(prepared);
    const outline = getDocumentOutline(prepared);
    const references = getDocumentReferences(prepared);
    expect(getDocumentMetadata(prepared)).toEqual(metadata);
    expect(getDocumentOutline(prepared)).toEqual(outline);
    expect(getDocumentReferences(prepared)).toEqual(references);
    metadata?.authors?.push({ name: "Host author" });
    if (metadata?.authors?.[0]) metadata.authors[0].name = "Changed";
    if (metadata?.extensions) metadata.extensions["host:settings"] = null;
    if (outline[0]) Object.assign(outline[0], { title: "Changed" });
    if (references[0]) Object.assign(references[0], { label: "Changed" });
    expect(prepared).toEqual(snapshot);
    expect(getDocumentMetadata(prepared)).toEqual(snapshot.metadata);
    expect(getDocumentReferences(prepared)).toEqual(
      snapshot.references.targets,
    );
    expect(getDocumentOutline(prepared)[0]?.title).toBe("Introduction");
  });
});
