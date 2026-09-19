import type { Block, SerializedBlock, UnknownBlock } from "./block.ts";
import type { JsonValue } from "./json.ts";

export interface SerializedDocument {
  schemaVersion: number;
  metadata: Record<string, JsonValue>;
  blocks: SerializedBlock[];
}

export interface Document<Blocks extends Block = UnknownBlock> {
  schemaVersion: number;
  metadata: Record<string, JsonValue>;
  blocks: Blocks[];
}
