import type { BlockMigration, PortableBlockDefinition } from "@publisle/core";
import { createSchemaParser, type SchemaValue } from "@publisle/contracts";
import {
  defineBlock,
  parseInteractiveEnvelope,
  type InteractiveContentParsers,
  type InteractiveEnvelope,
  type JsonValue,
  type PortableSchema,
  type ResourceReference,
  type Schema,
  INTERACTIVE_TRAVERSAL,
  type TraversalDeclaration,
  type SemanticDeclaration,
  type ContractSource,
  type ContractSchema,
} from "@publisle/schema";

export interface InteractiveBlockDescriptor {
  readonly displayName: string;
  readonly description: string;
  readonly payloadSchema: PortableSchema;
  readonly documentation?: string;
  readonly examples?: readonly JsonValue[];
  readonly capabilities?: {
    readonly staticRendering?: boolean;
    readonly networkAccess?: boolean;
    readonly hostServices?: readonly string[];
  };
}

export function migrateInteractiveEnvelope(data: JsonValue): JsonValue {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return data;
  const { alt, ...rest } = data as Record<string, JsonValue> & {
    alt?: JsonValue;
  };
  if (typeof alt !== "string") return rest;
  const existing = rest["accessibility"];
  const accessibility: Record<string, JsonValue> = {};
  if (
    typeof existing === "object" &&
    existing !== null &&
    !Array.isArray(existing)
  ) {
    const record = existing as Record<string, JsonValue>;
    for (const key of Object.keys(record)) {
      const entry = record[key];
      if (entry !== undefined) accessibility[key] = entry;
    }
  }
  if (accessibility["label"] === undefined) accessibility["label"] = alt;
  return { ...rest, accessibility };
}

export function definePortableBlock<
  const Type extends `${string}:${string}`,
  Data,
  const Version extends number,
>(
  definition: PortableBlockDefinition<Type, Data, Version>,
): PortableBlockDefinition<Type, Data, Version> {
  defineBlock(definition);
  return definition;
}

/** Complete schema is the source of truth; generated parser/type cannot silently diverge. */
export function defineSchemaBlock<
  const Type extends `${string}:${string}`,
  const Version extends number,
  const S extends ContractSchema,
>(
  definition: Omit<
    PortableBlockDefinition<Type, SchemaValue<S>, Version>,
    "schema" | "contract" | "defaults"
  > & {
    readonly contract: Omit<ContractSource, "mode" | "dataSchema"> & {
      readonly dataSchema: S;
    };
  },
): Omit<
  PortableBlockDefinition<Type, SchemaValue<S>, Version>,
  "defaults" | "contract"
> & { readonly contract: ContractSource } {
  const result = {
    ...definition,
    contract: { ...definition.contract, mode: "schema-first" as const },
    schema: createSchemaParser(
      definition.contract.dataSchema,
      definition.contract.schemaDependencies,
    ),
  };
  defineBlock(result);
  return result;
}

export function defineInteractiveBlock<
  const Type extends `${string}:${string}`,
  Payload,
  const Version extends number,
>(definition: {
  readonly type: Type;
  readonly schemaVersion: Version;
  readonly schema: Schema<Payload>;
  /** Describes the complete interactive envelope, not just its payload. */
  readonly contract?: ContractSource;
  readonly descriptor: InteractiveBlockDescriptor;
  readonly traversal?: TraversalDeclaration;
  readonly semantics?: SemanticDeclaration;
  readonly content?: InteractiveContentParsers;
  readonly defaults?: Partial<InteractiveEnvelope<Payload>>;
  readonly migrations?: readonly BlockMigration[];
  readonly normalize?: (
    data: InteractiveEnvelope<Payload>,
  ) => InteractiveEnvelope<Payload>;
  readonly resources?: (payload: Payload) => readonly ResourceReference[];
}): PortableBlockDefinition<Type, InteractiveEnvelope<Payload>, Version> & {
  readonly descriptor: InteractiveBlockDescriptor;
} {
  const resources = definition.resources;
  const block = definePortableBlock<
    Type,
    InteractiveEnvelope<Payload>,
    Version
  >({
    type: definition.type,
    schemaVersion: definition.schemaVersion,
    ...(definition.contract === undefined
      ? {}
      : { contract: definition.contract }),
    traversal: definition.traversal ?? INTERACTIVE_TRAVERSAL,
    ...(definition.semantics === undefined
      ? {}
      : { semantics: definition.semantics }),
    schema: {
      parse(value): InteractiveEnvelope<Payload> {
        return parseInteractiveEnvelope(
          value,
          (payload) => definition.schema.parse(payload),
          definition.content,
        );
      },
    },
    island(data) {
      return {
        activation: data.activation,
        displayName: definition.descriptor.displayName,
      };
    },
    ...(definition.defaults === undefined
      ? {}
      : { defaults: definition.defaults }),
    ...(definition.migrations === undefined
      ? {}
      : { migrations: definition.migrations }),
    ...(definition.normalize === undefined
      ? {}
      : { normalize: definition.normalize }),
    ...(resources === undefined
      ? {}
      : {
          resources(data) {
            return resources(data.payload);
          },
        }),
  });
  return { ...block, descriptor: definition.descriptor };
}

export { createBlock, document } from "@publisle/schema";
export type { PortableBlockDefinition } from "@publisle/core";
