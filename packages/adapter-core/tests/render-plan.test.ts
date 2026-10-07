import { describe, expect, it } from "vitest";
import {
  coreBlockDefinitions,
  diagram,
  embed,
  figure,
  heading,
  math,
  paragraph,
} from "@publisle/blocks-core";
import {
  interactiveSchematic,
  interactiveSchematicDefinition,
} from "@publisle/blocks-technical";
import { createRegistry, prepare } from "@publisle/core";
import { document } from "@publisle/schema";
import { createRenderPlan } from "../src/index.ts";

describe("createRenderPlan", () => {
  const registry = createRegistry([
    ...coreBlockDefinitions,
    interactiveSchematicDefinition,
  ]);

  it("keeps the explanation outside the island and activates from a button", () => {
    const input = document({
      blocks: [
        interactiveSchematic({
          activation: "interaction",
          content: {
            title: [{ type: "text", value: "Clocked counter" }],
            description: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    value: "Observe the output on each clock edge.",
                  },
                ],
              },
            ],
          },
          fallback: [
            {
              type: "paragraph",
              content: [{ type: "text", value: "The counter starts at zero." }],
            },
          ],
          accessibility: { label: "Interactive clocked counter" },
          payload: { source: "./counter.json" },
        }),
      ],
    });
    const prepared = prepare(input, { registry }).document;
    expect(prepared).toBeDefined();
    if (!prepared) throw new Error("Expected a prepared document.");
    expect(prepared.resources.resources[0]?.uri).toBe("counter.json");
    const plan = createRenderPlan(prepared, {
      renderers: {
        "publisle:interactive-schematic": { module: "./Schematic.js" },
      },
    });
    expect(plan.nodes[0]).toMatchObject({
      kind: "element",
      tag: "section",
      children: [
        {
          kind: "element",
          tag: "p",
          children: [{ kind: "text", value: "Clocked counter" }],
        },
        {
          kind: "element",
          tag: "p",
          children: [
            { kind: "text", value: "Observe the output on each clock edge." },
          ],
        },
        {
          kind: "island",
          activation: "interaction",
          label: "Interactive clocked counter",
          props: {
            activation: "interaction",
            payload: { source: "./counter.json" },
          },
          fallback: [
            {
              kind: "element",
              tag: "p",
              children: [
                { kind: "text", value: "The counter starts at zero." },
              ],
            },
            {
              kind: "element",
              tag: "button",
              attributes: { "data-publisle-activate": "true" },
              children: [{ kind: "text", value: "Explore Clocked counter" }],
            },
          ],
        },
      ],
    });
    const island =
      plan.nodes[0]?.kind === "element" ? plan.nodes[0].children[2] : undefined;
    expect(island).toMatchObject({ kind: "island" });
    if (island?.kind !== "island") throw new Error("Expected an island.");
    expect(
      island.fallback.some(
        (node) => node.kind === "element" && node.tag === "dl",
      ),
    ).toBe(false);
  });

  it("warns when an interactive block has no static representation", () => {
    const input = document({
      blocks: [
        interactiveSchematic({
          activation: "visible",
          payload: { source: "./counter.json" },
        }),
      ],
    });
    const prepared = prepare(input, { registry }).document;
    expect(prepared).toBeDefined();
    if (!prepared) throw new Error("Expected a prepared document.");
    const plan = createRenderPlan(prepared);
    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing-static-representation" }),
    );
    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing-island-renderer" }),
    );
    expect(plan.nodes[0]).toMatchObject({ kind: "element", tag: "section" });
  });

  it("uses the descriptor display name when an interactive label is omitted", () => {
    const prepared = prepare(
      document({
        blocks: [
          interactiveSchematic({
            activation: "visible",
            fallback: [
              {
                type: "paragraph",
                content: [{ type: "text", value: "Static schematic" }],
              },
            ],
            payload: { source: "./counter.json" },
          }),
        ],
      }),
      { registry },
    ).document;
    if (!prepared) throw new Error("Expected prepared document.");
    expect(prepared.islands[0]?.displayName).toBe("Interactive schematic");
    const plan = createRenderPlan(prepared, {
      renderers: {
        "publisle:interactive-schematic": { module: "./Schematic.js" },
      },
    });
    expect(plan.nodes[0]).toMatchObject({
      children: [expect.objectContaining({ label: "Interactive schematic" })],
    });
  });

  it("indexes cross-references and renders color-aware KaTeX", () => {
    const input = document({
      blocks: [
        heading({
          level: 2,
          label: "sec:start",
          content: [{ type: "text", value: "Start" }],
        }),
        figure({ src: "flow.svg", alt: "Flow", label: "fig:flow" }),
        paragraph({
          content: [
            { type: "crossReference", target: "fig:flow" },
            { type: "text", value: " " },
            { type: "inlineMath", value: "\\textcolor{red}{x}" },
          ],
        }),
        math({ value: "\\color{blue} y", display: true, label: "eq:y" }),
      ],
    });
    const prepared = prepare(input, { registry }).document;
    expect(prepared?.references?.targets).toMatchObject([
      { label: "sec:start", kind: "heading", title: "Start" },
      { label: "fig:flow", kind: "figure", ordinal: 1 },
      { label: "eq:y", kind: "equation", ordinal: 1 },
    ]);
    if (!prepared) throw new Error("Expected prepared document.");
    const plan = createRenderPlan(prepared);
    expect(JSON.stringify(plan.nodes)).toContain("Figure 1");
    expect(JSON.stringify(plan.nodes)).toContain("katex");
    expect(plan.diagnostics).toEqual([]);
  });

  it("renders restricted embeds and diagram fallbacks", () => {
    const prepared = prepare(
      document({
        blocks: [
          embed({
            provider: "youtube",
            resourceId: "dQw4w9WgXcQ",
            title: "Video",
            aspectRatio: { width: 16, height: 9 },
          }),
          diagram({
            engine: "mermaid",
            source: "graph TD",
            alt: "Graph",
            fallback: [
              {
                type: "paragraph",
                content: [{ type: "text", value: "Graph fallback" }],
              },
            ],
          }),
        ],
      }),
      { registry },
    ).document;
    if (!prepared) throw new Error("Expected prepared document.");
    const plan = createRenderPlan(prepared);
    expect(JSON.stringify(plan.nodes)).toContain(
      "youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(JSON.stringify(plan.nodes)).toContain("Graph fallback");
    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing-diagram-renderer" }),
    );
  });

  it("rejects unresolved cross-references during preparation", () => {
    const result = prepare(
      document({
        blocks: [
          paragraph({
            content: [{ type: "crossReference", target: "fig:missing" }],
          }),
        ],
      }),
      { registry },
    );
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unresolved-cross-reference" }),
    );
  });
});
