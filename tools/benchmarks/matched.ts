/** Matched static publication fixture: equal content, explicit operation boundaries. */
import { compile, run, type RunOptions } from "@mdx-js/mdx";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { coreBlockDefinitions } from "../../blocks/core/src/index.ts";
import {
  createRegistry,
  assertPrepared,
  prepare,
} from "../../packages/core/src/index.ts";
import { fromMarkdown } from "../../packages/markdown/src/index.ts";
import { compilePublication } from "../../packages/adapter-core/src/index.ts";
import { summarize } from "./report.ts";

const reactRequire = createRequire(
  new URL("../../packages/adapter-react/package.json", import.meta.url),
);
const jsx = reactRequire("react/jsx-runtime") as Pick<
  RunOptions,
  "Fragment" | "jsxs"
> & { jsx: NonNullable<RunOptions["jsx"]> };
const { renderToStaticMarkup } = reactRequire("react-dom/server") as {
  renderToStaticMarkup: (component: unknown) => string;
};
const paragraphs = Array.from(
  { length: 1000 },
  (_, index) => `Block ${String(index)} explains the same matched sentence.`,
);
const source = paragraphs.join("\n\n");
const handwritten = paragraphs.map((text) => `<p>${text}</p>`).join("\n");
// A second varied fixture avoids treating repetition as representative prose.
const mixed = [
  "# Sampling a finite series",
  "A finite approximation can overshoot near a discontinuity. Compare several harmonic counts before interpreting convergence.",
  "## Reproduction",
  "```js\nconst harmonic = 2 * k - 1;\nconst term = Math.sin(harmonic * x) / harmonic;\n```",
  "1. Pin the authored inputs.\n2. Record the sample positions.\n3. Compare absolute error.",
  "> A plotted line is a view of the numerical samples.",
  "Reference: [the authored explanation](https://example.invalid/series).",
].join("\n\n");
const registry = createRegistry(coreBlockDefinitions);
const outputIndex = process.argv.indexOf("--output");
const output = resolve(
  outputIndex < 0
    ? "benchmarks/matched"
    : (process.argv[outputIndex + 1] ?? "benchmarks/matched"),
);
await mkdir(output, { recursive: true });
const results = [];
for (const [name, markdown] of [
  ["paragraphs-1000", source],
  ["mixed-prose-code-list-reference", mixed],
] as const) {
  const imported = fromMarkdown(markdown);
  if (!imported.document) throw new Error(JSON.stringify(imported.diagnostics));
  const input = imported.document;
  const samples: {
    publislePrepareMs: number;
    publisleParsePrepareSerializeMs: number;
    mdxCompileMs: number;
    mdxCompileEvaluateSerializeMs: number;
  }[] = [];
  let publisleHtml = "",
    mdxHtml = "";
  const mdxOptions = {
    outputFormat: "function-body" as const,
    development: false,
  };
  for (let i = -5; i < 30; i++) {
    const start = performance.now();
    assertPrepared(prepare(input, { registry }));
    const prepareMs = performance.now() - start;
    const publisleStart = performance.now();
    const parsed = fromMarkdown(markdown);
    if (!parsed.document) throw new Error("Matched fixture import failed");
    publisleHtml = compilePublication(
      assertPrepared(prepare(parsed.document, { registry })),
    ).html;
    const publisleEnd = performance.now();
    const mdxStart = performance.now();
    const compiled = await compile(markdown, mdxOptions);
    const mdxCompiled = performance.now();
    const module = await run(compiled, { ...jsx, baseUrl: import.meta.url });
    mdxHtml = renderToStaticMarkup(jsx.jsx(module.default, {}, undefined));
    if (i >= 0)
      samples.push({
        publislePrepareMs: prepareMs,
        publisleParsePrepareSerializeMs: publisleEnd - publisleStart,
        mdxCompileMs: mdxCompiled - mdxStart,
        mdxCompileEvaluateSerializeMs: performance.now() - mdxStart,
      });
  }
  // Compare normalized static markup, retaining delivery wrappers separately.
  if (name === "paragraphs-1000") {
    const expected = paragraphs.map((text) => `<p>${text}</p>`).join("");
    if (mdxHtml.replaceAll("\n", "") !== expected)
      throw new Error("MDX content differs from the handwritten fixture");
    const normalized = publisleHtml
      .replace(/^<div[^>]*>/u, "")
      .replace(/<\/div>$/u, "")
      .replaceAll("\n", "");
    if (normalized !== expected)
      throw new Error("Publisle content differs from the handwritten fixture");
  }
  const bytes = (html: string) => ({
    raw: Buffer.byteLength(html),
    gzip: gzipSync(html, { level: 6 }).byteLength,
  });
  const metrics = [
    "publislePrepareMs",
    "publisleParsePrepareSerializeMs",
    "mdxCompileMs",
    "mdxCompileEvaluateSerializeMs",
  ] as const;
  results.push({
    name,
    source: markdown,
    samples,
    summary: Object.fromEntries(
      metrics.map((metric) => [
        metric,
        summarize(samples.map((sample) => sample[metric])),
      ]),
    ),
    publisle: bytes(publisleHtml),
    mdx: bytes(mdxHtml),
    ...(name === "paragraphs-1000" ? { handwritten: bytes(handwritten) } : {}),
  });
  await writeFile(resolve(output, `${name}.publisle.html`), publisleHtml);
  await writeFile(resolve(output, `${name}.mdx.html`), mdxHtml);
  console.log(`${name}: recorded 30 paired samples`);
}
await writeFile(
  resolve(output, "samples.json"),
  JSON.stringify(
    {
      complete: true,
      node: process.version,
      warmups: 5,
      repetitions: 30,
      gzipLevel: 6,
      mdxVersion: "3.1.1",
      boundaries:
        "Publisle reused registry, prepared input versus Markdown parse/prepare/serialize; MDX compile versus compile/evaluate/React static serialization. No persistent caches. Paired fixed order; not independent randomized trials. Mixed fixture has matching authored text but different unsupported semantic capabilities; no asserted byte-identical markup.",
      unsupported: [
        "MDX interactive equivalent and structured publishing tools",
        "Real cache-hit/incremental rebuild",
      ],
      results,
    },
    null,
    2,
  ) + "\n",
);
