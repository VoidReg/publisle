// Executed and typechecked from an isolated npm project by test:distribution.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { document, createBlock } from "@publisle/schema";
import {
  createLatexPackage,
  resolvePortableCitations,
} from "@publisle/research";
import { setupCompiler, writeLatexPackage } from "@publisle/research/node";
import type { SourcePackage, PublishingTemplate } from "@publisle/template-sdk";
import { template as article } from "@publisle/template-article";
import { template as ieee } from "@publisle/template-ieee";
import { template as acm } from "@publisle/template-acm";
import { template as elsevier } from "@publisle/template-elsevier";
import { template as springer } from "@publisle/template-springer";
import { researchCommandNames } from "@publisle/cli-research";

const input = document({
  metadata: {
    title: "Packed Research consumer",
    language: "en",
    authors: [{ name: "Ada Example" }],
  },
  blocks: [
    createBlock({
      type: "publisle:paragraph",
      data: {
        content: [
          { type: "text", value: "See " },
          { type: "citationReference", items: [{ id: "a" }] },
        ],
      },
    }),
    createBlock({
      type: "publisle:bibliography",
      data: {
        entries: [
          {
            id: "a",
            authors: ["Doe, Jane"],
            title: "First result",
            issued: "2020",
          },
        ],
      },
    }),
  ],
});
const source: SourcePackage = createLatexPackage(input);
assert.equal(source.pdfStandard, "ua-2");
assert.match(
  source.files["manuscript.tex"] ?? "",
  /^\\DocumentMetadata\{lang=en,pdfstandard=ua-2,/,
);
assert.match(source.files["manuscript.tex"] ?? "", /Packed Research consumer/);
const templates: readonly PublishingTemplate[] = [
  article,
  ieee,
  acm,
  elsevier,
  springer,
];
for (const template of templates) {
  const result = createLatexPackage(input, { template });
  assert.equal(result.template, template.id);
  assert.match(result.files["manuscript.tex"] ?? "", /\\documentclass/);
}
const publisher = createLatexPackage(input, { template: springer });
const classBytes = publisher.resources?.["sn-jnl.cls"];
assert(classBytes && classBytes.length > 1000);
assert.match(new TextDecoder().decode(classBytes), /ProvidesClass/);
await writeLatexPackage(
  { files: { ...publisher.files, ...publisher.resources } },
  "springer-source",
);
assert.match(
  await readFile("springer-source/sn-jnl.cls", "utf8"),
  /ProvidesClass/,
);
const citations = resolvePortableCitations(input);
assert.equal(citations.classification, "rendered");
assert.deepEqual(citations.citations, ["[1]"]);
assert.match(citations.bibliography[0]?.text ?? "", /Jane Doe/);
assert(researchCommandNames.includes("doctor"));
// setup reads the packaged release manifest before rejecting a mutable image.
// This proves its runtime URL without invoking Docker, pulling or building TeX.
await assert.rejects(
  setupCompiler({ image: "mutable-image:latest" }),
  /immutable registry@sha256/,
);
console.log(
  "Packed Research article tagging, five templates, Springer resources, citations, CLI plugin and compiler manifest resolution pass.",
);
