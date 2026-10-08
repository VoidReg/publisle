import { createBlockId, parseBlockId, type BlockId } from "./block-id.ts";
import { parseBlockType, type BlockType } from "./block-type.ts";
import { SchemaParseError } from "./error.ts";
import { isJsonValue, type JsonValue } from "./json.ts";
import { isPlainObject, readField } from "./object.ts";
import { parseReadable, type ReadableRepresentation } from "./readable.ts";

export interface SerializedBlock {
  readable?: ReadableRepresentation;
  id: string;
  type: string;
  schemaVersion: number;
  data: JsonValue;
}

export interface Block<Type extends BlockType = BlockType, Data = JsonValue> {
  readable?: ReadableRepresentation;
  id: BlockId;
  type: Type;
  schemaVersion: number;
  data: Data;
}

export interface UnknownBlock {
  readable?: ReadableRepresentation;
  id: BlockId;
  type: BlockType;
  schemaVersion: number;
  data: JsonValue;
}

export function createBlock<Type extends BlockType, Data>(input: {
  type: Type;
  data: Data;
  schemaVersion?: number;
  id?: BlockId;
  readable?: ReadableRepresentation;
}): Block<Type, Data> {
  parseBlockType(input.type);
  const schemaVersion = input.schemaVersion ?? 1;
  if (!isSchemaVersion(schemaVersion)) {
    throw new SchemaParseError(
      "invalid-block",
      "block.schemaVersion must be a positive integer.",
    );
  }
  if (!isJsonValue(input.data)) {
    throw new SchemaParseError(
      "invalid-block",
      "block.data must be a JSON value.",
    );
  }

  return {
    id: input.id ?? createBlockId(),
    ...(input.readable === undefined
      ? {}
      : { readable: parseReadable(input.readable) }),
    type: input.type,
    schemaVersion,
    data: input.data,
  };
}

function isSchemaVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function parseBlock(value: unknown): Block {
  if (!isPlainObject(value)) {
    throw new SchemaParseError("invalid-block", "A block must be an object.");
  }

  const id = readField(value, "id");
  const type = readField(value, "type");
  const schemaVersion = readField(value, "schemaVersion");
  const data = readField(value, "data");

  if (typeof id !== "string") {
    throw new SchemaParseError("invalid-block", "block.id must be a string.");
  }

  if (typeof type !== "string") {
    throw new SchemaParseError("invalid-block", "block.type must be a string.");
  }

  if (!isSchemaVersion(schemaVersion)) {
    throw new SchemaParseError(
      "invalid-block",
      "block.schemaVersion must be a positive integer.",
    );
  }

  if (!isJsonValue(data)) {
    throw new SchemaParseError(
      "invalid-block",
      "block.data must be a JSON value.",
    );
  }

  return {
    id: parseBlockId(id),
    ...(value["readable"] === undefined
      ? {}
      : { readable: parseReadable(value["readable"]) }),
    type: parseBlockType(type),
    schemaVersion,
    data,
  };
}
