import { sha256Hex } from "./hash.ts";
import { inspectProfiles } from "./profiles.ts";
import { migrateDocument } from "./document-migrations.ts";
import { stable } from "./identity.ts";
import { inspectReadable } from "./readable.ts";
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
  traverseDeclared,
  validateSemantics,
  resolvePointer,
  TraversalError,
  EXPLANATION_TRAVERSAL,
  RICH_TRAVERSAL_RULES,
  richText,
  isPlainObject,
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

function referenceKind(type: string): ReferenceKind | undefined {
  if (type === "publisle:heading") return "heading";
  if (type === "publisle:figure") return "figure";
  if (type === "publisle:table") return "table";
  if (type === "publisle:math") return "equation";
  if (type === "publisle:diagram") return "diagram";
  return undefined;
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
  const pendingReferences: {
    label: string;
    blockId: Block["id"];
    level: "warning" | "error";
    pointer: string;
  }[] = [];
  const ordinals = new Map<ReferenceKind, number>();
  const traversal: NonNullable<PreparedDocument["traversal"]>[number][] = [];
  const visited = new Set<string>();
  const collect = (
    block: Block<BlockType, unknown>,
    visits: readonly import("@publisle/schema").TraversalVisit[],
    referenceLevel: "warning" | "error" = "error",
  ): void => {
    for (const visit of visits) {
      const key = `${block.id}:${visit.kind}:${visit.pointer}`;
      if (visited.has(key)) continue;
      visited.add(key);
      traversal.push({ ...visit, blockId: block.id });
      if (visit.kind === "unresolved") {
        diagnostics.push({
          level: "warning",
          code: "unresolved-traversal-branch",
          message: `Preserved unrecognized content branch ${visit.type ?? ""} without interpreting it.`,
          pointer: visit.pointer,
          blockId: block.id,
        });
        continue;
      }
      if (visit.kind === "resource") {
        resourcePlanner.add(
          typeof visit.value === "string" ? { uri: visit.value } : visit.value,
        );
        continue;
      }
      const data = isPlainObject(visit.value) ? visit.value : {};
      if (
        visit.kind === "reference" &&
        visit.type === "preset" &&
        data["binding"] !== undefined
      ) {
        let resolved = false;
        try {
          resolved =
            typeof data["binding"] === "string" &&
            resolvePointer(block.data, data["binding"]).found;
        } catch {
          /* Invalid fixed pointer, not executable behavior. */
        }
        if (!resolved)
          diagnostics.push({
            level: referenceLevel,
            code: "unresolved-preset-binding",
            message: `Preset ${typeof data["id"] === "string" ? data["id"] : ""} binding does not exist or is not a fixed pointer.`,
            blockId: block.id,
            pointer: `${visit.pointer}/binding`,
          });
      }
      if (
        visit.kind === "reference" &&
        visit.type === "crossReference" &&
        typeof data["target"] === "string"
      )
        pendingReferences.push({
          label: data["target"],
          blockId: block.id,
          level: referenceLevel,
          pointer: visit.pointer,
        });
      const kind =
        visit.kind === "node" && visit.type
          ? referenceKind(`publisle:${visit.type}`)
          : undefined;
      if (kind && typeof data["label"] === "string") {
        const label = data["label"];
        if (targetLabels.has(label))
          diagnostics.push({
            level: "error",
            code: "duplicate-reference-label",
            message: `Duplicate reference label ${label}.`,
            blockId: block.id,
            pointer: visit.pointer,
          });
        else {
          targetLabels.add(label);
          const ordinal =
            kind === "heading" ? undefined : (ordinals.get(kind) ?? 0) + 1;
          if (ordinal !== undefined) ordinals.set(kind, ordinal);
          targets.push({
            label,
            blockId: block.id,
            kind,
            ...(visit.pointer ? { pointer: visit.pointer } : {}),
            ...(ordinal === undefined ? {} : { ordinal }),
            ...(kind === "heading" ? { title: richText(data["content"]) } : {}),
          });
        }
      }
    }
  };

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
    let readableContent:
      import("@publisle/schema").InteractiveContent | undefined;
    try {
      const content = inspectReadable(block);
      readableContent = content;
      if (content && !definition)
        collect(
          block,
          traverseDeclared(content, {
            root: EXPLANATION_TRAVERSAL,
            rules: RICH_TRAVERSAL_RULES,
          }).map((visit) => ({
            ...visit,
            pointer: `${block.readable?.binding ?? "/readable/content"}${visit.pointer}`,
          })),
          definition ? "error" : "warning",
        );
    } catch (error) {
      diagnostics.push({
        level: "warning",
        code:
          error instanceof SchemaParseError
            ? error.code
            : error instanceof ResourcePlanningError
              ? error.code
              : "invalid-readable-representation",
        message:
          error instanceof Error
            ? error.message
            : "Invalid readable representation.",
        blockId: block.id,
      });
    }
    if (!definition) {
      diagnostics.push({
        level: options.unknownBlocks === "error" ? "error" : "warning",
        code: "unknown-block-type",
        message: `No block definition is registered for ${block.type}.`,
        blockId: block.id,
      });
      if (options.unknownBlocks !== "error")
        blocks.push({
          ...block,
          data: structuredClone(block.data),
          ...(readableContent
            ? { readableContent: structuredClone(readableContent) }
            : {}),
          prepared: true,
        });
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
        ...(readableContent
          ? { readableContent: structuredClone(readableContent) }
          : {}),
        prepared: true,
      } as PreparedBlock;
      blocks.push(prepared);
      if (definition.semantics)
        diagnostics.push(
          ...validateSemantics(definition.semantics, data).map(
            (diagnostic) => ({
              ...diagnostic,
              level: "error" as const,
              blockId: block.id,
            }),
          ),
        );
      if (definition.traversal)
        collect(prepared, traverseDeclared(data, definition.traversal));
      if (readableContent)
        collect(
          prepared,
          traverseDeclared(readableContent, {
            root: EXPLANATION_TRAVERSAL,
            rules: RICH_TRAVERSAL_RULES,
          }).map((visit) => ({
            ...visit,
            pointer: `${block.readable?.binding ?? "/readable/content"}${visit.pointer}`,
          })),
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
            : error instanceof TraversalError
              ? "invalid-traversal"
              : error instanceof SchemaParseError
                ? error.code
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
        level: reference.level,
        code: "unresolved-cross-reference",
        message: `Cross-reference target ${reference.label} does not exist.`,
        blockId: reference.blockId,
        pointer: reference.pointer,
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
    diagnostics.push(...inspectProfiles(semanticDocument, options, traversal));
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
    traversal,
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
