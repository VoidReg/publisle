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

Versions are frozen during beta. Changed contract content receives a different digest, not a numeric bump. `digestJson` hashes the complete supplied value; it does not remove fields named digest/id. Keep hashes outside their own preimage. Existing lightweight PortableSchema descriptors remain documentation until the schema-first/export group.

Read the [normative definitions](../standards/README.md) for exact limits, roles, distinctions and remaining work. Shared JSON fixtures are independent-consumer inputs; independent Python conformance is not yet implemented.
