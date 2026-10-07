import { describe, expect, it } from "vitest";
import { coreBlockDefinitions } from "@publisle/blocks-core";
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
});
