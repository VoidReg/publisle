import { describe, expect, it } from "vitest";

import {
  createBlock,
  createBlockId,
  isBlockId,
  parseBlock,
  parseBlockId,
  parseBlockType,
  SchemaParseError,
} from "../src/index.ts";

function expectSchemaError(run: () => unknown, code: string): void {
  try {
    run();
    expect.unreachable("expected SchemaParseError");
  } catch (error) {
    expect(error).toBeInstanceOf(SchemaParseError);
    expect(error).toMatchObject({ code });
  }
}

describe("createBlock", () => {
  it("assigns a UUID id and default schema version", () => {
    const block = createBlock({
      type: "publisle:heading",
      data: { level: 1, text: "Digital Timing" },
    });

    expect(isBlockId(block.id)).toBe(true);
    expect(block.type).toBe("publisle:heading");
    expect(block.schemaVersion).toBe(1);
    expect(block.data).toEqual({ level: 1, text: "Digital Timing" });
  });

  it("uses a provided id and schema version", () => {
    const id = createBlockId();
    const block = createBlock({
      id,
      type: "voidreg:cache-simulator",
      schemaVersion: 2,
      data: { sets: 64 },
    });

    expect(block.id).toBe(id);
    expect(block.schemaVersion).toBe(2);
  });

  it("rejects an unnamespaced type", () => {
    expectSchemaError(
      () =>
        createBlock({
          type: "heading" as "publisle:heading",
          data: {},
        }),
      "invalid-block-type",
    );
  });

  it("rejects invalid versions and non-JSON builder data", () => {
    expectSchemaError(
      () =>
        createBlock({
          type: "publisle:paragraph",
          schemaVersion: 0,
          data: {},
        }),
      "invalid-block",
    );
    expectSchemaError(
      () =>
        createBlock({
          type: "publisle:paragraph",
          data: { callback: () => undefined },
        }),
      "invalid-block",
    );
  });
});

describe("parseBlock", () => {
  it("brands a serialized block", () => {
    const id = createBlockId();
    const block = parseBlock({
      id,
      type: "publisle:heading",
      schemaVersion: 1,
      data: { text: "Hello" },
    });

    expect(block.id).toBe(id);
    expect(block.type).toBe("publisle:heading");
    expect(block.data).toEqual({ text: "Hello" });
  });

  it("accepts a ULID", () => {
    const block = parseBlock({
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      type: "publisle:paragraph",
      schemaVersion: 1,
      data: {},
    });

    expect(isBlockId(block.id)).toBe(true);
  });

  it("rejects a non-object", () => {
    expectSchemaError(() => parseBlock("block"), "invalid-block");
  });

  it("rejects an unbrandable id", () => {
    expectSchemaError(
      () =>
        parseBlock({
          id: "block-42",
          type: "publisle:heading",
          schemaVersion: 1,
          data: {},
        }),
      "invalid-block-id",
    );
  });

  it("rejects non-JSON data", () => {
    expectSchemaError(
      () =>
        parseBlock({
          id: createBlockId(),
          type: "publisle:heading",
          schemaVersion: 1,
          data: () => undefined,
        }),
      "invalid-block",
    );
  });
});

describe("block identity parsers", () => {
  it("creates and parses block ids", () => {
    const id = createBlockId();

    expect(parseBlockId(id)).toBe(id);
    expect(isBlockId("not-an-id")).toBe(false);
    expectSchemaError(() => parseBlockId("block-42"), "invalid-block-id");
  });

  it("parses namespaced block types", () => {
    expect(parseBlockType("voidreg:cache-simulator")).toBe(
      "voidreg:cache-simulator",
    );
    expectSchemaError(
      () => parseBlockType("cache-simulator"),
      "invalid-block-type",
    );
    expectSchemaError(() => parseBlockType(":heading"), "invalid-block-type");
  });
});
