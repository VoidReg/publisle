import type {
  Activation,
  Block,
  BlockDefinition,
  JsonValue,
  DiagnosticPolicy,
  Document,
  DocumentSourceMap,
  PublicationProfile,
  ResourceReference,
  TraversalDeclaration,
  SemanticDeclaration,
  ContractSource,
  ContractDependency,
} from "@publisle/schema";

export interface BlockMigration {
  readonly from: number;
  readonly migrate: (data: JsonValue) => unknown;
}

export interface DocumentMigration {
  readonly from: number;
  /** Return a complete envelope at exactly from + 1; receives an isolated copy. */
  readonly migrate: (
    document: Document<Block<`${string}:${string}`, unknown>>,
  ) => unknown;
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
  readonly contract?: ContractSource;
  readonly traversal?: TraversalDeclaration;
  readonly semantics?: SemanticDeclaration;
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

export interface RegistryOptions {
  /** Host identity for opaque preparation behavior; frozen beta versions are not revision IDs. */
  readonly preparationVersion?: string;
}

export interface ResourceResolution {
  readonly resolvedLocation?: string;
  readonly mediaType?: string;
  readonly byteDigest?: `sha256:${string}`;
  readonly external?: boolean;
  readonly dataset?: JsonValue;
  /** Optional canonical URI; defaults to the normalized requested URI. */
  readonly uri?: string;
  /** Stable content hash or revision, never a timestamp generated during preparation. */
  readonly version: string;
  /** Host-resolved document-relative or absolute source references, not transform requests. */
  readonly dependencies?: readonly { readonly uri: string }[];
}

export interface ResourceResolver {
  /** Source-relative resolution base is an input even when URIs appear unchanged. */
  readonly base?: string;
  /** Bump when resolver configuration/behavior changes; actual content uses result.version. */
  readonly version: string;
  /** Undefined means missing. Core performs no I/O. Called once per normalized URI per prepare. */
  resolve(source: { readonly uri: string }): ResourceResolution | undefined;
}

export interface PrepareOptions {
  /** Approved host pins derived from a verified offline bundle; no discovery happens here. */
  readonly contractPins?: readonly ContractDependency[];
  readonly registry: BlockRegistry;
  readonly unknownBlocks?: "preserve" | "error";
  readonly profiles?: readonly PublicationProfile[];
  readonly diagnosticPolicy?: DiagnosticPolicy;
  readonly documentMigrations?: readonly DocumentMigration[];
  readonly sourceMap?: DocumentSourceMap;
  readonly resourceResolver?: ResourceResolver;
  /** Cache namespace/version for host preparation configuration, including envelope migrations. */
  readonly preparationVersion?: string;
}

export interface PreparedKnownBlock extends Block {
  readonly prepared: true;
}
