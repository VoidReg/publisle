/** Native-platform release smoke gate: every shipped publisher class must compile. */
import { readFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fromMarkdown } from "../packages/markdown/src/index.ts";
import { createLatexPackage } from "../packages/research/src/package.ts";
import {
  compileLatexPackage,
  writeLatexPackage,
} from "../packages/research/src/node.ts";
import { template as ieee } from "../packages/template-ieee/src/index.ts";
import { template as acm } from "../packages/template-acm/src/index.ts";
import {
  template as elsevier,
  authorDateTemplate,
} from "../packages/template-elsevier/src/index.ts";
import { template as springer } from "../packages/template-springer/src/index.ts";

const articles = new URL("../examples/articles/", import.meta.url).pathname;
const loaded = fromMarkdown(
  await readFile(join(articles, "ieee-journal.md"), "utf8"),
);
if (!loaded.document) throw new Error("Invalid release fixture");
const artifacts = resolve(
  process.env["PUBLISLE_RESEARCH_ARTIFACTS"] ?? ".local/compiler-smoke",
);
await mkdir(artifacts, { recursive: true });
for (const template of [ieee, acm, elsevier, authorDateTemplate, springer]) {
  const source = createLatexPackage(loaded.document, {
    template,
    data: { country: "Jordan" },
    style: template.id === "elsevier-author-date" ? "author-date" : "numeric",
  });
  const compiled = await compileLatexPackage(source, {
    sourceDirectory: articles,
    compiler: "container",
    ...(process.env["PUBLISLE_COMPILER_IMAGE"]
      ? { containerImage: process.env["PUBLISLE_COMPILER_IMAGE"] }
      : {}),
    timeoutMs: 180_000,
  });
  await writeLatexPackage(compiled, join(artifacts, template.id));
  console.log(`${template.id}: compiled ${String(compiled.pdf.length)} bytes`);
}
