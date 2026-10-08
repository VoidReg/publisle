import type {
  Diagnostic,
  Document,
  PublicationMetadata,
  DocumentSourceMap,
  Block,
  BlockType,
  SourceLocation,
} from "@publisle/schema";
import type { RootContent } from "mdast";
import type { ContainerDirective } from "mdast-util-directive";

/** Tooling-only native block directive codec; callbacks are trusted host code. */
export interface MarkdownBlockCodec {
  readonly type: BlockType;
  readonly directive: string;
  readonly schemaVersion: number;
  decode(
    node: Readonly<ContainerDirective>,
    context: {
      readonly schemaVersion: number;
      readonly sourceLocation: SourceLocation;
    },
  ): unknown;
  /** Native policies must return this codec's container directive. Standard may return plain Markdown. */
  encode(
    block: Readonly<Block<BlockType, unknown>>,
    context: MarkdownExportOptions,
  ): RootContent | undefined;
}

export interface MarkdownImportOptions {
  readonly sourceName?: string;
  readonly codecs?: readonly MarkdownBlockCodec[];
  /** Current schema version lookup; no migration or validation occurs during import. */
  readonly resolveSchemaVersion?: (type: BlockType) => number | undefined;
}
export type MarkdownExportPolicy =
  "fallback" | "strict" | "warn" | "standard" | "archival";
export interface MarkdownExportOptions {
  readonly policy?: MarkdownExportPolicy;
  readonly payloadFormatting?: "pretty" | "compact";
  readonly codecs?: readonly MarkdownBlockCodec[];
}
export interface MarkdownFormatOptions extends MarkdownImportOptions {
  readonly policy?: MarkdownExportPolicy;
  readonly payloadFormatting?: "pretty" | "compact";
}
export interface MarkdownImportResult {
  readonly sourceMap?: DocumentSourceMap;
  readonly document?: Document;
  readonly diagnostics: readonly Diagnostic[];
}
export interface MarkdownExportResult {
  readonly markdown?: string;
  readonly diagnostics: readonly Diagnostic[];
}
export interface MarkdownFormatResult extends MarkdownExportResult {
  readonly metadata?: PublicationMetadata;
}
