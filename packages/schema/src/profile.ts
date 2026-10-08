import type { Block } from "./block.ts";
import type { BlockType } from "./block-type.ts";
import type { Diagnostic, DiagnosticLevel } from "./diagnostic.ts";
import type { Document } from "./document.ts";

/** Host-supplied inspection of a read-only, normalized semantic snapshot. */
export interface PublicationProfile {
  readonly name: string;
  /** Bump when inspection behavior changes; used in preparation cache identity. */
  readonly version?: string;
  inspect(document: Document<Block<BlockType, unknown>>): readonly Diagnostic[];
}

/** Applies only to profile diagnostic codes, never structural diagnostics. */
export type DiagnosticPolicy = Readonly<Record<string, DiagnosticLevel>>;
