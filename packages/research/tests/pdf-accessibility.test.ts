import { describe, expect, it } from "vitest";
import { document, createBlock } from "@publisle/schema";
import { createLatexPackage } from "../src/package.ts";
import { template as ieee } from "../../template-ieee/src/index.ts";
import { template as acm } from "../../template-acm/src/index.ts";
import { template as elsevier } from "../../template-elsevier/src/index.ts";
import { template as springer } from "../../template-springer/src/index.ts";

const cells = (rows: readonly (readonly string[])[]) =>
  rows.map((row) => row.map((value) => [{ type: "text", value }]));

function fixture() {
  return document({
    metadata: {
      title: "Accessible article",
      authors: [{ name: "Ada" }],
      language: "en-GB",
    },
    blocks: [
      createBlock({
        type: "publisle:figure",
        data: {
          src: "figure.png",
          alt: "A & B, {two} values",
          caption: [{ type: "text", value: "Results" }],
        },
      }),
      createBlock({
        type: "publisle:table",
        data: {
          headerRows: 2,
          rows: cells([
            ["First", "Second"],
            ["Units", "Units"],
            ["1", "2"],
          ]),
        },
      }),
      createBlock({
        type: "publisle:table",
        data: { headerRows: 1, rows: cells([["Value"], ["3"]]) },
      }),
    ],
  });
}

describe("PDF accessibility source contract", () => {
  it("requests UA-2 before the class, preserves language and alt, and scopes each table's headers", () => {
    const source = createLatexPackage(fixture());
    const tex = source.files["manuscript.tex"] ?? "";
    expect(source.pdfStandard).toBe("ua-2");
    expect(tex).toMatch(/^\\DocumentMetadata\{lang=en-GB,pdfstandard=ua-2,/u);
    expect(tex.indexOf("\\DocumentMetadata")).toBeLessThan(
      tex.indexOf("\\documentclass"),
    );
    expect(tex).toContain("math/setup={mathml-AF,mathml-SE}");
    expect(tex).toContain("alt={A \\& B, \\{two\\} values}");
    expect(tex).toContain("\\tagpdfsetup{table/header-rows={1,2}}");
    expect(tex).toContain("\\tagpdfsetup{table/header-rows={1}}");
    expect(source.diagnostics).toEqual([]);
  });

  it("supports an explicit UA-1 knob and reports deliberate opt-out", () => {
    const source = createLatexPackage(fixture(), { pdfUa: "ua-1" });
    expect(source.files["manuscript.tex"]).toContain(
      "pdfstandard=ua-1,pdfversion=1.7",
    );
    expect(source.files["manuscript.tex"]).toContain("math/setup={mathml-AF}");
    const disabled = createLatexPackage(fixture(), { data: { pdfUa: false } });
    expect(disabled.pdfStandard).toBeUndefined();
    expect(disabled.files["manuscript.tex"]).not.toContain(
      "\\DocumentMetadata",
    );
    expect(disabled.diagnostics.map((loss) => loss.code)).toContain(
      "pdf-ua-unavailable",
    );
    for (const pdfUa of ["invalid", null, true, 2])
      expect(() => createLatexPackage(fixture(), { data: { pdfUa } })).toThrow(
        "pdfUa",
      );
  });

  it("rejects inaccessible figures, invalid table headers and unsafe language before compiling", () => {
    const source = fixture();
    for (const block of [
      createBlock({
        type: "publisle:figure",
        data: { src: "figure.png", alt: " " },
      }),
      createBlock({
        type: "publisle:table",
        data: { headerRows: 0, rows: cells([["Value"], ["1"]]) },
      }),
      createBlock({
        type: "publisle:table",
        data: { headerRows: 3, rows: cells([["Value"], ["1"]]) },
      }),
    ])
      expect(() => createLatexPackage({ ...source, blocks: [block] })).toThrow(
        /alternative text|headerRows/u,
      );
    expect(() =>
      createLatexPackage({
        ...source,
        metadata: { ...source.metadata, language: "en},tagging=off" },
      }),
    ).toThrow("BCP 47");
  });

  it("reports untagged publisher and pdfLaTeX paths explicitly", () => {
    for (const template of [ieee, acm, elsevier, springer]) {
      const source = createLatexPackage(
        document({
          metadata: { title: "Journal", authors: [{ name: "Ada" }] },
          blocks: [],
        }),
        { template },
      );
      expect(source.pdfStandard).toBeUndefined();
      expect(source.diagnostics.map((loss) => loss.code)).toContain(
        "pdf-ua-unavailable",
      );
    }
    expect(
      createLatexPackage(
        document({
          metadata: { title: "Article", authors: [{ name: "Ada" }] },
          blocks: [],
        }),
        { engine: "pdflatex" },
      ).diagnostics.map((loss) => loss.code),
    ).toContain("pdf-ua-unavailable");
  });
});
