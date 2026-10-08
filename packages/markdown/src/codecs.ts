import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { isBlockType, type BlockType, type Diagnostic } from "@publisle/schema";
import type { MarkdownBlockCodec, MarkdownImportOptions } from "./types.ts";

const reserved = new Set([
  "heading",
  "equation",
  "figure",
  "table",
  "embed",
  "diagram",
  "callout",
  "interactive",
  "publisle",
]);
const builtinVersions = new Map<string, number>(
  [...coreBlockDefinitions, interactiveSchematicDefinition].map(
    ({ type, schemaVersion }) => [type, schemaVersion],
  ),
);

export function codecRegistry(codecs: readonly MarkdownBlockCodec[] = []) {
  const byType = new Map<BlockType, MarkdownBlockCodec>();
  const byDirective = new Map<string, MarkdownBlockCodec>();
  for (const codec of codecs) {
    if (
      !isBlockType(codec.type) ||
      !Number.isInteger(codec.schemaVersion) ||
      codec.schemaVersion < 1 ||
      !/^[A-Za-z][\w-]*$/u.test(codec.directive) ||
      reserved.has(codec.directive) ||
      builtinVersions.has(codec.type) ||
      byType.has(codec.type) ||
      byDirective.has(codec.directive) ||
      typeof codec.decode !== "function" ||
      typeof codec.encode !== "function"
    )
      throw new Error(
        `Invalid, duplicate, or reserved Markdown codec registration for ${codec.type}/${codec.directive}.`,
      );
    byType.set(codec.type, codec);
    byDirective.set(codec.directive, codec);
  }
  return { byType, byDirective };
}

export function importedVersion(
  type: BlockType,
  explicit: string | undefined,
  options: MarkdownImportOptions,
  diagnostics: Diagnostic[],
  codec?: MarkdownBlockCodec,
): number {
  let version: number;
  if (explicit !== undefined) version = Number(explicit);
  else {
    const current =
      options.resolveSchemaVersion?.(type) ??
      codec?.schemaVersion ??
      builtinVersions.get(type);
    if (current === undefined) {
      diagnostics.push({
        level: "warning",
        code: "unresolved-markdown-version",
        message: `No current schema version is available for ${type}; preserving its payload with version 1. Supply resolveSchemaVersion or an explicit archival version.`,
      });
      version = 1;
    } else version = current;
  }
  if (!Number.isInteger(version) || version < 1)
    throw new Error(`Schema version for ${type} must be a positive integer.`);
  return version;
}
