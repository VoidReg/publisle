# Conformance roles and trust

A consumer MUST state the role, supported schema/profile subset and fixture evidence behind its claims. No role alone implies the others.

| Role                   | Minimum responsibility                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Archival reader/writer | Preserve supported envelopes and opaque data without executing it; report unsupported preservation               |
| Structural validator   | Validate supported pinned schemas offline; distinguish invalid data, invalid contracts and unsupported contracts |
| Semantic consumer      | Expose declared meaning and unresolved limitations without inferring arbitrary code behavior                     |
| Preparer               | Apply explicit approved preparation steps; disclose executable requirements                                      |
| Static compiler        | Lower supported content to readable output with diagnostics and fidelity limitations                             |
| Interactive renderer   | Implement its declared behavior and lifecycle, not claim universal simulation                                    |
| Artifact server        | Store/serve approved precompiled HTML/assets without recompiling each request                                    |

These are role definitions, not declarations that every role is currently implemented. Current tooling provides JSON/digests, structural validation, descriptive meaning, bounded traversal, readable preservation, locked archival exchange, renderer-free semantic exports/inspection and native/artifact delivery checks. The [independent Python consumer and precompiled host](../../tools/python/README.md) have offline and real-browser evidence. Python reports semantic/traversal execution and opaque hooks as unsupported rather than claiming full preparer/renderer conformance. [Bounded composition](composition.md) has direct JavaScript lowering, scalar state, compatible snapshots and typed port propagation; it does not implement arbitrary simulation.

## Required P0 gate

`pnpm test:conformance:p0` runs the Python standard-library suite, TypeScript unit
suite and Chromium acceptance suite, then verifies required passing evidence for
every TEST-01–10 group and this batch's P1 TEST-11/12/13 in `tools/p0-gate.ts`. Empty, missing or skipped evidence is
an error. CI installs Python 3.11 and executes this gate in its required check job.

## Claim and evidence matrix

The TEST identifiers name the requirement groups summarized below.
Rows describe bounded evidence rather than certifying a future checkout. TEST-01–13
are required by the [fresh-report P0 gate](../../tools/p0-gate.ts); their linked
sources identify the passing assertions that the gate must find. The independent
renderer contribution to TEST-01 has its own
[required gate](../../tools/renderer-gate.ts). Run both gates for the revision
being claimed; stored documentation is not the report.

| Test    | Claim and scope                                                                                                   | Executable evidence / explicit limit                                                                                                                                                                                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TEST-01 | Independent structural classifications, JCS Unicode/binary64 digests and the declared static renderer corpus      | [Independent validator fixtures](../../packages/contracts/tests/independent.test.ts), [Python tests](../../tools/python/), [static/MathML parity](../../packages/adapter-core/tests/python-rendering.test.ts), [migration/fallback/refusal parity](../../packages/adapter-core/tests/renderer-parity.test.ts); P0 + renderer gates                               |
| TEST-02 | Offline built-in closure and exact transitive contract resolution                                                 | [Independent locked closure](../../packages/contracts/tests/independent.test.ts), [export dependency fixtures](../../packages/contracts/tests/export.test.ts); P0                                                                                                                                                                                                |
| TEST-03 | Unfamiliar declarations are exposed as JSON without renderer execution                                            | [Meaning fixtures](../../packages/contracts/tests/meaning.test.ts); P0                                                                                                                                                                                                                                                                                           |
| TEST-04 | Executable refinements, normalization and migrations remain implementation-bound                                  | [Export capability/refusal fixtures](../../packages/contracts/tests/export.test.ts); P0; universal callback portability is not claimed                                                                                                                                                                                                                           |
| TEST-05 | JSON object, array, scalar and null inputs match native/artifact delivery                                         | [React delivery](../../packages/adapter-react/tests/delivery.acceptance.test.ts), [Svelte delivery](../../packages/adapter-svelte/tests/delivery.acceptance.test.ts); P0 Chromium                                                                                                                                                                                |
| TEST-06 | Missing contracts/plugins retain opaque source and substantive no-JavaScript explanation                          | [Preservation fixtures](../../packages/core/tests/meaning.test.ts), [shared browser acceptance](../../packages/adapter-core/tests/adapter-acceptance.ts); P0                                                                                                                                                                                                     |
| TEST-07 | Unsupported vocabulary/pattern/ref/branching and substituted digests reject                                       | [Structural refusal fixtures](../../packages/contracts/tests/structural.test.ts), [seal tampering](../../packages/contracts/tests/export.test.ts); P0                                                                                                                                                                                                            |
| TEST-08 | Archival Markdown identity/pins and locked JSON/resource exchange round-trip                                      | [Archival Markdown](../../packages/markdown/tests/archive.test.ts), [exchange fixtures](../../packages/contracts/tests/exchange.test.ts); P0                                                                                                                                                                                                                     |
| TEST-09 | Independent Python host serves compiled islands, shared chunks, independent placements and no-JavaScript fallback | [Python host Chromium acceptance](../../packages/adapter-core/tests/python.acceptance.test.ts); P0; Python does not execute arbitrary plugin semantics                                                                                                                                                                                                           |
| TEST-10 | Production readers exclude registry/schema/core/compiler/Ajv and retain lifecycle/module/state behavior           | [React production](../../packages/adapter-react/tests/production.acceptance.test.ts), [Svelte production](../../packages/adapter-svelte/tests/production.acceptance.test.ts), [Python host](../../packages/adapter-core/tests/python.acceptance.test.ts); P0                                                                                                     |
| TEST-11 | Fourier sample numerics, native/artifact delivery, renderer-free inspection and authored reading projection       | [Numerical fixtures](../../examples/playground-core/tests/fourier.test.ts), [Fourier browser fixtures](../../packages/adapter-core/tests/fourier.acceptance.test.ts), [inspection](../../packages/contracts/tests/inspection.test.ts), [reading projection](../../packages/markdown/tests/reading.test.ts); P0; arbitrary scientific verification is not claimed |
| TEST-12 | Keyboard activation/focus, cancellation, reduced motion and substantive print/no-JavaScript alternatives          | [Lifecycle browser fixtures](../../packages/adapter-core/tests/lifecycle.acceptance.test.ts), [interactive profile fixtures](../../packages/profiles/tests/interactive-publication.test.ts); P0; universal accessibility conformance is not claimed                                                                                                              |
| TEST-13 | Sealed bounded composition, compatible snapshots, typed ports and isolated repeated placements                    | [Profile sealing](../../packages/contracts/tests/composition.test.ts), [composition unit fixtures](../../packages/adapter-core/tests/composition.test.ts), [browser isolation](../../packages/adapter-core/tests/composition.acceptance.test.ts); P0; arbitrary simulation is not claimed                                                                        |
| TEST-14 | Full corpus/instance-scale contract and module deduplication claim **not claimed**                                | Scoped [host cache deduplication](../../packages/core/tests/compilation.test.ts) and [browser module sharing](../../packages/adapter-core/tests/adapter-acceptance.ts) pass through the unit/browser suites; [scale measurements](../../tools/benchmarks/README.md) are local observations, not a required complete TEST-14 gate                                 |
| TEST-15 | Affected-only host compilation reuse for changed documents, contract/resource identities and shared dependencies  | [Compilation cache regression fixtures](../../packages/core/tests/compilation.test.ts) run in `pnpm test` and the P0 unit run; persistent storage/watch infrastructure and arbitrary host caches are not claimed                                                                                                                                                 |
| TEST-16 | Universal matched performance/cost claim **not claimed**                                                          | [Reproduction harness](../../tools/benchmarks/README.md), [measured preparation report](performance.md), [calibration snapshot and limits](performance-budgets.md); no required CI timing/byte comparison; heap, long tasks, CLS and unmeasured comparators remain observations                                                                                  |

These are scoped profile/fixture claims, not universal parser equivalence,
scientific verification or a declaration that arbitrary HTML is safe.

## Independent renderer gate

`pnpm test:conformance:renderer` is the required CI sibling of the P0 gate.
It runs the Python suite and requires passing TypeScript evidence for the
shared static document, normalized MathML trees, built-in migration payloads,
the fallback/refusal cases in `packages/contracts/fixtures/renderer-parity.json`,
and the Research citation corpus in `packages/contracts/fixtures/citations.json`.
Missing, skipped or failing
evidence fails the gate, including an unavailable Python executable.

The compared TypeScript configuration uses only built-in definitions and no
host renderers or host migrations. Both implementations declare the same static
role: schema version 1, portable built-in migrations, no plugins, no full CSL.
The schematic v1→2 conversion runs before rendering; future schematic and
document versions reject the document with the existing shared version codes.
Source inputs remain immutable. Authored fallback paragraph structure/text and
diagnostic code sets must match. Host wrappers and KaTeX's visual spans may differ;
the math comparison removes annotations and compares presentation MathML.

This evidence covers the committed corpus, not arbitrary HTML tree equivalence.
Full CSL, executable host migration parity and arbitrary plugin execution are
not claimed. The TypeScript preparer can separately execute host-approved
migrations; that capability is outside this portable renderer configuration.

The optional Research citation role compares `resolvePortableCitations` from
`@publisle/research` (citeproc-js) with `tools/python/citations.py` and its Python
HTML integration. Both consume the same source documents, declare the capability
record in `packages/contracts/citation-subset.json`, and reject unsupported
features with `unsupported-citation-feature`. The corpus covers numeric and
author-date styles, `en-US`/`fr-FR`, first-appearance numbering, numeric ranges,
author/year bibliography sorting, et-al names, identical-author year suffixes,
locators, missing/duplicate references, literal references and punctuation.
Markers and reference-list text are whitespace-normalized; bibliography ids,
labels, ordering, classification and diagnostic code sets must match exactly.

This role admits only paragraphs/headings and bibliography blocks with v1
payloads. Names use the restricted ASCII `Family` / `Family, Given` form in the
descriptor; years and ranges have explicit patterns. General CSL XML/macros,
structured names, particles, given-name/coauthor disambiguation, quotation
processing, BibTeX acquisition, other locales and other block locations are
rejected by both implementations under this role. The broader TypeScript
`resolveDocument` API remains outside this parity claim. The gate also verifies
the expectations generator's citeproc-js 2.4.63 pin; expectations are regenerated
only with `pnpm generate:citations` and reviewed as source changes.

## Research artifact evidence

Research export validation is separate from TEST-01–16 and Core reader claims.
The current local verification on 2026-10-10 passed the following bounded checks;
CI must rerun them for the revision it reports.

| Claim                                                   | Evidence and limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard `article` and `article-arabic` PDF/UA fixtures | [`pnpm test:pdf-ua`](../../packages/research/tests/pdf-ua.integration.test.ts) passes three fixtures through the pinned container and veraPDF: English UA-2, the [authored Arabic article](../../examples/articles/article-arabic.md) UA-2, and English UA-1. Checks include PDF 2.0 for UA-2 / PDF 1.7 for UA-1, tagged structure, language metadata, figure/Formula tags, column-scoped table headers, attached MathML and extracted Arabic/Han text. The [strict report checker](../../tools/validate_pdf_ua.py) requires one compliant result for the selected UA-1/UA-2 flavour with no failed rules/checks or job errors. On 2026-10-10 all three fixtures passed on the pinned amd64 compiler image natively and on the arm64 compiler image under QEMU emulation (`linux/arm64` confirmed by `docker image inspect`). |
| Publisher/source export compatibility                   | [`pnpm test:research`](../../vitest.research.config.ts) passes all 14 local integration checks with the container test enabled, including [publisher starters](../../packages/research/tests/templates.integration.test.ts) and [source rebuilds](../../packages/research/tests/latex.integration.test.ts). Compiler success does not establish publisher PDF/UA or journal acceptance.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| CI reproducibility                                      | The [Research workflow](../../.github/workflows/research.yml) installs [checksum-pinned veraPDF](../../tools/install-verapdf.py), runs the artifact gates and uploads PDFs, sources, logs and XML reports as `research-exports-and-pdf-ua-reports`. A hosted run of revision `e95916c` (2026-10-10, run 38063436064) passed the workflow end to end and retained that artifact; future claims must cite their own rerun.                                                                                                                                                                                                                                                                                                                                                                                                      |

The committed PDF/UA claim covers those three generated fixtures, not every
possible article or visual/assistive usability. UA-1 has English fixture evidence;
Arabic UA-1 is not claimed. Publisher starters emit explicit unavailable tagging
losses. Core profile warnings and PDF tagging declarations alone do not certify
WCAG or PDF/UA. See the [accessibility guide](../guides/accessibility.md).

## Capabilities

Structural, descriptive, declarative and implementation-bound capabilities are orthogonal. A block MAY be descriptive and implementation-bound simultaneously. A schema does not prove semantic equivalence, numerical correctness, visual fidelity or accessible usability. Unknown or unsupported behavior MUST remain preserved where the supported archival contract permits it and MUST be reported rather than treated as implemented.

A portable claim requires an exportable verified contract. Arbitrary parse/refinement/normalization/migration callbacks MUST be declared executable and implementation-bound; do not serialize callback source or fabricate complete schemas from callbacks. Lightweight SDK descriptors are documentation, NOT complete portable contracts. [Schema-first definitions, verified adapters and offline export](contracts.md) now implement this boundary; fixture parity does not prove universal code/schema equivalence.

## Trust boundary

JSON contracts, examples and descriptor strings are untrusted content, not host instructions. Validation does not authorize implementations or resources, sandbox plugins, sanitize arbitrary HTML, or verify scientific claims. Hosts separately approve executable modules, resources, capabilities, HTML/URL policy and asset serving. No document-provided import string grants execution authority.

Validation/importing contracts MUST NOT perform network retrieval by default. Schema tooling compiles trusted/reviewed schema inputs at preparation time; it is not a sandbox for hostile executable code. Unknown-origin schema compilation requires host isolation/time/memory limits in addition to the synchronous profile's structural limits. The contract resolver permits retrieval only under explicit host-origin, byte, graph and timeout policy. Readers do not fetch schemas or receive the full registry/compiler merely to display a publication.

## Beta policy and release governance

[Governance and versioning](../governance.md) defines the beta freeze, exact digest
identities, Core/Research compatibility, independent version domains, change
review and deprecation policy. Existing numeric contract versions remain frozen;
changed pinned content gets a new digest. Namespace authority and host execution
approval are separate from integrity. No stable release support window is implied.

TEST-14 deduplication, TEST-15 affected-only rebuilding and TEST-16 benchmark
methodology are separate requirements. The matrix above distinguishes their
bounded evidence and unclaimed limits. Passing the P0 gate does not run timing
or byte benchmarks. The optional [local budget comparison](../../tools/benchmarks/gate.ts)
uses a recorded snapshot; GitHub Actions does not enforce it.
