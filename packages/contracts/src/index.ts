export { canonicalizeJson, digestJson } from "./canonical.ts";
export {
  createSnapshotSchema,
  validateSnapshot,
  type SnapshotTarget,
} from "./snapshot.ts";
export { validateSemanticBindings } from "./semantics.ts";
export { BETA_SCHEMAS, BETA_SCHEMA_DEPENDENCIES } from "./schemas.ts";
export { PORTABLE_PATTERNS } from "./patterns.ts";
export {
  validateStructure,
  type PortableJsonSchema,
  type ContractDiagnostic,
  type StructuralValidation,
} from "./validate.ts";
export {
  collectSchemaClosure,
  inspectPortability,
  exportBlockContract,
  exportRegistryContracts,
  exportDocumentContracts,
  validateBlockContract,
  createContractLock,
  createContractBundle,
  validateContractBundle,
  type ExportableDefinition,
  type ExportableRegistry,
  type PortabilityReport,
  type ContractBody,
  type ExportedContract,
  type ContractLock,
  type ContractBundle,
} from "./export.ts";
export { createSchemaParser, type SchemaValue } from "./schema-first.ts";
export {
  exportSemanticDocument,
  inspectDocument,
  type InspectionOptions,
} from "./inspection.ts";
export {
  resolveContracts,
  lockDocument,
  validateLockedDocument,
  ContractResolutionError,
  type ContractFetchPolicy,
  type ContractResolutionOptions,
} from "./resolution.ts";
