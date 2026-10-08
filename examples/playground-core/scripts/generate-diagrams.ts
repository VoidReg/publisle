import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { format } from "prettier";
import { fromMarkdown } from "@publisle/markdown";
import { mermaidSources } from "../src/diagram-preview.ts";
import { defaultData } from "../src/templates.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const stylesheet = await readFile(
  new URL("../theme.css", import.meta.url),
  "utf8",
);
const roots = [...stylesheet.matchAll(/:root\s*\{([^}]+)\}/gu)].map(
  (match) => match[1]!,
);
const light = roots[0]!;
const dark = roots[1]!;
const palette = (block: string) =>
  Object.fromEntries(
    Object.entries({
      surface: "surface",
      raised: "surface-raised",
      text: "text",
      muted: "text-muted",
      border: "border",
      accent: "accent",
    }).map(([name, token]) => {
      const value = new RegExp(`--${token}:\\s*(#[a-f\\d]{6})\\s*;`, "iu").exec(
        block,
      )?.[1];
      if (!value)
        throw new Error(`Missing six-digit --${token} color in theme.css`);
      return [name, value];
    }),
  );
const fontFamily = /font-family:\s*([^;]+);/u
  .exec(light)?.[1]
  ?.trim()
  .replace(/\s+/gu, " ");
if (!fontFamily) throw new Error("Missing playground font family.");
const output = new URL("../src/generated/", import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(
  new URL("mermaid-theme.ts", output),
  await format(
    `// Generated from theme.css by generate:diagrams. Do not edit independently.\nexport const MERMAID_SITE_THEME = ${JSON.stringify({ fontFamily, light: palette(light), dark: palette(dark) }, null, 2)} as const;\n`,
    { parser: "typescript" },
  ),
);
const source = await readFile(
  new URL("../../articles/fourier-series.md", import.meta.url),
  "utf8",
);
const imported = fromMarkdown(source);
if (!imported.document) throw new Error("Could not parse the bundled article.");
const template = defaultData("publisle:diagram") as { source: string };
const sources = [
  ...new Set([...mermaidSources(imported.document), template.source]),
];
const server = await createServer({
  root,
  configFile: false,
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "mermaid-assets",
      configureServer(server) {
        server.middlewares.use("/__generate", (_req, res) => {
          res.setHeader("content-type", "text/html");
          res.end(
            "<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>",
          );
        });
      },
    },
  ],
});
await server.listen();
const browser = await chromium
  .launch({
    executablePath:
      process.env["MERMAID_CHROME_PATH"] ?? "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  })
  .catch(async (error: unknown) => {
    await server.close();
    throw error;
  });
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 800 },
  });
  await page.goto(`${server.resolvedUrls!.local[0]}__generate`);
  const manifest: { source: string; key: string; file: string }[] = [];
  for (const [index, diagram] of sources.entries()) {
    const result = await page.evaluate(
      async ({ diagram, index }) => {
        const path = "/src/mermaid-runtime.ts";
        const loaded: unknown = await import(path);
        const runtime = loaded as {
          renderMermaid(source: string, id: string): Promise<string>;
          diagramKey(source: string): string;
        };
        return {
          svg: await runtime.renderMermaid(diagram, `demo-asset-${index}`),
          key: runtime.diagramKey(diagram),
        };
      },
      { diagram, index },
    );
    const file = `mermaid-${index}.svg`;
    await writeFile(new URL(file, output), result.svg);
    manifest.push({ source: diagram, key: result.key, file });
  }
  await writeFile(
    new URL("mermaid.json", output),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    new URL("mermaid-assets.ts", output),
    `${manifest.map((asset, i) => `import svg${i} from "./${asset.file}?url";`).join("\n")}\nexport const urls: Record<string, string> = {\n${manifest.map((asset, i) => `  "${asset.file}": svg${i},`).join("\n")}\n};\n`,
  );
  console.log(`Generated ${manifest.length} Mermaid SVGs.`);
} finally {
  await browser.close();
  await server.close();
}
