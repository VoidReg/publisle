import { describe, expect, it } from "vitest";
import { document, createBlock } from "@publisle/schema";
import { heading, paragraph, figure } from "@publisle/blocks-core";
import { researchPaperProfile } from "../src/index.ts";

const text = (value: string) => [{ type: "text" as const, value }];
const validPaper = () =>
  document({
    metadata: {
      title: "A paper",
      language: "en",
      authors: [{ name: "Author", affiliation: "University" }],
    },
    blocks: [
      heading({ level: 1, content: text("A paper") }),
      heading({ level: 2, content: text("Abstract") }),
      paragraph({ content: text("A concise summary.") }),
      heading({ level: 2, content: text("Results") }),
    ],
  });

describe("research-paper conformance", () => {
  it("accepts a paper with an abstract, affiliations, and regular heading levels", () => {
    expect(researchPaperProfile().inspect(validPaper())).toEqual([]);
  });
  it("reports missing title/authors/abstract as optional warnings", () => {
    const diagnostics = researchPaperProfile().inspect(
      document({ blocks: [] }),
    );
    expect(diagnostics.map((item) => item.code)).toEqual([
      "missing-title",
      "missing-authors",
      "missing-document-language",
      "missing-abstract",
    ]);
    expect(diagnostics.every((item) => item.level === "warning")).toBe(true);
  });
  it("reports missing or blank author affiliations", () => {
    const doc = validPaper();
    if (!doc.metadata) throw new Error("Expected fixture metadata.");
    doc.metadata.language = "en";
    doc.metadata.authors = [
      { name: "First" },
      { name: "Second", affiliation: " " },
    ];
    expect(
      researchPaperProfile()
        .inspect(doc)
        .map((item) => item.code),
    ).toEqual(["missing-affiliation", "missing-affiliation"]);
  });
  it("does not mistake description metadata or an empty abstract section for an abstract", () => {
    const doc = validPaper();
    if (!doc.metadata) throw new Error("Expected fixture metadata.");
    doc.metadata.description = "Search description, not an abstract";
    doc.blocks[2] = paragraph({ content: text(" ") });
    expect(
      researchPaperProfile()
        .inspect(doc)
        .map((item) => item.code),
    ).toEqual(["missing-abstract"]);
  });

  it("recognizes rich-text Abstract headings and custom labeled sections", () => {
    const doc = validPaper();
    doc.blocks[1] = heading({
      level: 2,
      content: [{ type: "strong", children: text("Abstract") }],
    });
    expect(researchPaperProfile().inspect(doc)).toEqual([]);
    doc.blocks[1] = heading({
      level: 2,
      label: "sec:summary",
      content: text("Résumé"),
    });
    expect(
      researchPaperProfile({ abstractLabel: "sec:summary" }).inspect(doc),
    ).toEqual([]);
    expect(
      researchPaperProfile()
        .inspect(doc)
        .map((item) => item.code),
    ).toEqual(["missing-abstract"]);
  });
  it("reports skipped heading levels but permits returns to higher-level sections", () => {
    const doc = validPaper();
    const skipped = heading({ level: 4, content: text("Skipped level") });
    doc.blocks.push(
      skipped,
      heading({ level: 2, content: text("Discussion") }),
    );
    expect(
      researchPaperProfile()
        .inspect(doc)
        .filter((item) => item.code === "irregular-heading-hierarchy"),
    ).toEqual([
      expect.objectContaining({
        code: "irregular-heading-hierarchy",
        blockId: skipped.id,
      }),
    ]);
  });
  it("distinguishes missing figure alt from an explicit decorative empty alt", () => {
    const doc = document({
      blocks: [
        createBlock({ type: "publisle:figure", data: { src: "missing.svg" } }),
        figure({ src: "decorative.svg", alt: "" }),
      ],
    });
    expect(
      researchPaperProfile()
        .inspect(doc)
        .filter((item) => item.code === "missing-alternative-text"),
    ).toEqual([expect.objectContaining({ blockId: doc.blocks[0]?.id })]);
  });
});
