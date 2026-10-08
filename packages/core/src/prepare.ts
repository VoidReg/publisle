import { sha256Hex } from "./hash.ts";
import { inspectProfiles } from "./profiles.ts";
import { migrateDocument } from "./document-migrations.ts";
import { stable } from "./identity.ts";
import { createResourcePlanner, ResourcePlanningError } from "./resources.ts";

import {
  DOCUMENT_SCHEMA_VERSION,
  SchemaParseError,
  locateDiagnostic,
  type Block,
  type BlockType,
  type Diagnostic,
  type Document,
  type JsonValue,
  type PrepareResult,
  type PreparedBlock,
  type PreparedDocument,
  type ReferenceKind,
  type ReferenceTarget,
} from "@publisle/schema";

import type { AnyPortableBlockDefinition, PrepareOptions } from "./types.ts";

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
      throw new SchemaParseError(
        "migration-failed",
        `No migration from schema version ${version}.`,
      );
    try {
      data = migration.migrate(structuredClone(data) as JsonValue);
    } catch (error) {
      throw new SchemaParseError(
        "migration-failed",
        `Block migration from schema version ${version} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
  const result = prepareDocument(document, options);
  return {
    ...result,
    diagnostics: result.diagnostics.map((diagnostic) =>
      locateDiagnostic(diagnostic, options.sourceMap),
    ),
  };
}

function prepareDocument(
  document: Document<Block<BlockType, unknown>>,
  options: PrepareOptions,
): PrepareResult {
  const diagnostics: Diagnostic[] = [];
  if (
    (options.preparationVersion !== undefined &&
      (typeof options.preparationVersion !== "string" ||
        !options.preparationVersion.trim())) ||
    (options.resourceResolver !== undefined &&
      (typeof options.resourceResolver.version !== "string" ||
        !options.resourceResolver.version.trim() ||
        typeof options.resourceResolver.resolve !== "function"))
  ) {
    return {
      diagnostics: [
        {
          level: "error",
          code: "invalid-preparation-options",
          message:
            "Preparation and resolver versions must be nonempty strings; a resolver must provide resolve().",
        },
      ],
    };
  }
  try {
    document = migrateDocument(
      document,
      options.documentMigrations ?? [],
      DOCUMENT_SCHEMA_VERSION,
    );
  } catch (error) {
    diagnostics.push({
      level: "error",
      code:
        error instanceof SchemaParseError
          ? error.code
          : "document-migration-failed",
      message:
        error instanceof Error ? error.message : "Document migration failed.",
    });
    return { diagnostics };
  }
  const ids = new Set<string>();
  const blocks: PreparedBlock[] = [];
  const resourcePlanner = createResourcePlanner(options.resourceResolver);
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
      let declaredResources: unknown;
      try {
        declaredResources = definition.resources
          ? definition.resources(data)
          : [];
      } catch (error) {
        throw new ResourcePlanningError(
          "resource-analysis-failed",
          `Resource declarations for ${block.type} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!Array.isArray(declaredResources))
        throw new ResourcePlanningError(
          "invalid-resource",
          `Resource declarations for ${block.type} must be an array.`,
        );
      for (const resource of declaredResources as readonly unknown[]) {
        resourcePlanner.add(resource);
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
          error instanceof ResourcePlanningError
            ? error.code
            : error instanceof SchemaParseError &&
                error.code === "migration-failed"
              ? "migration-failed"
              : error instanceof Error &&
                  error.name === "UnsupportedBlockVersion"
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
  if (options.profiles?.length || options.diagnosticPolicy) {
    const semanticDocument: Document<Block<BlockType, unknown>> = {
      schemaVersion: document.schemaVersion,
      blocks: blocks.map(({ id, type, schemaVersion, data }) => ({
        id,
        type,
        schemaVersion,
        data,
      })),
      ...(document.metadata === undefined
        ? {}
        : { metadata: document.metadata }),
    };
    diagnostics.push(...inspectProfiles(semanticDocument, options));
  }
  if (diagnostics.some(({ level }) => level === "error"))
    return { diagnostics };
  const resources = resourcePlanner.plan();
  const preparationIdentity = {
    // Bump when built-in preparation semantics or plan format changes.
    coreVersion: "2",
    hostVersion: options.preparationVersion ?? "1",
    unknownBlocks: options.unknownBlocks ?? "preserve",
    profiles:
      options.profiles?.map(({ name, version }) => ({
        name,
        version: version ?? "1",
      })) ?? [],
    diagnosticPolicy: options.diagnosticPolicy ?? {},
    sourceMap: options.sourceMap ?? null,
    resolverVersion: options.resourceResolver?.version ?? null,
    resources,
  };
  const base = {
    ...(options.sourceMap === undefined
      ? {}
      : { sourceMap: options.sourceMap }),
    kind: "publisle:prepared-document" as const,
    schemaVersion: document.schemaVersion,
    blocks,
    resources,
    references: { targets },
    islands,
    cacheIdentity: sha256Hex(
      stable({
        document,
        registry: options.registry.version,
        preparation: preparationIdentity,
      }),
    ),
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
