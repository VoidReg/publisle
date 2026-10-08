# Preparation order and normalization boundaries

The foundation group does not change existing preparation callbacks or silently enable new structural defaults.

1. Preserve original input; decode strict JSON/UTF-8 or import authored Markdown with diagnostics and source locations.
2. Inspect the supported envelope and identify required contracts. Pinned discovery/lock checks are a later group; current registries remain trusted host inputs.
3. If explicitly requested, apply approved document conversions/migrations to a new candidate. Rendering alone never rewrites source.
4. Resolve known definitions; unknown content follows explicit error/warn/preserve policy.
5. Apply declared block migrations, then definition defaults, schema parsing and normalization in the existing trusted preparation boundary. Executable behavior must be declared as such; JSON Schema validation itself performs none of these operations.
6. Validate normalized candidates against the supported structural contract, then semantic references/resources and optional publication profiles. The foundation validator is opt-in tooling; schema-first integration and traversal unification follow in later groups.
7. Generate reference/resource/render plans and diagnostics; compile target-specific output through approved host implementations.
8. Serialize publication output separately from canonical source. Keep parsers, validators, contract catalogs and conversion tooling outside readers.

Current authoring parsers may fill defaults or coerce fields (for example heading level, list ordering, math display and callout variant). Published schemas describe normalized shapes and reject invalid canonical values instead of performing those coercions. An absent activation may become visible in the existing interactive parser; structural validation requires the normalized activation field and does not insert it. Missing optional values and explicit null are not interchangeable.

A schema-only consumer must report required executable work as unsupported. A successful structural check is not evidence that migrations ran, resources resolved, semantic bindings are correct, or the output is safe. Conversion tools preserve source, preview by default and diagnose loss rather than inventing missing meaning. Historical beta shapes are preserved explicitly, not reclassified by silently incrementing a version.
