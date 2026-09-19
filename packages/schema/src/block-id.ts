import { SchemaParseError } from "./error.ts";

export type BlockId = string & {
  readonly __brand: "BlockId";
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export function isBlockId(value: string): value is BlockId {
  return UUID_PATTERN.test(value) || ULID_PATTERN.test(value);
}

export function parseBlockId(value: string): BlockId {
  if (!isBlockId(value)) {
    throw new SchemaParseError(
      "invalid-block-id",
      `Block IDs must be a UUID or ULID, received ${JSON.stringify(value)}.`,
    );
  }

  return value;
}

export function createBlockId(): BlockId {
  return parseBlockId(globalThis.crypto.randomUUID());
}
