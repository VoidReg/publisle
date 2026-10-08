import type { Block, SerializedBlock, UnknownBlock } from "./block.ts";
import type { BlockType } from "./block-type.ts";
import { parseBlock } from "./block.ts";
import { SchemaParseError } from "./error.ts";
import {
  parsePublicationMetadata,
  type PublicationMetadata,
  type SerializedPublicationMetadata,
} from "./metadata.ts";
import { isPlainObject, readField } from "./object.ts";
import {
  parseContractDependencies,
  type ContractDependency,
} from "./dependencies.ts";
import { isJsonValue, type JsonObject } from "./json.ts";

export const DOCUMENT_SCHEMA_VERSION = 1;

export interface SerializedDocument {
  dependencies?: readonly ContractDependency[];
  extensions?: JsonObject;
  schemaVersion: number;
  metadata?: SerializedPublicationMetadata;
  blocks: SerializedBlock[];
}

export interface Document<
  Blocks extends Block<BlockType, unknown> = UnknownBlock,
> {
  dependencies?: readonly ContractDependency[];
  extensions?: JsonObject;
  schemaVersion: number;
  metadata?: PublicationMetadata;
  blocks: Blocks[];
}

export function document<Blocks extends Block<BlockType, unknown>>(input: {
  dependencies?: readonly ContractDependency[];
  extensions?: JsonObject;
  metadata?: PublicationMetadata;
  blocks: readonly Blocks[];
}): Document<Blocks> {
  const result: Document<Blocks> = {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    blocks: [...input.blocks],
  };
  if (input.dependencies !== undefined)
    result.dependencies = parseContractDependencies(input.dependencies);
  if (input.extensions !== undefined)
    result.extensions = parseExtensions(input.extensions);

  if (input.metadata !== undefined) {
    result.metadata = input.metadata;
  }

  return result;
}

function isSchemaVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function parseDocument(value: unknown): Document {
  if (!isPlainObject(value)) {
    throw new SchemaParseError(
      "invalid-document",
      "A document must be an object.",
    );
  }

  const schemaVersion = readField(value, "schemaVersion");
  const blocks = readField(value, "blocks");
  const metadata = readField(value, "metadata");

  if (!isSchemaVersion(schemaVersion)) {
    throw new SchemaParseError(
      "invalid-document",
      "document.schemaVersion must be a positive integer.",
    );
  }

  if (!Array.isArray(blocks)) {
    throw new SchemaParseError(
      "invalid-document",
      "document.blocks must be an array.",
    );
  }

  const result: Document = {
    schemaVersion,
    blocks: blocks.map((block) => parseBlock(block)),
  };
  if (value["dependencies"] !== undefined)
    result.dependencies = parseContractDependencies(value["dependencies"]);
  if (value["extensions"] !== undefined)
    result.extensions = parseExtensions(value["extensions"]);

  if (metadata !== undefined) {
    result.metadata = parsePublicationMetadata(metadata);
  }

  return result;
}

function parseExtensions(value: unknown): JsonObject {
  if (!isPlainObject(value) || !isJsonValue(value))
    throw new SchemaParseError(
      "invalid-document",
      "Document extensions must be a JSON object.",
    );
  return value;
}
