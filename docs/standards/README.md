# Publisle beta standards

These documents define the implemented portable subset independently of SDK types. They are not a claim that the entire standardization roadmap is complete. Start with the [documentation index](../README.md), [Core specification](../../SPECS.md#part-i--publisle-core) and [governance/versioning policy](../governance.md).

## Core and profiles

The standard is split into a lean **Publisle Core** and optional named profiles. Core covers the portable document model, preparation, contracts/exchange, delivery, projections, composition, and the Markdown/JSON boundary — an adopter can validate, publish, and self-host with no TeX, citeproc, template, or container dependency. The **Research profile** ([publishing](publishing.md)) layers scholarly machinery on top and is never a Core dependency (see [core-packages.json](../../packages/core-packages.json) and the lint boundary).

| Set              | Contents                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core             | Schema, core, block SDK, blocks, markdown, contracts, profiles, adapters, Core CLI (validate/upgrade/lock/inspect/semantic/reading)                         |
| Research profile | `@publisle/research`, template packages, `@publisle/cli-research` plugin (export/bibliography/doctor/setup compiler), scholarly and research-paper profiles |

| Contract                        | Normative definition                   | Machine-readable source                                                                                                        |
| ------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Roles, trust and beta changes   | [Conformance](conformance.md)          | [Foundation diagnostics](../../packages/contracts/schemas/foundation-diagnostic.json)                                          |
| JSON boundaries and digests     | [JSON wire profile](json-wire.md)      | Shared canonical fixtures                                                                                                      |
| Structural validation           | [Schema profile](schema-profile.md)    | [Beta schemas](../../packages/contracts/schemas/)                                                                              |
| Preparation                     | [Preparation order](preparation.md)    | Existing preparation APIs and regression fixtures                                                                              |
| Semantic meaning and traversal  | [Meaning and preservation](meaning.md) | Shared declaration, explanation and readable schemas/fixtures                                                                  |
| Portable contracts and bundles  | [Contract export](contracts.md)        | Complete definition sources, sealed exports and offline lock/bundle APIs                                                       |
| Locked source and packages      | [Exchange](exchange.md)                | Immutable manifest, archival grammar and bounded directory I/O                                                                 |
| Native/artifact parity          | [Delivery](delivery.md)                | Common island input, placement and fidelity regression fixtures                                                                |
| Semantic exports and inspection | [Projections](projections.md)          | Linked/standalone JSON and authored reading Markdown                                                                           |
| State and bounded composition   | [Composition](composition.md)          | Closed profile, direct lowering, compatible snapshots and typed ports                                                          |
| Research profile                | [Publishing profiles](publishing.md)   | Bibliography entries, citation resolution, BibTeX, CSL via citeproc, LaTeX/JATS/PDF export, template packages, pinned compiler |
| MyST                            | [MyST mapping](myst.md)                | Loss table exported as `MYST_LOSS_TABLE`                                                                                       |

Research profile version **1 (beta)** requires Core envelope **1** and the
supported pinned contracts; it does not increment envelope or artifact versions.
The [compatibility matrix](../governance.md#core-and-research-compatibility) states
the independent inspection, renderer and citation-role versions and limits.

| Informational material                                   | Scope                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Performance measurements](performance.md)               | Observed preparation costs and reproduction conditions                         |
| [Budget calibration](performance-budgets.md)             | Recorded local comparison; no CI timing/byte enforcement                       |
| [Guides](../README.md#guides)                            | API usage and host/export workflows; normative contracts above take precedence |

## Status and frozen versions

All existing package/document/block/artifact/ABI versions remain unchanged during beta. In particular the document and publication artifact remain at 1, core block payloads at 1, and the already-existing schematic payload at 2. This work does not reset that schematic version or bump other counters.

The workspace schema snapshot may evolve in place before release. Contract content, once pinned by a digest, MUST remain immutable; different content has a different digest. A frozen numeric version alone does not identify an immutable beta contract. Historical beta compatibility is not implied. Conversions preserve original source and require explicit author/host action.

[Governance](../governance.md) defines current change review and beta deprecation disclosure. Stable support windows and version transitions require an explicit release policy. The beta freeze supersedes requirements for immediate envelope/artifact version transitions.

Accessibility guidance and PDF validation evidence are in the [accessibility guide](../guides/accessibility.md).

SDK usage belongs in the [contract](../guides/contracts.md), [meaning](../guides/meaning.md) and [exchange](../guides/exchange.md) guides. GitHub [tracker #28](https://github.com/VoidReg/publisle/issues/28) identifies remaining deliverables. G1–G12 cover JSON/schema foundations, semantic declarations/traversal, unknown readability, sealed contracts, bounded discovery, locked exchange, native/artifact parity, resource provenance, independent Python structural consumption, semantic exports/inspection, directly compiled bounded composition, the interactive publication profile with shared lifecycle and substantive fallback, matched baselines, a recorded scale-budget snapshot that is not a merge gate, and host-side incremental reuse. No universal simulation or full roadmap conformance is claimed.

## Implemented beta changes

- Added strict text/UTF-8 JSON ingestion and JCS/SHA-256 tooling.
- Added read-only offline structural validation and reviewed current-shape schemas.
- Preserved existing version constants, dependencies' placement outside readers, and existing normalization APIs.
- Added renderer-independent meaning, shared nested traversal and explicitly sourced readable preservation; corrected synchronous SHA-256 parity without changing versions.
- Added full contract sources, fixture-verified bridges, schema-first parsing/types, exact dependency subset export and JSON-only integrity/lock validation.
- Added locked manifests, archival Markdown and offline packages, exact JSON island inputs, repeated-placement references and separate reproducibility identities without version increments.
- Added offline Python consumption/precompiled serving, required cross-language/browser evidence and renderer-free semantic/reading exports.
- Added optional bounded state, compatible snapshots, typed relationships/ports and direct JavaScript lowering without adding reader schema/compiler tooling.
- Added an opt-in interactive publication profile, shared keyboard/cancel/focus lifecycle, print and no-JavaScript explanations, and a host-owned Fourier partial-sum example.
- Recorded the reviewed preparation and reader budgets as a local comparison snapshot. GitHub Actions does not enforce them. Host compilation caching reuses unchanged documents without entering reader bundles.
- Added optional bibliography entries, heading roles, table header rows, language direction, and print warnings. Citation resolution, BibTeX, citeproc-backed CSL formatting, and LaTeX, JATS, and PDF article export live in `@publisle/research` behind the Research profile; scholarly and research-paper profiles ship there too. The Core CLI loads research commands through the optional `@publisle/cli-research` plugin, so a Core-only install carries none of it. None of the publishing profiles are mandatory, and they do not select a citation style.
- Broadened the Core accessibility profile to version 2 with WCAG-mapped presence checks (language, heading order, table captions, link names, figure alt) while diagram alt and embed titles stay structural schema requirements.
- Registered the shared static-rendering diagnostic codes (`packages/contracts/rendering-codes.json`) and taught the independent Python renderer presentation MathML for a shared TeX subset; both renderers now assert identical normalized MathML trees from shared fixtures.
- Ported the portable schematic envelope v1→2 migration to the independent Python consumer with shared fixtures (`packages/contracts/fixtures/migrations.json`). The required `pnpm test:conformance:renderer` gate compares static content, normalized MathML, migrated payloads, authored fallback paragraphs, capability limits and future-version rejection. Executable host migrations and full CSL remain outside the compared role; see [conformance](conformance.md#independent-renderer-gate).
- Added an initial MyST mapping with an explicit loss table and opaque preservation for unsupported interactive blocks. A packed schema starter shows a clean-install import.
- Added a bounded independent Research citation role: numeric/author-date styles in English/French, shared citeproc-js-generated expectations, Python HTML integration and identical unsupported-feature refusals. The renderer gate requires this evidence; general CSL remains unclaimed.

Performance evidence: [preparation measurements](performance.md), [profiling analysis](performance-analysis.md), and the [recorded calibration snapshot](performance-budgets.md). Production reader and MDX harness commands and measurement boundaries are documented in [the benchmark instructions](../../tools/benchmarks/README.md).
