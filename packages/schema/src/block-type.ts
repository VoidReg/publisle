import { SchemaParseError } from "./error.ts";

export type BlockType = `${string}:${string}`;

export function isBlockType(value: string): value is BlockType {
  const separator = value.indexOf(":");

  return separator > 0 && separator < value.length - 1 && !/\s/u.test(value);
}

export function parseBlockType(value: string): BlockType {
  if (!isBlockType(value)) {
    throw new SchemaParseError(
      "invalid-block-type",
      `Block types must be a namespaced identifier such as "voidreg:cache-simulator", received ${JSON.stringify(value)}.`,
    );
  }

  return value;
}
