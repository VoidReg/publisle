import { describe, it, expect } from "vitest";
import { document, createBlock } from "@publisle/schema";
import { resolveDocument } from "../src/resolve.ts";
import { parseCslStyle, formatCitations } from "../src/csl.ts";
const entries = [
  { id: "a", authors: ["Doe, Jane"], title: "First", issued: "2020" },
  { id: "b", authors: ["Doe, John"], title: "Second", issued: "2020" },
];
const noteStyle = `<style xmlns="http://purl.org/net/xbiblio/csl" version="1.0" class="note"><info><title>History regression</title></info><citation><layout><choose><if position="ibid"><text term="ibid"/></if><else-if position="subsequent"><text variable="title" form="short"/></else-if><else><names variable="author"><name/></names><text variable="title" prefix=", "/></else></choose></layout></citation><bibliography><layout><text variable="title"/></layout></bibliography></style>`;
describe("citeproc history and locales", () => {
  it("honors an explicit locale over a style default and reads leading comments", () => {
    const style = parseCslStyle(
      `<!-- a > comparison --> <style version="1.0" class="in-text" default-locale="en-US"><info><title>Locale override</title></info><citation><layout><text term="and"/></layout></citation></style>`,
    );
    expect(
      formatCitations(entries, [{ items: [{ id: "a" }] }], style, {
        locale: "fr-FR",
      }).citations[0],
    ).toBe("et");
    expect(
      formatCitations(entries, [{ items: [{ id: "a" }] }], style).citations[0],
    ).toBe("and");
  });
  it("uses locale terms, ibid, and subsequent forms", () => {
    const result = formatCitations(
      entries,
      [
        { items: [{ id: "a" }] },
        { items: [{ id: "a" }] },
        { items: [{ id: "b" }] },
        { items: [{ id: "a" }] },
      ],
      parseCslStyle(noteStyle),
      { locale: "fr-FR" },
    );
    expect(result.citations[0]).toContain("Jane Doe");
    expect(result.citations[1]?.toLowerCase()).toContain("ibid");
    expect(result.citations[3]).toBe("First");
    expect(result.losses).toEqual([]);
  });
  it("revises prior citations using structured names and year suffix disambiguation", () => {
    const style = `<style version="1.0" class="in-text"><info><category citation-format="author-date"/></info><!-- styles may include comments --><citation disambiguate-add-givenname="true" disambiguate-add-year-suffix="true"><layout delimiter="; "><names variable="author"><name form="short"/></names><date variable="issued" prefix=" "><date-part name="year"/></date></layout></citation><bibliography><layout><text variable="title"/></layout></bibliography></style>`;
    const result = formatCitations(
      entries,
      [
        { items: [{ id: "a" }] },
        { items: [{ id: "missing" }] },
        { items: [{ id: "b" }] },
      ],
      parseCslStyle(style),
      {
        items: [
          {
            id: "a",
            type: "book",
            title: "First",
            author: [
              { family: "Doe", given: "Jane", "non-dropping-particle": "van" },
            ],
            issued: { "date-parts": [[2020]] },
          },
          {
            id: "b",
            type: "book",
            title: "Second",
            author: [
              { family: "Doe", given: "Jane", "non-dropping-particle": "van" },
            ],
            issued: { "date-parts": [[2020]] },
          },
        ],
      },
    );
    expect(result.citations[0]).toContain("2020a");
    expect(result.citations[2]).toContain("2020b");
    expect(result.citations[1]).toBe("[missing]");
    expect(result.citations[0]).toContain("van Doe");
  });
  it("preserves opaque references with a diagnostic", () => {
    const result = resolveDocument(
      document({
        blocks: [
          createBlock({
            type: "publisle:paragraph",
            data: {
              content: [
                { type: "citationReference", items: [{ id: "literal" }] },
              ],
            },
          }),
          createBlock({
            type: "publisle:bibliography",
            data: {
              entries: [
                { id: "literal", raw: "Author. Unstructured reference, 2020." },
              ],
            },
          }),
        ],
      }),
    );
    expect(result.bibliography[0]?.text).toContain("Unstructured reference");
    expect(result.losses.map((item) => item.code)).toContain(
      "opaque-reference-literal",
    );
  });
});
