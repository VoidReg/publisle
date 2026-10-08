# Portable block contracts (beta)

This group defines local export and offline consumption. It does not define document manifests, remote discovery, archival Markdown, resource packaging, behavior execution or independent Python conformance.

## Definition sources and verification

A definition claiming structural portability MUST provide a complete supported `dataSchema`, its offline schema resources, documentation (name, purpose, property meanings, positive input/output examples and negative examples with diagnostic codes), behavior boundaries, reading and semantic projection descriptions, compatibility profiles, publisher/license and required block-contract identities. The lightweight `PortableSchema` descriptor alone is NOT a validator contract.

`schema-first` uses the generated read-only structural parser. Export MUST reject an arbitrary callback labelled schema-first. Simple literal closed-object, primitive and homogeneous-array schemas generate conservative SDK types; complex/ref-based schemas expose `JsonValue` rather than inventing exact TypeScript types. Runtime constraints such as integer domains remain validator assertions, not static type proofs.

`verified-adapter` bridges trusted code-first definitions. Export invokes the approved parser against isolated positive and negative examples, requires exact canonical output equality, validates normalized output and declared semantic bindings, and checks rejection diagnostic codes. This verifies declared fixtures and SDK/parser outputs, NOT universal equivalence between arbitrary code and JSON Schema. Canonical structural schemas need not accept every coercible authoring input. Built-ins and the reference schematic use this bridge to preserve existing authoring behavior.

Parser/refinement, normalization, resource, island and migration callbacks remain implementation-bound. Hook descriptions MUST NOT disappear during export; the exporter adds descriptions for known opaque hooks. Custom executable behavior MUST be declared by its author. Consumers MUST NOT infer missing behavior from function names, descriptions, a canvas, external resources or source strings. Export never serializes callback source and never imports a renderer.

## Sealed contract

`ExportedContract` is `{ id, digest, contract }`. SHA-256 covers the exact UTF-8 JCS bytes of **the entire `contract` body**, with no field exclusions. `digest` is `sha256:<64 lowercase hex>`; `id` is `urn:publisle:contract:` followed by that digest. Seals sit outside their preimage.

The body has profile `urn:publisle:contract:beta`, identity (`type`, payload `schemaVersion`, initial contract format 1, named semantic profile), complete source metadata, exact block-envelope schema, transitive schema resources, traversal and semantic declarations (or null), authored defaults (or null), portability report and immutable block dependency IDs. Format 1 initializes this independent domain; it does not increment any existing package/document/block/artifact/ABI counter. Beta revisions change content digests, not numeric versions. Once pinned, a contract MUST NOT be overwritten or silently repinned.

The envelope combines the shared block envelope with constant type/version and a `data` reference to the contract-local `urn:publisle:contract-data` resource. An identified authored data schema keeps its original ID and reference scope; anonymous schemas receive a local wrapper identity. The original data schema remains in `source.dataSchema`. Shared source dependencies and envelope resources contain only the referenced transitive closure. Property/array/combinator schema positions are traversed; annotation values and example payloads are not interpreted as dependencies. All refs resolve locally; missing resources, conflicting IDs, unsupported schema features and invalid pointer refs fail.

Structural, descriptive, declarative and implementation-bound flags are orthogonal. A descriptive schema can coexist with opaque computation. `declarative` means actual traversal/meaning declarations exist, not that an interpreter reproduces a solver. Projection descriptions disclose the mapping/boundary; they are not executable generators. Optional authored readable or fallback content is not replaced with invented prose. No scientific-equivalence, HTML-safety, accessibility or rendering-fidelity claim follows from these flags.

## Registry subsets, locks and bundles

Export supports a single dependency-free definition, all registry definitions, or the document-used subset with transitive block-contract closure. The subset requires the exact authored type/payload version available in the registry. Export does not migrate source or load renderers. Missing definitions, incompatible versions and dependency cycles fail explicitly. Unused registry entries are excluded. Contracts are reusable per identity, not duplicated per document instance.

A lock (`urn:publisle:contract-lock:beta`) inventories unique sorted root IDs, contract identities/digests/dependency IDs and individual schema resource digests. Schema inventory keys are owner-qualified (`<contract-id>#schema:<schema-resource-id>`), because contract-local data resource IDs may repeat across independently sealed contracts. Each entire schema resource is hashed with the same JCS profile.

A bundle (`urn:publisle:contract-bundle:beta`) contains roots, sealed contracts and their lock. JSON-only consumption checks shape, integrity, complete internal schema refs, declarations/examples, capability consistency, exact dependency identities, root closure and the regenerated lock. Extra unused contracts, duplicate identities, dangling/cyclic dependencies and altered locks fail. No registry modules, callback code, renderer imports or network requests are used during consumption. A valid digest establishes content integrity, NOT publisher trust or permission to execute anything.

## Boundaries

There are at most 128 contracts, unique roots, or supplied schema dependencies per operation; declarations and schema traversal retain the foundation budgets (4096 schema nodes, depth 64). Each positive/negative example list is bounded to 64 entries. Strict JSON wire limits apply to snapshots and bundles. Export may execute trusted parser code for verification and is not a sandbox; unknown-origin schema compilation still requires host isolation/time/memory limits. Failures reject export/validation without rewriting authored source or publishing partial bundles.

The JSON-only validator cannot prove that a publisher disclosed all code or that arbitrary code agrees outside fixtures. Hosts approve implementations separately. No document-provided import string grants execution authority. Complete document exchange/discovery follows in G4; semantic export algorithms/inspection follow in G8.
