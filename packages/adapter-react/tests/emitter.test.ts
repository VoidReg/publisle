import { describe, expect, it } from "vitest";
import type { RenderPlan } from "@publisle/adapter-core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { reactTarget } from "../src/index.ts";
import { PublisleIsland } from "../src/runtime.ts";
import { PublisleContent } from "../src/content.ts";

describe("React target", () => {
  it("emits JSX-runtime calls without the island runtime for static content", () => {
    const code = reactTarget.emitModule(
      {
        nodes: [
          {
            kind: "element",
            tag: "p",
            attributes: {},
            children: [{ kind: "text", value: "Hello" }],
          },
        ],
        diagnostics: [],
        document: {
          kind: "publisle:prepared-document",
          schemaVersion: 1,
          blocks: [],
          resources: { resources: [] },
          references: { targets: [] },
          islands: [],
          cacheIdentity: "x",
        },
      } satisfies RenderPlan,
      { source: "", filename: "article.md" },
    );
    expect(code).toContain('jsx("p"');
    expect(code).not.toContain("PublisleIsland");
  });

  it("server-renders an interactive explanation before activation", () => {
    const markup = renderToStaticMarkup(
      createElement(PublisleIsland, {
        activation: "visible",
        label: "Counter explanation",
        props: { source: "./counter.json" },
        load: () => Promise.resolve({ default: () => null }),
        exportName: "default",
        fallback: createElement("p", null, "Counter explanation"),
      }),
    );
    expect(markup).toContain("Counter explanation");
    expect(markup).toContain("hidden");
  });

  it("renders a prepared platform-neutral plan", () => {
    const markup = renderToStaticMarkup(
      createElement(PublisleContent, {
        plan: {
          nodes: [
            {
              kind: "element",
              tag: "p",
              attributes: {},
              children: [{ kind: "text", value: "Portable content" }],
            },
          ],
          diagnostics: [],
          document: {
            kind: "publisle:prepared-document",
            schemaVersion: 1,
            blocks: [],
            resources: { resources: [] },
            references: { targets: [] },
            islands: [],
            cacheIdentity: "x",
          },
        },
      }),
    );
    expect(markup).toBe("<p>Portable content</p>");
  });

  it("renders void elements without children", () => {
    const markup = renderToStaticMarkup(
      createElement(PublisleContent, {
        plan: {
          nodes: [
            { kind: "element", tag: "hr", attributes: {}, children: [] },
            {
              kind: "element",
              tag: "img",
              attributes: { src: "/figure.png", alt: "Figure" },
              children: [],
            },
          ],
          diagnostics: [],
          document: {
            kind: "publisle:prepared-document",
            schemaVersion: 1,
            blocks: [],
            resources: { resources: [] },
            references: { targets: [] },
            islands: [],
            cacheIdentity: "x",
          },
        },
      }),
    );
    expect(markup).toContain("<hr/>");
    expect(markup).toContain('<img src="/figure.png" alt="Figure"/>');
  });
});
