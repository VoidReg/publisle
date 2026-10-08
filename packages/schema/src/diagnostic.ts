import type { BlockId } from "./block-id.ts";

export type DiagnosticLevel = "info" | "warning" | "error";

export interface SourceLocation {
  readonly source?: string;
  readonly line: number;
  readonly column: number;
  readonly offset?: number;
}

/** Original-source sidecar; never part of the semantic document wire format. */
export interface DocumentSourceMap {
  readonly document?: SourceLocation;
  readonly blocks: Readonly<Record<string, SourceLocation>>;
}

export function locateDiagnostic(
  diagnostic: Diagnostic,
  sourceMap?: DocumentSourceMap,
): Diagnostic {
  const location =
    diagnostic.sourceLocation ??
    (diagnostic.blockId === undefined
      ? undefined
      : sourceMap?.blocks[diagnostic.blockId]) ??
    sourceMap?.document;
  return location === undefined
    ? diagnostic
    : { ...diagnostic, sourceLocation: location };
}

export interface Diagnostic {
  readonly level: DiagnosticLevel;
  readonly code: string;
  readonly message: string;
  readonly blockId?: BlockId;
  readonly sourceLocation?: SourceLocation;
  /** Present only for optional profile inspection diagnostics. */
  readonly profile?: string;
}
