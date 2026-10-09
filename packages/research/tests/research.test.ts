import { bibliographyDefinition } from "@publisle/blocks-core";
import { createBlock, document } from "@publisle/schema";
import { describe, expect, it } from "vitest";
import { parseBibtex, toBibtex, toCslJson } from "../src/bibtex.ts";
import { toJats } from "../src/jats.ts";
import { toLatex } from "../src/latex.ts";
import { toPdf } from "../src/pdf.ts";
import { resolveDocument } from "../src/resolve.ts";

const article = document({
  metadata: { title: "Notes", authors: [{ name: "Ada Lovelace" }] },
  blocks: [
    createBlock({
      type: "publisle:heading",
      data: {
        level: 1,
        content: [{ type: "text", value: "Abstract" }],
        role: "abstract",
      },
    }),
    createBlock({
      type: "publisle:paragraph",
      data: { content: [{ type: "text", value: "A short abstract." }] },
    }),
    createBlock({
      type: "publisle:heading",
      data: { level: 1, content: [{ type: "text", value: "Notes" }] },
    }),
    createBlock({
      type: "publisle:paragraph",
      data: {
        content: [
          { type: "text", value: "See " },
          {
            type: "citationReference",
            items: [{ id: "doe2020" }, { id: "roe2021" }],
          },
          { type: "text", value: " and again " },
          {
            type: "citationReference",
            items: [{ id: "doe2020", locator: "12" }],
          },
          { type: "text", value: " plus " },
          { type: "citationReference", items: [{ id: "missing-paper" }] },
          { type: "text", value: "." },
        ],
      },
    }),
    createBlock({
      type: "publisle:bibliography",
      data: {
        entries: [
          {
            id: "doe2020",
            type: "article-journal",
            title: "A note",
            authors: ["Doe, Jane", "Roe, Richard", "Poe, Edgar"],
            issued: "2020",
            containerTitle: "Journal of Notes",
            volume: "3",
            issue: "2",
            page: "10-20",
            doi: "10.1000/note",
          },
          {
            id: "roe2021",
            type: "book",
            title: "A book",
            authors: ["Roe, Richard"],
            issued: "2021",
            publisher: "Example Press",
          },
        ],
      },
    }),
  ],
});

describe("research citation export", () => {
  it("resolves numeric citations, collapses ranges, and keeps missing keys", () => {
    const resolved = resolveDocument(article, "numeric");
    expect(resolved.citations[0]).toBe("[1-2]");
    expect(resolved.citations[1]).toBe("[1, p. 12]");
    expect(resolved.citations[2]).toBe("[missing-paper]");
    expect(resolved.unresolved).toEqual(["missing-paper"]);
    expect(resolved.bibliography.map((item) => item.id)).toEqual([
      "doe2020",
      "roe2021",
    ]);
    expect(resolved.bibliography[0]?.text).toContain("A note");
    expect(resolved.bibliography[0]?.text).toContain("10.1000/note");
  });

  it("formats an author-date CSL style, including a macro and et-al", () => {
    const resolved = resolveDocument(article, "author-date");
    expect(resolved.citations[0]).toBe("(Doe et al., 2020; Roe, 2021)");
    expect(resolved.bibliography[0]?.text).toContain("Doe, Jane");
    const custom = resolveDocument(
      article,
      `<?xml version="1.0"?>
<style class="in-text" version="1.0">
  <info><category citation-format="author-date"/></info>
  <macro name="author"><names variable="author"><name form="short"/></names></macro>
  <citation>
    <layout prefix="(" suffix=")" delimiter="; ">
      <group delimiter=" ">
        <text macro="author"/>
        <date variable="issued"><date-part name="year"/></date>
      </group>
    </layout>
  </citation>
  <bibliography><layout><text macro="author"/><text variable="title" prefix=". "/></layout></bibliography>
</style>`,
    );
    expect(custom.citations[0]).toContain("(Doe, Roe, Poe 2020");
    expect(custom.losses.some((loss) => loss.code === "unsupported-csl")).toBe(
      false,
    );
  });

  it("parses BibTeX into structured entries and copies raw-only entries", () => {
    const parsed = parseBibtex(`@article{doe2020,
      author = {Jane Doe and Richard Roe},
      title = "A note",
      journal = {Journal of Notes},
      year = 2020
    }`);
    expect(parsed[0]).toMatchObject({
      id: "doe2020",
      type: "article-journal",
      title: "A note",
      authors: ["Doe, Jane", "Roe, Richard"],
      issued: "2020",
      containerTitle: "Journal of Notes",
    });
    const raw = "@misc{plain, note = {Kept}}";
    expect(toBibtex(parseBibtex(raw)).trim()).toBe(raw);
    expect(toBibtex(parsed)).toContain("author = {Doe, Jane and Roe, Richard}");
    expect(toCslJson(parsed)).toContain('"family": "Doe"');
    expect(() => parseBibtex("@article{")).toThrow(/citation key/u);
  });

  it("writes LaTeX, JATS, and a textual PDF without dropping the source citation", () => {
    const resolved = resolveDocument(article, "numeric");
    const latex = toLatex(resolved);
    expect(latex).toContain("\\documentclass{article}");
    expect(latex).toContain("\\usepackage{cite}");
    expect(latex).toContain("\\cite{doe2020,roe2021}");
    expect(latex).toContain("\\begin{thebibliography}");
    expect(latex).toContain("\\begin{abstract}");
    expect(latex).toContain("Ada Lovelace");
    const jats = toJats(resolved);
    expect(jats).toContain("<article ");
    expect(jats).toContain('rid="doe2020 roe2021"');
    expect(jats).toContain("<ref-list>");
    expect(jats).toContain('<pub-id pub-id-type="doi">10.1000/note</pub-id>');
    expect(jats).toContain("<fpage>10</fpage>");
    expect(jats).toContain("<lpage>20</lpage>");
    expect(jats).toContain("<abstract>");
    const pdf = toPdf(resolved);
    const source = new TextDecoder().decode(pdf.pdf);
    expect(source.startsWith("%PDF-1.4")).toBe(true);
    expect(source).toContain("%%EOF");
    expect(source).toContain("(Notes)");
    expect(source).toContain("A note");
    expect(pdf.losses.some((loss) => loss.code === "unresolved-citation")).toBe(
      true,
    );
    const unicode = toPdf(
      resolveDocument(
        document({
          metadata: { title: "مرحبا" },
          blocks: [
            createBlock({
              type: "publisle:paragraph",
              data: { content: [{ type: "text", value: "Hello" }] },
            }),
          ],
        }),
      ),
    );
    expect(unicode.losses.map((loss) => loss.code)).toContain(
      "pdf-unencodable-character",
    );
  });

  it("keeps bibliography schema version 1 when optional citation fields are present", () => {
    expect(bibliographyDefinition.schemaVersion).toBe(1);
    expect(
      bibliographyDefinition.schema.parse({
        entries: [{ id: "doe", title: "A note" }],
      }),
    ).toEqual({ entries: [{ id: "doe", title: "A note" }] });
    expect(
      bibliographyDefinition.schema.parse({
        entries: [
          { id: "doe", type: "book", issued: "2024", doi: "10.1000/x" },
        ],
      }),
    ).toEqual({
      entries: [{ id: "doe", type: "book", issued: "2024", doi: "10.1000/x" }],
    });
  });
});
