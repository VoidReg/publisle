import type { BlockId } from "./block-id.ts";

export type DiagnosticLevel = "info" | "warning" | "error";

export interface SourceLocation {
  readonly source?: string;
  readonly line: number;
  readonly column: number;
  readonly offset?: number;
}

export interface Diagnostic {
  readonly level: DiagnosticLevel;
  readonly code: string;
  readonly message: string;
  readonly blockId?: BlockId;
  readonly sourceLocation?: SourceLocation;
}
