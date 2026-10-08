import type {
  Activation,
  Block,
  BlockDefinition,
  JsonValue,
  DiagnosticPolicy,
  PublicationProfile,
  ResourceReference,
} from "@publisle/schema";

export interface BlockMigration {
  readonly from: number;
  readonly migrate: (data: JsonValue) => unknown;
}

export interface IslandDescriptor {
  readonly activation: Activation;
  readonly displayName?: string;
}

export interface PortableBlockDefinition<
  Type extends `${string}:${string}` = `${string}:${string}`,
  Data = JsonValue,
  SchemaVersion extends number = number,
> extends BlockDefinition<Type, Data, SchemaVersion> {
  readonly defaults?: Partial<Data>;
  readonly migrations?: readonly BlockMigration[];
  normalize?(data: Data): Data;
  resources?(data: Data): readonly ResourceReference[];
  island?(data: Data): IslandDescriptor | undefined;
}

export type AnyPortableBlockDefinition = PortableBlockDefinition<
  `${string}:${string}`,
  unknown,
  number
>;

export interface BlockRegistry {
  readonly definitions: ReadonlyMap<string, AnyPortableBlockDefinition>;
  readonly version: string;
  get(type: string): AnyPortableBlockDefinition | undefined;
}

export interface PrepareOptions {
  readonly registry: BlockRegistry;
  readonly unknownBlocks?: "preserve" | "error";
  readonly profiles?: readonly PublicationProfile[];
  readonly diagnosticPolicy?: DiagnosticPolicy;
}

export interface PreparedKnownBlock extends Block {
  readonly prepared: true;
}
