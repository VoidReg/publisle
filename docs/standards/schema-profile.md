# Portable structural schema profile

The profile uses [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-validation). The implementation is offline, read-only and preparation-only. It distinguishes invalid-json, invalid-contract, unsupported-contract and invalid-data. Unsupported required features MUST NOT return successful validation.

## Supported subset

- Boolean schemas; root $schema, absolute $id, $vocabulary; supplied-set $ref and $defs.
- type, enum, const; required, properties, additionalProperties, minProperties/maxProperties.
- items, prefixItems, minItems/maxItems, uniqueItems.
- minLength/maxLength, reviewed pattern, format annotations.
- minimum/maximum, exclusiveMinimum/exclusiveMaximum, multipleOf.
- allOf/anyOf/oneOf/not/if/then/else.
- title, description, default, examples, $comment, deprecated, readOnly, writeOnly annotations.

Other keywords (including dynamic refs, anchors, unevaluated keywords and content evaluation) are unsupported, not ignored. Dialect/ID/vocabulary declarations are root-only. Unknown optional vocabulary declarations may be retained, but their unknown keywords remain unsupported if present. Required core/applicator/validation/meta-data/format-annotation vocabularies are supported only within this declared subset; consumers must still inspect individual keywords.

format is annotation-only: no date/URI/other format assertion, no implicit remote access. Defaults/examples are JSON annotations, never validation mutations. Numerical multipleOf follows ordinary binary64; use declared exact numeric strings where precision matters.

## Pattern policy and limits

The initial profile permits only the finite reviewed [pattern set](../../packages/contracts/src/patterns.ts). It includes UUID/ULID, namespaced IDs, labels, nonblank strings, timestamp syntax, exact numeric strings and SHA-256 digest spelling. Arbitrary user regexes return unsupported-contract. Additions require cross-language fixtures and complexity review; do not quietly pass untested regex semantics to another language's engine.

Default limits: 128 supplied dependencies, 8 MiB aggregate schema JSON, 4096 schema nodes, schema depth 64, 16 branches per applicator, zero-consumption evaluation depth 128; each JSON schema/data input also obeys the wire limits. Resolved references must identify root or JSON Pointer locations in the supplied schema set. No fetch or code execution is implied. Relative external references and anchors are not supported in this first profile; supply absolute resource IDs and fixed pointer fragments.

Productive recursion through child values is permitted, including recursive rich content. Cycles of refs/combinators evaluating the same instance indefinitely are rejected. These structural limits do not make synchronous validator compilation a hostile-schema sandbox; hosts must isolate untrusted-origin compilation. [Contract resolution](exchange.md#resolution-and-trust) separately bounds dependency graphs and retrieval; scale-specific performance budgets remain later work.

## Published beta shapes

Schemas define normalized canonical shapes, not every coercion accepted by current authoring callbacks. Envelope schemaVersion remains 1; core payload versions remain 1; the existing interactive schematic remains 2. Known built-in types validate against their current payload schema; unknown namespaced types retain arbitrary JSON under the generic block envelope. This validates preservation shape only, not unknown plugin semantics. Do not let an invalid known built-in escape validation through the unknown branch.

The schema set covers metadata; every core block; recursive inline/flow/list-item nodes; shared interactive envelope and technical schematic; semantic/traversal declarations, explanation slots and readable associations. References are identifiers for locally supplied schema resources, not endpoints to fetch. See [meaning and preservation](meaning.md) for additional integrity checks. Sealed bundles, locked exchange and artifact inputs also have explicit bounded validators/contracts; behavior schemas remain later work.

Closed normalized objects reject undeclared properties. metadata.extensions and unknown payload objects remain explicit extensibility locations. Missing figure alt, decorative empty alt and descriptive alt stay distinct; structural validation does not enforce editorial accessibility policy.

ID uniqueness, cross-reference integrity, actual calendar validity, table alignment widths, semantic correctness, HTML safety and accessibility usability require separate semantic/profile/host checks. SDK output fixtures verify the supported subset; arbitrary existing callbacks are not presumed exportable or equivalent. No schema engine enters production reader output.
