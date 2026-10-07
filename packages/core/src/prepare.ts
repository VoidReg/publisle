import { sha256Hex } from "./hash.ts";

import {
  DOCUMENT_SCHEMA_VERSION,
  type Block,
  type BlockType,
  type Diagnostic,
  type Document,
  type JsonValue,
  type PlannedResource,
  type PrepareResult,
  type PreparedBlock,
  type PreparedDocument,
  type ResourceReference,
  type ReferenceKind,
  type ReferenceTarget,
} from "@publisle/schema";

import type { AnyPortableBlockDefinition, PrepareOptions } from "./types.ts";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function mergeDefaults(defaults: unknown, data: unknown): unknown {
  if (
    defaults !== null &&
    data !== null &&
    typeof defaults === "object" &&
    typeof data === "object" &&
    !Array.isArray(defaults) &&
    !Array.isArray(data)
  ) {
    return { ...defaults, ...data };
  }
  return data;
}

function migrate(
  block: Block<BlockType, unknown>,
  definition: AnyPortableBlockDefinition,
): { data: unknown; version: number } {
  let data: unknown = block.data;
  let version = block.schemaVersion;
  const migrations = new Map(
    (definition.migrations ?? []).map((migration) => [
      migration.from,
      migration,
    ]),
  );
  while (version < definition.schemaVersion) {
    const migration = migrations.get(version);
    if (!migration)
      throw new Error(`No migration from schema version ${version}.`);
    data = migration.migrate(data as JsonValue);
    version += 1;
  }
  if (version > definition.schemaVersion) {
    const error = new Error(
      `Schema version ${version} is newer than supported version ${definition.schemaVersion}.`,
    );
    error.name = "UnsupportedBlockVersion";
    throw error;
  }
  return { data, version };
}

function planResource(resource: ResourceReference): PlannedResource {
  const uri = /^[a-z][a-z\d+.-]*:/iu.test(resource.uri)
    ? resource.uri
    : normalizePath(resource.uri).replace(/^\.\//u, "");
  const normalized = { ...resource, uri };
  const identity = sha256Hex(stable(normalized));
  return { ...normalized, identity };
}

function normalizePath(path: string): string {
  const parts = path.split("/");
  const result: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      result.pop();
    } else if (part !== "." && part !== "") {
      result.push(part);
    }
  }
  return result.join("/");
}

function plainInline(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry))
        return "";
      const node = entry as Record<string, unknown>;
      if (node["type"] === "text" && typeof node["value"] === "string")
        return node["value"];
      return plainInline(node["children"]);
    })
    .join("");
}

function referenceKind(type: string): ReferenceKind | undefined {
  if (type === "publisle:heading") return "heading";
  if (type === "publisle:figure") return "figure";
  if (type === "publisle:table") return "table";
  if (type === "publisle:math") return "equation";
  if (type === "publisle:diagram") return "diagram";
  return undefined;
}

function collectReferences(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectReferences(entry, output);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = value as Record<string, unknown>;
  if (
    record["type"] === "crossReference" &&
    typeof record["target"] === "string"
  )
    output.push(record["target"]);
  for (const entry of Object.values(record)) collectReferences(entry, output);
}

export function prepare(
  document: Document<Block<BlockType, unknown>>,
  options: PrepareOptions,
): PrepareResult {
  const diagnostics: Diagnostic[] = [];
  if (document.schemaVersion > DOCUMENT_SCHEMA_VERSION) {
    diagnostics.push({
      level: "error",
      code: "unsupported-document-version",
      message: `Document schema version ${document.schemaVersion} is not supported.`,
    });
    return { diagnostics };
  }
  const ids = new Set<string>();
  const blocks: PreparedBlock[] = [];
  const resourceMap = new Map<string, PlannedResource>();
  const islands: PreparedDocument["islands"][number][] = [];
  const targets: ReferenceTarget[] = [];
  const targetLabels = new Set<string>();
  const pendingReferences: { label: string; blockId: Block["id"] }[] = [];
  const ordinals = new Map<ReferenceKind, number>();

  for (const block of document.blocks) {
    if (ids.has(block.id)) {
      diagnostics.push({
        level: "error",
        code: "duplicate-block-id",
        message: `Duplicate block id ${block.id}.`,
        blockId: block.id,
      });
      continue;
    }
    ids.add(block.id);
    const definition = options.registry.get(block.type);
    if (!definition) {
      diagnostics.push({
        level: options.unknownBlocks === "error" ? "error" : "warning",
        code: "unknown-block-type",
        message: `No block definition is registered for ${block.type}.`,
        blockId: block.id,
      });
      if (options.unknownBlocks !== "error")
        blocks.push({ ...block, prepared: true });
      continue;
    }

    try {
      const migrated = migrate(block, definition);
      const parsed = definition.schema.parse(
        mergeDefaults(definition.defaults, migrated.data),
      );
      const data = definition.normalize ? definition.normalize(parsed) : parsed;
      const prepared = {
        ...block,
        schemaVersion: definition.schemaVersion,
        data,
        prepared: true,
      } as PreparedBlock;
      blocks.push(prepared);
      const kind = referenceKind(block.type);
      const recordData =
        typeof data === "object" && data !== null && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : {};
      if (kind && typeof recordData["label"] === "string") {
        const label = recordData["label"];
        if (targetLabels.has(label)) {
          diagnostics.push({
            level: "error",
            code: "duplicate-reference-label",
            message: `Duplicate reference label ${label}.`,
            blockId: block.id,
          });
        } else {
          targetLabels.add(label);
          const ordinal =
            kind === "heading" ? undefined : (ordinals.get(kind) ?? 0) + 1;
          if (ordinal !== undefined) ordinals.set(kind, ordinal);
          targets.push({
            label,
            blockId: block.id,
            kind,
            ...(ordinal === undefined ? {} : { ordinal }),
            ...(kind === "heading"
              ? { title: plainInline(recordData["content"]) }
              : {}),
          });
        }
      }
      const references: string[] = [];
      collectReferences(data, references);
      pendingReferences.push(
        ...references.map((label) => ({ label, blockId: block.id })),
      );
      for (const resource of definition.resources?.(data) ?? []) {
        const planned = planResource(resource);
        resourceMap.set(planned.identity, planned);
      }
      const island = definition.island?.(data);
      if (island)
        islands.push({
          blockId: block.id,
          blockType: block.type,
          activation: island.activation,
          ...(island.displayName === undefined
            ? {}
            : { displayName: island.displayName }),
        });
    } catch (error) {
      diagnostics.push({
        level: "error",
        code:
          error instanceof Error && error.name === "UnsupportedBlockVersion"
            ? "unsupported-block-version"
            : "invalid-block-data",
        message:
          error instanceof Error
            ? error.message
            : `Could not prepare ${block.type}.`,
        blockId: block.id,
      });
    }
  }

  for (const reference of pendingReferences) {
    if (!targetLabels.has(reference.label))
      diagnostics.push({
        level: "error",
        code: "unresolved-cross-reference",
        message: `Cross-reference target ${reference.label} does not exist.`,
        blockId: reference.blockId,
      });
  }

  if (diagnostics.some(({ level }) => level === "error"))
    return { diagnostics };
  const base = {
    kind: "publisle:prepared-document" as const,
    schemaVersion: document.schemaVersion,
    blocks,
    resources: { resources: [...resourceMap.values()] },
    references: { targets },
    islands,
    cacheIdentity: sha256Hex(`${stable(document)}:${options.registry.version}`),
  };
  const prepared: PreparedDocument =
    document.metadata === undefined
      ? base
      : { ...base, metadata: document.metadata };
  return { document: prepared, diagnostics };
}

export function assertPrepared(result: PrepareResult): PreparedDocument {
  if (!result.document) {
    throw new Error(
      result.diagnostics.map(({ message }) => message).join("\n") ||
        "Document preparation failed.",
    );
  }
  return result.document;
}
