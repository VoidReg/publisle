import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { RenderPlan } from "@publisle/adapter-core";
import { compile } from "svelte/compiler";
import { svelteTarget } from "../src/emitter.ts";

describe("Svelte target", () => {
  it("emits static native markup without the island runtime", () => {
    const code = svelteTarget.emitModule(
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
          islands: [],
          cacheIdentity: "x",
        },
      } satisfies RenderPlan,
      { source: "", filename: "article.md" },
    );
    expect(code).toContain("<p>Hello</p>");
    expect(code).not.toContain("createIslandController");
    expect(() => compile(code, { generate: "server" })).not.toThrow();
  });

  it("emits a compilable native island boundary", () => {
    const code = svelteTarget.emitModule(
      {
        nodes: [
          {
            kind: "island",
            blockId: "block",
            activation: "visible",
            label: "Counter explanation",
            module: "./Schematic.svelte",
            exportName: "default",
            props: { source: "./counter.json" },
            fallback: [
              {
                kind: "element",
                tag: "p",
                attributes: {},
                children: [{ kind: "text", value: "Counter explanation" }],
              },
            ],
          },
        ],
        diagnostics: [],
        document: {
          kind: "publisle:prepared-document",
          schemaVersion: 1,
          blocks: [],
          resources: { resources: [] },
          islands: [],
          cacheIdentity: "x",
        },
      },
      { source: "", filename: "article.md" },
    );
    expect(() => compile(code, { generate: "server" })).not.toThrow();
    expect(code).toContain("Counter explanation");
  });

  it("compiles the runtime content components", () => {
    for (const name of ["PublisleContent.svelte", "RenderNode.svelte"]) {
      const source = readFileSync(
        new URL(`../src/${name}`, import.meta.url),
        "utf8",
      );
      expect(() =>
        compile(source, { filename: name, generate: "server" }),
      ).not.toThrow();
    }
  });
});
