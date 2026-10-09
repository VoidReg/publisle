# Publisle beta standards

These documents define the implemented portable subset independently of SDK types. They are not a claim that the entire standardization roadmap is complete.

| Contract                        | Normative definition                    | Machine-readable source                                                                                                     |
| ------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Roles, trust and beta changes   | [Conformance](conformance.md)           | [Foundation diagnostics](../../packages/contracts/schemas/foundation-diagnostic.json)                                       |
| JSON boundaries and digests     | [JSON wire profile](json-wire.md)       | Shared canonical fixtures                                                                                                   |
| Structural validation           | [Schema profile](schema-profile.md)     | [Beta schemas](../../packages/contracts/schemas/)                                                                           |
| Preparation                     | [Preparation order](preparation.md)     | Existing preparation APIs and regression fixtures                                                                           |
| Semantic meaning and traversal  | [Meaning and preservation](meaning.md)  | Shared declaration, explanation and readable schemas/fixtures                                                               |
| Portable contracts and bundles  | [Contract export](contracts.md)         | Complete definition sources, sealed exports and offline lock/bundle APIs                                                    |
| Locked source and packages      | [Exchange](exchange.md)                 | Immutable manifest, archival grammar and bounded directory I/O                                                              |
| Native/artifact parity          | [Delivery](delivery.md)                 | Common island input, placement and fidelity regression fixtures                                                             |
| Semantic exports and inspection | [Projections](projections.md)           | Linked/standalone JSON and authored reading Markdown                                                                        |
| State and bounded composition   | [Composition](composition.md)           | Closed profile, direct lowering, compatible snapshots and typed ports                                                       |
| Matched baselines               | [Performance baselines](performance.md) | Review snapshot of prepare time and bytes; recorded caps are not a merge gate                                               |
| Scholarly and publishing        | [Publishing profiles](publishing.md)    | Bibliography entries, citation resolution, BibTeX, CSL subset, LaTeX, JATS, PDF, direction, header rows, and print warnings |
| MyST                            | [MyST mapping](myst.md)                 | Loss table exported as `MYST_LOSS_TABLE`                                                                                    |

## Status and frozen versions

All existing package/document/block/artifact/ABI versions remain unchanged during beta. In particular the document and publication artifact remain at 1, core block payloads at 1, and the already-existing schematic payload at 2. This work does not reset that schematic version or bump other counters.

The workspace schema snapshot may evolve in place before release. Contract content, once pinned by a digest, MUST remain immutable; different content has a different digest. A frozen numeric version alone does not identify an immutable beta contract. Historical beta compatibility is not implied. Conversions preserve original source and require explicit author/host action.

Future version domains, transitions and deprecation enforcement are design policy only until release preparation is authorized. The beta freeze supersedes requirements for immediate envelope/artifact version transitions.

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
- Added optional bibliography entries, heading roles, table header rows, language direction, and print warnings. Citation resolution, BibTeX, a supported CSL subset, and LaTeX, JATS, and PDF article export live in `@publisle/research`. None of the publishing profiles are mandatory, and they do not select a citation style.
- Added an initial MyST mapping with an explicit loss table and opaque preservation for unsupported interactive blocks. A packed schema starter shows a clean-install import.

Performance evidence: [preparation measurements](performance.md), [profiling analysis](performance-analysis.md), and the [recorded calibration snapshot](performance-budgets.md). Production reader and MDX harness commands and measurement boundaries are documented in [the benchmark instructions](../../tools/benchmarks/README.md).
