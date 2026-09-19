import { parseBlockType } from "./block-type.ts";
import type { BlockType } from "./block-type.ts";
import type { Block } from "./block.ts";
import type { JsonValue } from "./json.ts";

export interface Schema<Data = JsonValue> {
  parse(value: unknown): Data;
}

export type InferSchema<S> = S extends Schema<infer Data> ? Data : never;

export interface BlockDefinition<
  Type extends BlockType = BlockType,
  Data = JsonValue,
  SchemaVersion extends number = number,
> {
  readonly type: Type;
  readonly schemaVersion: SchemaVersion;
  readonly schema: Schema<Data>;
}

export function defineBlock<
  const Type extends BlockType,
  Data,
  const SchemaVersion extends number,
>(
  definition: BlockDefinition<Type, Data, SchemaVersion>,
): BlockDefinition<Type, Data, SchemaVersion> {
  parseBlockType(definition.type);
  return definition;
}

export type BlockFromDefinition<Definition> =
  Definition extends BlockDefinition<infer Type, infer Data>
    ? Block<Type, Data>
    : never;

export type KnownBlockFrom<Definitions extends readonly unknown[]> =
  BlockFromDefinition<Definitions[number]>;
