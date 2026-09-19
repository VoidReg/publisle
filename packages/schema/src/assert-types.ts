import type { Block } from "./block.ts";
import type { BlockId } from "./block-id.ts";
import { defineBlock, type BlockFromDefinition } from "./definition.ts";

interface CacheSimulatorData {
  readonly sets: number;
  readonly ways: number;
  readonly lineSize: number;
}

interface HeadingData {
  readonly text: string;
}

export const cacheSimulatorDefinition = defineBlock({
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

export const headingDefinition = defineBlock({
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

type CacheSimulatorBlock = BlockFromDefinition<typeof cacheSimulatorDefinition>;
type HeadingBlock = BlockFromDefinition<typeof headingDefinition>;
type KnownBlock = CacheSimulatorBlock | HeadingBlock;

export function inspect(block: KnownBlock): number | string {
  if (block.type === "voidreg:cache-simulator") {
    return block.data.sets;
  }

  return block.data.text;
}

export function rejectUnbrandedId(id: BlockId): BlockId {
  return id;
}

export function definitionTypes(): [
  "voidreg:cache-simulator",
  "voidreg:heading",
] {
  return [cacheSimulatorDefinition.type, headingDefinition.type];
}

export function defaultBlockType(block: Block): `${string}:${string}` {
  return block.type;
}
