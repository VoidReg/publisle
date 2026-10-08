import { coreBlockDefinitions } from "@publisle/blocks-core";
import { lockDocument, type ContractBundle } from "@publisle/contracts";
import { createRegistry, prepare, type PrepareOptions } from "@publisle/core";
import {
  fromMarkdown,
  toMarkdown,
  type MarkdownBlockCodec,
} from "@publisle/markdown";
import {
  canonicalizeJson,
  locateDiagnostic,
  parseDocument,
  parseJson,
  JsonBoundaryError,
  SchemaParseError,
  type Diagnostic,
  type Document,
  type DocumentSourceMap,
} from "@publisle/schema";

export interface CliConfig {
  readonly contractBundle?: ContractBundle;
  /** Trusted host configuration, not reader-side code. Core blocks are the default registry. */
  readonly prepare?: PrepareOptions;
  readonly markdown?: { readonly codecs?: readonly MarkdownBlockCodec[] };
}

export interface SourceOperation {
  readonly command: "validate" | "upgrade";
  readonly format: "json" | "markdown";
  readonly sourceName: string;
  readonly config?: CliConfig;
}

export interface SourceResult {
  readonly diagnostics: readonly Diagnostic[];
  /** Present only for a successful upgrade. This API never writes files. */
  readonly output?: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object" && value !== null)
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`;
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function semantics(document: Document): unknown {
  return {
    schemaVersion: document.schemaVersion,
    metadata: document.metadata,
    blocks: document.blocks.map(({ type, schemaVersion, data }) => ({
      type,
      schemaVersion,
      data,
    })),
  };
}

/** Pure orchestration of the public import/parse/prepare/export boundaries. */
export function processSource(
  source: string,
  options: SourceOperation,
): SourceResult {
  const diagnostics: Diagnostic[] = [];
  let sourceMap: DocumentSourceMap | undefined;
  const location = { source: options.sourceName, line: 1, column: 1 };
  const error = (code: string, message: string): SourceResult => ({
    diagnostics: [
      ...diagnostics,
      { level: "error", code, message, sourceLocation: location },
    ],
  });
  const config = options.config ?? {};
  const preparation: PrepareOptions = {
    registry: createRegistry(coreBlockDefinitions),
    unknownBlocks: options.command === "validate" ? "error" : "preserve",
    ...config.prepare,
  };
  const markdownOptions = {
    ...config.markdown,
    sourceName: options.sourceName,
    resolveSchemaVersion: (type: `${string}:${string}`) =>
      preparation.registry.get(type)?.schemaVersion,
  };
  try {
    let input: Document;
    if (options.format === "markdown") {
      const imported = fromMarkdown(source, markdownOptions);
      diagnostics.push(...imported.diagnostics);
      if (!imported.document) return { diagnostics };
      input = imported.document;
      sourceMap = imported.sourceMap;
    } else {
      const raw: unknown = parseJson(source);
      input = parseDocument(raw);
      // Parsing intentionally models only portable fields. An upgrade must not
      // silently discard unmodeled author data at the envelope/block boundary.
      if (options.command === "upgrade" && stable(raw) !== stable(input))
        return error(
          "unmodeled-source-fields",
          "JSON contains fields outside the portable schema; move them into metadata.extensions or a block payload before upgrading.",
        );
    }
    const originalPayloads = new Map(
      input.blocks.map((block) => [
        block.id,
        {
          schemaVersion: block.schemaVersion,
          data: stable(block.data),
        },
      ]),
    );
    const prepared = prepare(input, {
      ...preparation,
      ...(sourceMap ? { sourceMap } : {}),
    });
    diagnostics.push(
      ...prepared.diagnostics.map((item) =>
        locateDiagnostic(item, sourceMap ?? { document: location, blocks: {} }),
      ),
    );
    if (
      !prepared.document ||
      diagnostics.some(({ level }) => level === "error")
    )
      return { diagnostics };
    if (options.command === "validate") return { diagnostics };

    // Explicitly remove preparation flags/plans and serialize only the public wire envelope.
    const upgraded = parseDocument({
      ...(input.dependencies === undefined
        ? {}
        : { dependencies: input.dependencies }),
      ...(input.extensions === undefined
        ? {}
        : { extensions: input.extensions }),
      schemaVersion: prepared.document.schemaVersion,
      ...(prepared.document.metadata === undefined
        ? {}
        : { metadata: prepared.document.metadata }),
      blocks: prepared.document.blocks.map(
        ({ id, type, schemaVersion, data, readable }) => ({
          ...(readable === undefined ? {} : { readable }),
          id,
          type,
          schemaVersion,
          data,
        }),
      ),
    });
    for (const block of upgraded.blocks) {
      const original = originalPayloads.get(block.id);
      if (
        original?.schemaVersion === block.schemaVersion &&
        original.data !== stable(block.data)
      )
        diagnostics.push(
          locateDiagnostic(
            {
              level: "warning",
              code: "block-data-normalized",
              message:
                "Registered parsing/defaults/normalization changed this payload without a version change. Review the upgrade preview before writing.",
              blockId: block.id,
            },
            sourceMap ?? { document: location, blocks: {} },
          ),
        );
    }
    if (options.format === "json")
      return { diagnostics, output: `${JSON.stringify(upgraded, null, 2)}\n` };
    const exported = toMarkdown(upgraded, {
      ...config.markdown,
      policy: "fallback",
    });
    diagnostics.push(
      ...exported.diagnostics.map((item) => locateDiagnostic(item, sourceMap)),
    );
    if (
      exported.markdown === undefined ||
      diagnostics.some(({ level }) => level === "error")
    )
      return { diagnostics };
    const roundTrip = fromMarkdown(exported.markdown, markdownOptions);
    diagnostics.push(...roundTrip.diagnostics);
    if (
      !roundTrip.document ||
      stable(semantics(roundTrip.document)) !== stable(semantics(upgraded))
    )
      return error(
        "markdown-roundtrip-loss",
        "Canonical Markdown cannot preserve this document's upgraded semantics. No output was produced; upgrade the JSON representation instead or fix the host codec.",
      );
    if (diagnostics.some(({ level }) => level === "error"))
      return { diagnostics };
    if (
      upgraded.blocks.some(
        (block, index) => block.id !== roundTrip.document?.blocks[index]?.id,
      )
    )
      diagnostics.push({
        level: "warning",
        code: "markdown-block-ids-changed",
        message:
          "Canonical native Markdown regenerates some block IDs. Stable labels remain; use JSON when block identity must be retained.",
        sourceLocation: location,
      });
    return { diagnostics, output: exported.markdown };
  } catch (cause) {
    return error(
      cause instanceof SchemaParseError || cause instanceof JsonBoundaryError
        ? cause.code
        : "source-operation-failed",
      cause instanceof Error ? cause.message : "Source processing failed.",
    );
  }
}

/** Explicit pinning preview/output; never mutates the original input or repins locked content. */
export async function lockSource(
  source: string,
  options: Omit<SourceOperation, "command">,
): Promise<SourceResult> {
  try {
    const imported =
      options.format === "markdown"
        ? fromMarkdown(source, {
            ...options.config?.markdown,
            sourceName: options.sourceName,
          })
        : undefined;
    if (imported && !imported.document)
      return { diagnostics: imported.diagnostics };
    const raw = imported?.document ?? parseJson(source);
    const document = parseDocument(raw);
    if (canonicalizeJson(raw) !== canonicalizeJson(document))
      throw new Error(
        "Preserve original source: unsupported envelope fields must not be dropped while locking.",
      );
    const registry =
      options.config?.prepare?.registry ?? createRegistry(coreBlockDefinitions);
    const locked = await lockDocument(document, registry);
    if (options.format === "json")
      return {
        output: JSON.stringify(locked.document, null, 2) + "\n",
        diagnostics: imported?.diagnostics ?? [],
      };
    const exported = toMarkdown(locked.document, { policy: "archival" });
    return {
      ...(exported.markdown === undefined ? {} : { output: exported.markdown }),
      diagnostics: [...(imported?.diagnostics ?? []), ...exported.diagnostics],
    };
  } catch (error) {
    return {
      diagnostics: [
        {
          level: "error",
          code:
            error instanceof Error &&
            "code" in error &&
            typeof error.code === "string"
              ? error.code
              : "document-lock-failed",
          message: error instanceof Error ? error.message : "Locking failed.",
          sourceLocation: { source: options.sourceName, line: 1, column: 1 },
        },
      ],
    };
  }
}
