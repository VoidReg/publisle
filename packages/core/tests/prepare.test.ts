import { describe, expect, it } from "vitest";
import { coreBlockDefinitions, figure, paragraph } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { createBlock, document } from "@publisle/schema";
import { createRegistry, prepare } from "../src/index.ts";

describe("prepare", () => {
  const registry = createRegistry([
    ...coreBlockDefinitions,
    interactiveSchematicDefinition,
  ]);

  it("prepares static blocks deterministically", () => {
    const input = document({
      blocks: [paragraph({ content: [{ type: "text", value: "Hello" }] })],
    });
    const first = prepare(input, { registry });
    const second = prepare(input, { registry });
    expect(first.document?.cacheIdentity).toBe(second.document?.cacheIdentity);
    expect(first.document?.blocks[0]?.prepared).toBe(true);
  });

  it("reports duplicate ids", () => {
    const item = paragraph({ content: [{ type: "text", value: "Repeated" }] });
    const result = prepare(document({ blocks: [item, item] }), { registry });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "duplicate-block-id" }),
    );
  });

  it("canonicalizes equivalent relative resources", () => {
    const input = document({
      blocks: [
        figure({ src: "./assets/../diagram.svg", alt: "Diagram" }),
        figure({ src: "diagram.svg", alt: "Diagram" }),
      ],
    });
    const result = prepare(input, { registry });
    expect(result.document?.resources.resources).toHaveLength(1);
    expect(result.document?.resources.resources[0]?.uri).toBe("diagram.svg");
  });

  it("migrates an interactive alt into the accessible name", () => {
    const result = prepare(
      document({
        blocks: [
          createBlock({
            type: "publisle:interactive-schematic",
            schemaVersion: 1,
            data: {
              activation: "visible",
              alt: "Clocked counter",
              payload: { source: "./counter.json" },
            },
          }),
        ],
      }),
      { registry },
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.blocks[0]).toMatchObject({
      schemaVersion: 2,
      data: {
        accessibility: { label: "Clocked counter" },
        payload: { source: "./counter.json" },
      },
    });
    expect(result.document?.blocks[0]?.data).not.toHaveProperty("alt");
  });

  it("rejects an unsupported document version", () => {
    const result = prepare({ schemaVersion: 2, blocks: [] }, { registry });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unsupported-document-version" }),
    );
  });

  it("rejects invalid supplied defaults", () => {
    const result = prepare(
      document({
        blocks: [
          createBlock({
            type: "publisle:list",
            schemaVersion: 1,
            data: { ordered: "yes", items: [] },
          }),
          createBlock({
            type: "publisle:figure",
            schemaVersion: 1,
            data: { src: "diagram.svg", alt: 123 },
          }),
        ],
      }),
      { registry },
    );
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid-block-data" }),
      ]),
    );
  });

  it("keeps an explicit empty figure alt", () => {
    const result = prepare(
      document({
        blocks: [figure({ src: "diagram.svg", alt: "" })],
      }),
      { registry },
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.blocks[0]?.data).toMatchObject({ alt: "" });
  });

  it("rejects unknown schematic payload fields and newer block versions", () => {
    const result = prepare(
      document({
        blocks: [
          createBlock({
            type: "publisle:interactive-schematic",
            schemaVersion: 2,
            data: {
              activation: "visible",
              payload: { source: "./counter.json", stages: 4 },
            },
          }),
          createBlock({
            type: "publisle:interactive-schematic",
            schemaVersion: 3,
            data: {
              activation: "visible",
              payload: { source: "./counter.json" },
            },
          }),
        ],
      }),
      { registry },
    );
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid-block-data" }),
        expect.objectContaining({ code: "unsupported-block-version" }),
      ]),
    );
  });
});
