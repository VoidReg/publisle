# Contract tooling (beta)

Use preparation-only `@publisle/contracts` and strict ingestion from `@publisle/schema`:

```ts
import { parseJson } from "@publisle/schema";
import {
  BETA_SCHEMAS,
  BETA_SCHEMA_DEPENDENCIES,
  validateStructure,
  digestJson,
} from "@publisle/contracts";

const value = parseJson(sourceText);
const schema = BETA_SCHEMAS.document;
const dependencies = BETA_SCHEMA_DEPENDENCIES.filter(
  (entry) => entry !== schema,
);
const result = validateStructure(value, schema, dependencies);
if (!result.valid) console.error(result.diagnostics);
const digest = await digestJson(value);
```

Input may also be UTF-8 bytes; duplicates and invalid Unicode are rejected before a normal parser discards them. Validation returns diagnostics, preserves input and never coerces data, supplies defaults or fetches schemas. Supplying the root schema again as a dependency is a duplicate-ID error. Format annotations do not assert dates/URLs; preparation/profile checks remain separate.

Install/use tooling only at trusted preparation/build/save boundaries. Ajv compiles reviewed schema data here and is not shipped to readers or advertised as a plugin sandbox. Hosts must isolate unknown-origin schema compilation. The finite supported profile returns unsupported-contract for unsupported keywords/patterns/refs.

Versions are frozen during beta. Changed contract content receives a different digest, not a numeric bump. `digestJson` hashes the complete supplied value; it does not remove fields named digest/id. Keep hashes outside their own preimage. Lightweight `PortableSchema` descriptors remain documentation, not complete schemas.

## Schema-first authoring

```ts
import { defineSchemaBlock } from "@publisle/block-sdk";
import counterSource from "@publisle/contracts/fixtures/portable-counter" with { type: "json" };

const counter = defineSchemaBlock({
  type: "example:counter",
  schemaVersion: 1,
  contract: counterSource,
});
counter.schema.parse({ count: 3 }); // strict, read-only structural validation
```

The [counter source](../../packages/contracts/fixtures/portable-counter.json) includes complete documentation, examples, limitations, projections, compatibility and provenance. Literal `dataSchema` objects infer conservative types for simple closed objects/arrays/primitives. Imported JSON schemas or complex refs can expose `JsonValue`; runtime validation remains authoritative. No automatic defaults, coercions or undeclared normalizations occur. Explicit host hooks are still reported as implementation-bound.

For existing typed parsers, keep `definePortableBlock`/`defineInteractiveBlock` and add `contract: ContractSource` with `mode: "verified-adapter"`. For interactive definitions the schema describes the **whole envelope**, not just `payload`. Declare positive input/normalized-output fixtures and negative inputs with the parser's stable diagnostic code. Export rejects output drift or bad rejection codes. The adapter is fixture-verified, not a claim of universal callback equivalence. Built-in metadata is exposed through the data-only `@publisle/contracts/builtin-sources` entry point; no renderer is loaded.

## Export and offline consumption

```ts
import { createRegistry } from "@publisle/core";
import {
  inspectPortability,
  exportBlockContract,
  exportRegistryContracts,
  exportDocumentContracts,
  createContractLock,
  createContractBundle,
  validateBlockContract,
  validateContractBundle,
} from "@publisle/contracts";

const report = inspectPortability(counter); // no parser execution
const contract = await exportBlockContract(counter); // verifies parser fixtures
const registry = createRegistry([counter]);
const all = await exportRegistryContracts(registry);
const subset = await exportDocumentContracts(article, registry);
const lock = await createContractLock([contract], [contract.id]);
const bundle = await createContractBundle([contract], [contract.id]);

// A separate consumer needs JSON alone, not registry/SDK/renderer code.
const checkedContract = await validateBlockContract(parseJson(contractText));
const checkedBundle = await validateContractBundle(parseJson(bundleText));
```

Serialize returned values with `canonicalizeJson` or ordinary JSON serialization for storage. Save `contract.id`/`digest` and the exact content; do not overwrite an existing immutable ID. Single export requires no block dependencies; registry/document export resolves their transitive closure. `collectSchemaClosure` provides the offline schema-resource operation. Unused supplied schemas and registry entries are omitted; exact source versions are required, never silently migrated. The lock describes tooling inventory, not a document manifest.

`inspectPortability` reports schema/documentation/declaration presence and executable exceptions. Export checks the supported schema profile and fixture parity. JSON-only validation checks integrity and internal claims without executing parser code. None of these authorize a host plugin or prove simulation correctness. Tooling stays at preparation/build boundaries: never pass full contracts, a registry or Ajv to a reader solely for rendering.

See the [contract format](../standards/contracts.md) for exact preimages, scopes, limits and remaining groups.

Read the [normative definitions](../standards/README.md) for exact limits, roles, distinctions and remaining work. Shared JSON fixtures are independent-consumer inputs; independent Python conformance is not yet implemented.
