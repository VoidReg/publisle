export { prepare, assertPrepared } from "./prepare.ts";
export {
  CompilationCacheError,
  compileCorpus,
  createCompilationCache,
  type CompilationCache,
  type CompileCorpusOptions,
  type CompileCorpusResult,
  type CorpusDocument,
  type CorpusDocumentResult,
  type SharedCacheEntry,
} from "./compilation.ts";
export { sha256Hex } from "./hash.ts";
export { createRegistry } from "./registry.ts";
export { getBlockSourceDigest, inspectReadable } from "./readable.ts";
export {
  getDocumentMetadata,
  getDocumentOutline,
  getDocumentReferences,
  type DocumentOutlineEntry,
} from "./document-helpers.ts";
export type { DiagnosticPolicy, PublicationProfile } from "@publisle/schema";
export type {
  AnyPortableBlockDefinition,
  BlockMigration,
  DocumentMigration,
  BlockRegistry,
  IslandDescriptor,
  PortableBlockDefinition,
  PrepareOptions,
  RegistryOptions,
  ResourceResolution,
  ResourceResolver,
} from "./types.ts";
