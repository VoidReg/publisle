import { readFileSync } from "node:fs";
import { createRegistry, prepare } from "@publisle/core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { fromMarkdown } from "@publisle/markdown";
import { createRenderPlan, compilePublication } from "@publisle/adapter-core";
import type { DiagramRenderer } from "@publisle/adapter-core";
import { sceneDefinition } from "./scene.ts";
import diagrams from "./mermaid.json" with { type: "json" };

const diagramRenderer: DiagramRenderer = ({ source, alt }) => {
  const asset = diagrams.find((entry) => entry.source.trim() === source.trim());
  if (!asset)
    throw new Error("The authored Mermaid source has no checked-in SVG.");
  return {
    accessibleText: alt,
    static: [
      {
        kind: "element",
        tag: "img",
        attributes: {
          src: `/diagrams/${asset.file}`,
          alt,
          class: "demo-mermaid-svg",
        },
        children: [],
      },
    ],
  };
};

// The full article keeps its host-owned contract and authored static fallbacks.
// No 3D runtime, embed provider, or counter implementation is silently supplied.
const imported = fromMarkdown(
  readFileSync("public/fourier-series.md", "utf8"),
  { sourceName: "public/fourier-series.md" },
);
if (!imported.document)
  throw new Error("The authored Fourier article failed Markdown import.");
const prepared = prepare(imported.document, {
  registry: createRegistry([
    ...coreBlockDefinitions,
    interactiveSchematicDefinition,
    sceneDefinition,
  ]),
  resourceResolver: {
    base: "https://fourier.example.invalid/",
    version: "fourier-showcase-assets-1",
    resolve: ({ uri }) => {
      const file = uri.replace(/^\.\//, "");
      if (!["fourier-square-wave.svg", "fourier-clock.json"].includes(file))
        return undefined;
      const content = readFileSync(`public/${file}`, "utf8");
      return { resolvedLocation: `/${file}`, version: content };
    },
  },
});

if (
  !prepared.document ||
  prepared.diagnostics.some((item) => item.level === "error")
) {
  throw new Error(JSON.stringify(prepared.diagnostics));
}
// Passing the explicit plan preserves a static reading edition without creating
// island activation controls for implementations this host does not install.
export const publication = compilePublication(
  createRenderPlan(prepared.document, {
    diagramRenderers: { mermaid: diagramRenderer },
  }),
);
