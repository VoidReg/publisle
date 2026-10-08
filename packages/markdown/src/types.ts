import type {
  Diagnostic,
  Document,
  PublicationMetadata,
  DocumentSourceMap,
} from "@publisle/schema";

export interface MarkdownImportOptions {
  readonly sourceName?: string;
}
export type MarkdownExportPolicy = "fallback" | "strict" | "warn" | "standard";
export interface MarkdownExportOptions {
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
