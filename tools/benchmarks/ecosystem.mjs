// Isolated comparison tools never become Core or website dependencies.
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  stat,
  realpath,
  symlink,
  rm,
} from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { cpus, totalmem } from "node:os";
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import {
  createRegistry,
  prepare,
  assertPrepared,
} from "../../packages/core/src/index.ts";
import { coreBlockDefinitions } from "../../blocks/core/src/index.ts";
import { fromMarkdown } from "../../packages/markdown/src/index.ts";
import { compilePublication } from "../../packages/adapter-core/src/index.ts";
const execute = promisify(execFile);
const runtime = resolve(process.env.BENCH_RUNTIME ?? "/tmp/publisle-ecosystem");
const output = resolve(process.env.BENCH_OUTPUT ?? ".local/ecosystem");
const count = Number(process.env.BENCH_SAMPLES ?? 30);
const warmups = Number(process.env.BENCH_WARMUPS ?? 5);
const require = createRequire(join(runtime, "package.json"));
const load = (name) => import(pathToFileURL(require.resolve(name)));
const { compile, run } = await load("@mdx-js/mdx");
const jsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");
const pandoc = resolve(process.env.PANDOC ?? ".local/benchmark-bin/pandoc");
const registry = createRegistry(coreBlockDefinitions);
await mkdir(output, { recursive: true });
const fixtures = {
  "math-heavy":
    "# Matched equations\n\nEach matched sentence contains math.\n\n" +
    Array.from(
      { length: 20 },
      (_, i) =>
        `For term ${i}, $e^{ix}=\\cos x+i\\sin x$.\n\n$$\nS_${i}=\\sum_{k=1}^{N} \\frac{\\sin(kx)}{k}\n$$`,
    ).join("\n\n"),
  "prose-1000":
    "# Matched article\n\n" +
    Array.from(
      { length: 1000 },
      (_, i) =>
        `Paragraph ${i} explains the same matched sentence with useful evidence.`,
    ).join("\n\n"),
  mixed:
    "# Sampling a finite series\n\nA finite approximation can overshoot near a discontinuity.\n\n## Reproduction\n\n```js\nconst harmonic = 2 * k - 1;\nconst term = Math.sin(harmonic * x) / harmonic;\n```\n\n1. Pin the inputs.\n2. Compare the error.\n\n> Reproduce the measurement.\n\n[Source](https://example.com)\n",
};
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[
    Math.max(0, Math.ceil(values.length * p) - 1)
  ];
const summarize = (values) => ({
  medianMs: percentile(values, 0.5),
  p95Ms: percentile(values, 0.95),
});
const report = {
  schemaVersion: 1,
  complete: false,
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    platform: process.platform,
  },
  samples: count,
  warmups,
  versions: {},
  documents: [],
  sites: [],
  notes: [
    "Document operations are labeled individually; a Docusaurus MDX module is not rendered HTML.",
    "Site builds use a single matched document with each documentation framework's default theme; site navigation and framework runtime are included.",
    "MDX and Pandoc are also measured as static HTML; zero publication JavaScript is not unique to Publisle.",
    "Builds use fresh output and bundler-cache directories; package installation, downloads and network are excluded.",
  ],
};
for (const name of [
  "@mdx-js/mdx",
  "@docusaurus/core",
  "vitepress",
  "react",
  "react-dom",
  "remark-math",
  "rehype-katex",
  "markdown-it-mathjax3",
])
  report.versions[name] = JSON.parse(
    await readFile(join(runtime, "node_modules", name, "package.json"), "utf8"),
  ).version;
report.versions.pandoc = (await execute(pandoc, ["--version"])).stdout.split(
  "\n",
)[0];
const save = () =>
  writeFile(join(output, "results.json"), JSON.stringify(report, null, 2));
for (const [fixture, source] of Object.entries(fixtures)) {
  const file = join(output, `${fixture}.md`);
  await writeFile(file, source);
  const row = {
    fixture,
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    operations: [],
  };
  report.documents.push(row);
  for (const tool of ["Publisle", "MDX", "VitePress", "Docusaurus", "Pandoc"]) {
    const start = performance.now();
    const result = JSON.parse(
      (
        await execute(
          process.execPath,
          [
            join(import.meta.dirname, "ecosystem-document.mjs"),
            tool,
            file,
            runtime,
            pandoc,
            join(output, `${fixture}-${tool}.output`),
            String(count),
            String(warmups),
          ],
          { maxBuffer: 8 * 1024 * 1024 },
        )
      ).stdout,
    );
    row.operations.push({
      ...result,
      freshProcessTotalMs: performance.now() - start,
    });
    await save();
    console.log(
      fixture,
      tool,
      JSON.stringify({ medianMs: result.medianMs, p95Ms: result.p95Ms }),
    );
  }
}
// Full production docs sites. Keep all assets and inspect actual browser requests.
const source = fixtures.mixed;
for (const tool of ["Publisle", "MDX", "Pandoc", "VitePress", "Docusaurus"]) {
  const site = join(output, "sites", tool);
  await mkdir(site, { recursive: true });
  try {
    await symlink(
      join(runtime, "node_modules"),
      join(site, "node_modules"),
      "dir",
    );
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  await writeFile(
    join(site, "package.json"),
    JSON.stringify({ name: `benchmark-${tool.toLowerCase()}`, private: true }),
  );
  let destination = join(site, "dist");
  let command;
  if (tool === "VitePress") {
    await mkdir(join(site, ".vitepress"), { recursive: true });
    await writeFile(join(site, "index.md"), source);
    await writeFile(
      join(site, ".vitepress/config.mts"),
      'export default {title:"Matched article",description:"Matched publishing benchmark",vite:{build:{chunkSizeWarningLimit:5000}}}',
    );
    destination = join(site, ".vitepress/dist");
    command = [
      process.execPath,
      [join(runtime, "node_modules/vitepress/bin/vitepress.js"), "build", site],
    ];
  } else if (tool === "Docusaurus") {
    await mkdir(join(site, "docs"), { recursive: true });
    await writeFile(
      join(site, "docs/index.md"),
      "---\nslug: /\n---\n\n" + source,
    );
    await writeFile(
      join(site, "docusaurus.config.js"),
      `module.exports={title:'Matched article',url:'https://example.com',baseUrl:'/',onBrokenLinks:'throw',presets:[['classic',{docs:{routeBasePath:'/',sidebarPath:false},blog:false}]],plugins:[function(){return{name:'bench-cache',configureWebpack(){return{cache:false}}}}],themeConfig:{navbar:{title:'Matched article',items:[]},footer:{links:[]}}};`,
    );
    destination = join(site, "build");
    command = [
      process.execPath,
      [
        join(runtime, "node_modules/@docusaurus/core/bin/docusaurus.mjs"),
        "build",
        site,
      ],
    ];
  }
  const observations = [];
  let peakRssKiB = 0;
  let html;
  for (let i = -warmups; i < count; i++) {
    await rm(destination, { recursive: true, force: true });
    for (const folder of [
      ".docusaurus",
      "node_modules/.cache",
      ".vitepress/cache",
    ]) {
      if (folder.startsWith("node_modules")) continue;
      await rm(join(site, folder), { recursive: true, force: true });
    }
    const begin = performance.now();
    if (command)
      await execute(
        "/usr/bin/time",
        [
          "-f",
          "%M",
          "-o",
          join(site, "peak-rss.txt"),
          command[0],
          ...command[1],
        ],
        {
          cwd: site,
          maxBuffer: 16 * 1024 * 1024,
          env: {
            ...process.env,
            NODE_ENV: "production",
            DOCUSAURUS_TELEMETRY_DISABLED: "true",
          },
        },
      );
    else {
      if (tool === "Publisle") {
        const doc = fromMarkdown(source).document;
        html = compilePublication(
          assertPrepared(prepare(doc, { registry })),
        ).html;
      }
      if (tool === "MDX")
        html = renderToStaticMarkup(
          jsx.jsx(
            (
              await run(
                await compile(source, {
                  outputFormat: "function-body",
                  development: false,
                }),
                { ...jsx, baseUrl: import.meta.url },
              )
            ).default,
            {},
          ),
        );
      if (tool === "Pandoc")
        html = (
          await execute(pandoc, [
            "--from=commonmark_x",
            "--to=html5",
            join(output, "mixed.md"),
          ])
        ).stdout;
      await mkdir(destination, { recursive: true });
      await writeFile(
        join(destination, "index.html"),
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Matched article</title><main>${html}</main></html>`,
      );
    }
    if (i >= 0) observations.push(performance.now() - begin);
    if (command)
      peakRssKiB = Math.max(
        peakRssKiB,
        Number(await readFile(join(site, "peak-rss.txt"), "utf8")),
      );
  }
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else files.push({ path: file, bytes: (await stat(file)).size });
    }
  }
  await walk(destination);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const file = resolve(
        destination,
        `.${url.pathname}`,
        url.pathname.endsWith("/") ? "index.html" : "",
      );
      if (!file.startsWith(destination + "/")) throw new Error("Path");
      const mime = file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html";
      res.setHeader("content-type", mime);
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const browser = await chromium.launch({
    executablePath:
      process.env.PUBLISLE_BROWSER_PATH ?? "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const requests = [];
  page.on("response", (r) => {
    requests.push(r);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, {
    waitUntil: "networkidle",
  });
  if (
    !(await page.locator("body").innerText()).includes("finite approximation")
  )
    throw new Error(`${tool}: published content missing`);
  const transferred = { html: 0, css: 0, js: 0 };
  const gzip = { html: 0, css: 0, js: 0 };
  for (const response of requests) {
    const type = response.request().resourceType();
    const key =
      type === "document"
        ? "html"
        : type === "stylesheet"
          ? "css"
          : type === "script"
            ? "js"
            : undefined;
    if (key && response.ok()) {
      const bytes = await response.body();
      transferred[key] += bytes.length;
      gzip[key] += gzipSync(bytes, { level: 6 }).length;
    }
  }
  await browser.close();
  await new Promise((ok) => server.close(ok));
  report.sites.push({
    tool,
    configuration: command
      ? "Default documentation theme, one article"
      : "Minimal static HTML host, one article",
    samples: observations,
    ...summarize(observations),
    peakRssKiB: peakRssKiB || undefined,
    outputBytes: files.reduce((n, x) => n + x.bytes, 0),
    deliveredBytes: transferred,
    deliveredGzipBytes: gzip,
  });
  await save();
  console.log("site", tool, JSON.stringify(report.sites.at(-1)));
}
// Package closure on disk, counted once by real path; runtime's install lock is retained.
async function closure(names, base = runtime) {
  const seen = new Set();
  let bytes = 0;
  async function visit(name, from) {
    let file;
    try {
      file = createRequire(from).resolve(`${name}/package.json`);
    } catch {
      try {
        file = createRequire(from).resolve(name);
        while (dirname(file) !== file) {
          file = dirname(file);
          try {
            const candidate = join(file, "package.json");
            if (JSON.parse(await readFile(candidate, "utf8")).name === name) {
              file = candidate;
              break;
            }
          } catch {
            /* continue searching the package root */
          }
        }
      } catch {
        return;
      }
    }
    const dir = await realpath(dirname(file));
    if (seen.has(dir)) return;
    seen.add(dir);
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    async function size(folder) {
      for (const ent of await readdir(folder, { withFileTypes: true })) {
        if (ent.name === "node_modules") continue;
        const p = join(folder, ent.name);
        if (ent.isDirectory()) await size(p);
        else if (ent.isFile()) bytes += (await stat(p)).size;
      }
    }
    await size(dir);
    for (const dep of Object.keys({
      ...pkg.dependencies,
      ...pkg.optionalDependencies,
      ...pkg.peerDependencies,
    }))
      await visit(dep, join(dir, "package.json"));
  }
  for (const name of names) await visit(name, join(base, "package.json"));
  return { bytes, packages: seen.size };
}
report.installation = {
  Publisle: await closure(
    ["@publisle/cli"],
    resolve(process.env.BENCH_PUBLISLE_RUNTIME ?? "/tmp/publisle-footprint"),
  ),
  MDX: await closure(["@mdx-js/mdx", "react", "react-dom"]),
  Docusaurus: await closure(["@docusaurus/core", "@docusaurus/preset-classic"]),
  VitePress: await closure(["vitepress"]),
  Pandoc: { binaryBytes: (await stat(pandoc)).size },
};
await writeFile(
  join(output, "package-lock.json"),
  await readFile(join(runtime, "package-lock.json")),
);
report.complete = true;
await save();
console.log("Complete:", output);
