import type { BlockId } from "./block-id.ts";
import type { BlockType } from "./block-type.ts";
import type { JsonValue } from "./json.ts";

export interface SerializedBlock {
  id: string;
  type: string;
  schemaVersion: number;
  data: JsonValue;
}

export interface Block<Type extends BlockType = BlockType, Data = JsonValue> {
  id: BlockId;
  type: Type;
  schemaVersion: number;
  data: Data;
}

export interface UnknownBlock {
  id: BlockId;
  type: BlockType;
  schemaVersion: number;
  data: JsonValue;
}
