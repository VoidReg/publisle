import { describe, expect, expectTypeOf, it } from "vitest";

import {
  defineBlock,
  type BlockFromDefinition,
  type KnownBlockFrom,
} from "../src/index.ts";

interface CacheSimulatorData {
  readonly sets: number;
  readonly ways: number;
  readonly lineSize: number;
}

interface HeadingData {
  readonly text: string;
}

const cacheSimulatorDefinition = defineBlock({
  type: "voidreg:cache-simulator",
  schemaVersion: 2,
  schema: {
    parse(value: unknown): CacheSimulatorData {
      if (typeof value !== "object" || value === null) {
        throw new TypeError("Expected cache simulator data.");
      }

      return value as CacheSimulatorData;
    },
  },
});

const headingDefinition = defineBlock({
  type: "voidreg:heading",
  schemaVersion: 1,
  schema: {
    parse(value: unknown): HeadingData {
      if (typeof value !== "object" || value === null) {
        throw new TypeError("Expected heading data.");
      }

      return value as HeadingData;
    },
  },
});

describe("defineBlock", () => {
  it("preserves the literal type and schema version", () => {
    expect(cacheSimulatorDefinition.type).toBe("voidreg:cache-simulator");
    expect(cacheSimulatorDefinition.schemaVersion).toBe(2);
    expect(headingDefinition.type).toBe("voidreg:heading");
    expectTypeOf(
      cacheSimulatorDefinition.type,
    ).toEqualTypeOf<"voidreg:cache-simulator">();
    expectTypeOf(cacheSimulatorDefinition.schemaVersion).toEqualTypeOf<2>();
  });

  it("derives a block type that narrows by discriminant", () => {
    type CacheSimulatorBlock = BlockFromDefinition<
      typeof cacheSimulatorDefinition
    >;
    type HeadingBlock = BlockFromDefinition<typeof headingDefinition>;
    type KnownBlock = KnownBlockFrom<
      [typeof cacheSimulatorDefinition, typeof headingDefinition]
    >;

    expectTypeOf<
      CacheSimulatorBlock["type"]
    >().toEqualTypeOf<"voidreg:cache-simulator">();
    expectTypeOf<
      CacheSimulatorBlock["data"]
    >().toEqualTypeOf<CacheSimulatorData>();
    expectTypeOf<KnownBlock>().toEqualTypeOf<
      CacheSimulatorBlock | HeadingBlock
    >();

    const inspect = (block: KnownBlock): number | string => {
      if (block.type === "voidreg:cache-simulator") {
        expectTypeOf(block.data).toEqualTypeOf<CacheSimulatorData>();
        return block.data.sets;
      }

      expectTypeOf(block.data).toEqualTypeOf<HeadingData>();
      return block.data.text;
    };

    expect(
      inspect({
        id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" as CacheSimulatorBlock["id"],
        type: "voidreg:cache-simulator",
        schemaVersion: 2,
        data: { sets: 64, ways: 8, lineSize: 64 },
      }),
    ).toBe(64);
  });
});
