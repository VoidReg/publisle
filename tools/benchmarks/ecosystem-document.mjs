// Each compiler gets its own process so peak RSS includes only its dependencies.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
const [tool, file, runtime, pandoc, output, countString, warmupString] =
  process.argv.slice(2);
const source = await readFile(file, "utf8");
const require = createRequire(join(runtime, "package.json"));
const load = (name) => import(pathToFileURL(require.resolve(name)));
const math = file.includes("math-heavy");
const plugins =
  math && (tool === "MDX" || tool === "Docusaurus")
    ? {
        remarkPlugins: [(await load("remark-math")).default],
        rehypePlugins: [(await load("rehype-katex")).default],
      }
    : {};
let run, operation;
let childPeakRssKiB = 0;
if (tool === "Publisle") {
  const { createRegistry, prepare, assertPrepared } =
    await import("../../packages/core/src/index.ts");
  const { coreBlockDefinitions } =
    await import("../../blocks/core/src/index.ts");
  const { fromMarkdown } = await import("../../packages/markdown/src/index.ts");
  const { compilePublication } =
    await import("../../packages/adapter-core/src/index.ts");
  const registry = createRegistry(coreBlockDefinitions);
  operation = "Markdown → validated document → static HTML";
  run = async () => {
    const imported = fromMarkdown(source);
    if (!imported.document) throw new Error("Invalid fixture");
    return compilePublication(
      assertPrepared(prepare(imported.document, { registry })),
    ).html;
  };
} else if (tool === "MDX") {
  const { compile, run: evaluate } = await load("@mdx-js/mdx");
  const jsx = require("react/jsx-runtime");
  const { renderToStaticMarkup } = require("react-dom/server");
  operation = "MDX compile → evaluate → React static HTML";
  run = async () =>
    renderToStaticMarkup(
      jsx.jsx(
        (
          await evaluate(
            await compile(source, {
              outputFormat: "function-body",
              development: false,
              ...plugins,
            }),
            { ...jsx, baseUrl: import.meta.url },
          )
        ).default,
        {},
      ),
    );
} else if (tool === "VitePress") {
  const { createMarkdownRenderer } = await load("vitepress");
  const md = await createMarkdownRenderer(runtime, {
    theme: "github-light",
    math,
  });
  operation = "VitePress Markdown renderer → HTML (no Vue site build)";
  run = async () => md.render(source);
} else if (tool === "Docusaurus") {
  const {
    createProcessorUncached,
  } = require("@docusaurus/mdx-loader/lib/processor.js");
  const processor = await createProcessorUncached({
    format: "md",
    options: {
      ...plugins,
      siteDir: runtime,
      staticDirs: [],
      markdownConfig: {
        anchors: { maintainCase: false },
        hooks: {
          onBrokenMarkdownLinks: "throw",
          onBrokenMarkdownImages: "throw",
        },
        mdx1Compat: { comments: true },
        format: "md",
      },
    },
  });
  operation =
    "Docusaurus Markdown → MDX JavaScript module (no React rendering)";
  run = async () =>
    (
      await processor.process({
        content: source,
        filePath: file,
        frontMatter: {},
        compilerName: "server",
      })
    ).content;
} else if (tool === "Pandoc") {
  const execute = promisify(execFile);
  operation = "Fresh Pandoc process → HTML fragment";
  run = async () => {
    const result = await execute(
      "/usr/bin/time",
      [
        "-f",
        "%M",
        "-o",
        output + ".rss",
        pandoc,
        "--from=commonmark_x+tex_math_dollars",
        "--mathml",
        "--to=html5",
        file,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    childPeakRssKiB = Math.max(
      childPeakRssKiB,
      Number(await readFile(output + ".rss", "utf8")),
    );
    return result.stdout;
  };
} else throw new Error(`Unknown compiler: ${tool}`);
const samples = [];
let html = "";
for (let i = -Number(warmupString); i < Number(countString); i++) {
  const start = performance.now();
  html = await run();
  if (i >= 0) samples.push(performance.now() - start);
}
if (
  !html.includes(
    source.includes("finite approximation")
      ? "finite approximation"
      : "matched sentence",
  )
)
  throw new Error(`${tool}: content missing`);
await writeFile(output, html);
const percentile = (p) =>
  [...samples].sort((a, b) => a - b)[
    Math.max(0, Math.ceil(samples.length * p) - 1)
  ];
process.stdout.write(
  JSON.stringify({
    tool,
    operation,
    samples,
    medianMs: percentile(0.5),
    p95Ms: percentile(0.95),
    peakRssKiB: process.resourceUsage().maxRSS,
    childPeakRssKiB: childPeakRssKiB || undefined,
    outputBytes: Buffer.byteLength(html),
    outputGzipBytes: gzipSync(html, { level: 6 }).length,
  }),
);
