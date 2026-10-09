# Publisle — Finalization Plan: Core/Research Split, Conformance, Accessibility, Distribution

**Status:** Approved plan, revision 2 (incorporates review feedback from 2026-10-10)
**Date:** 2026-10-10
**Baseline:** Workspace at `f747d36` plus the uncommitted research/templates/CLI work in the tree
**Purpose:** Close the remaining gaps — scope, second-implementation strength, accessibility, toolchain weight, and adoption — so the repository is ready for documentation freeze and distribution planning.

This plan extends, and does not replace, the [standardization requirements](Publisle-Standardization-Requirements.md) and the [implemented specification](SPECS.md). Where those documents state current behavior, this plan states the remaining work, its sequencing, and its acceptance criteria. Requirement references (for example VER-03, A11Y-01) point at the requirements document.

## Progress log

| Date       | Milestone                       | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-10 | M0                              | Done — in-flight research/templates/CLI/adapters work landed in 9 reviewable slices; all gates green (check, research incl. container integration, P0 TEST-01–13).                                                                                                                                                                                                                                                                                                                           |
| 2026-10-10 | M1                              | Done — F-19 profiles moved to `@publisle/research`; F-18 CLI split into `@publisle/cli` + `@publisle/cli-research` plugin with dynamic seam (verified: absent plugin ⇒ guidance + exit 2); F-03 `packages/core-packages.json` manifest + ESLint boundary rule (no CLI exemption); publishing.md promoted to the Research-profile standard; standards README Core/profiles table; README/developer-guide/SPECS updated. F-02 full SPECS.md restructure remains as a follow-up editorial pass. |
| 2026-10-10 | M3.1                            | Done — F-10 `accessibilityProfile()` v2 with corrected WCAG mappings (language 3.1.1, heading order 1.3.1+2.4.6, table captions 1.3.1, link names 2.4.4, figure alt 1.1.1); diagram alt and embed titles documented as structural; math documented as a renderer contract; research-paper profile de-duplicated (composes v2).                                                                                                                                                               |
| 2026-10-10 | M4 (partial)                    | Done — F-15 `export --to html` zero-TeX preview (self-contained page from the publication artifact, styles inlined) + engine-tier table in the journal guide. Remaining: F-14 multi-arch image, F-20 TL-snapshot image rework, registry publishing workflow.                                                                                                                                                                                                                                 |
| —          | M2, M3.2/3.3, F-14/F-20, M5, M6 | Not started (next: M2a diagnostic-code registry, then M3.2 PDF/UA-2 tagging + TL image rework).                                                                                                                                                                                                                                                                                                                                                                                              |

## Guiding decisions (ratified 2026-10-09, revised 2026-10-10)

| Decision              | Direction                                                                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec split mechanics  | Documentation and boundary rules only: split the normative documents and add a core-package manifest plus lint enforcement. Packages stay in their current tree.                                                                                                 |
| CLI placement         | Split into `@publisle/cli` (validate/upgrade, Core) and `@publisle/cli-research` (export/bibliography/doctor/setup, plugin). The core binary discovers the plugin dynamically; absent plugin means guidance, not failure. No optional-peer-dependency ambiguity. |
| Profiles placement    | `accessibility`, `interactive-publication`, `localization`, and `print` stay Core. `research-paper` and `scholarly` move to the Research profile side.                                                                                                           |
| Second implementation | Full renderer parity for Python, phased over shared fixtures. Parity means identical outcomes on an agreed, growing fixture corpus and identical capability declarations — not byte-equal HTML, and not a reimplementation of citeproc-js.                       |
| Accessibility         | Broaden `accessibilityProfile` to v2 with corrected WCAG mappings, plus **PDF/UA-2 (PDF 2.0)** tagged output — the LaTeX tagging project's primary target — validated by veraPDF in CI. PDF/UA-1 remains a template knob.                                        |
| Tagged-PDF scope      | Committed: `article` and `article-arabic` only (standard-class basis). IEEE/Elsevier are an experimental tier pending a tagging-compatibility spike; ACM/Springer (pdfLaTeX-bound) emit explicit loss diagnostics.                                               |
| Toolchain weight      | Publish the digest-pinned compiler container to a registry as a **multi-arch (amd64 + arm64)** image so setup is one pull; document explicit engine tiers with the HTML publication artifact as the zero-TeX preview path.                                       |
| Adoption              | A final milestone puts a real outside consumer — a public showcase article deployment, then the VoidReg SaaS pilot — onto the released packages.                                                                                                                 |
| Plan location         | This document, at the repository root, tracker-ready.                                                                                                                                                                                                            |

## Where the repository stands

Already landed or in flight:

- The working tree contains the full research rewrite: pinned citeproc-js 2.4.63 with versioned locales and ibid/subsequent forms, DOI/HTTPS acquisition (`packages/research/src/remote.ts`), LaTeX/JATS/PDF export, the template packages (`template-article`, `template-ieee`, `template-acm`, `template-elsevier`, `template-springer`) on `@publisle/template-sdk`, submission packages, the pinned digest-frozen compiler container (`packages/research/compiler/`), and `publisle doctor` / `publisle setup compiler`.
- The independent Python consumer (`tools/python/`) already passes the P0 structural, digest, bundle, and locked-exchange evidence through `pnpm test:conformance:p0` (TEST-01–10), and `render.py` covers the static subset: prose, rich text, direction, lists, quotes, code, figures, tables, labels, footnotes, and numeric references, with honest fallback diagnostics for math, interactive blocks, migrations, and full CSL.
- `accessibilityProfile()` checks missing figure alt only (`packages/profiles/src/index.ts`); `interactivePublicationProfile()` covers interactive naming/instructions/fallback separately.
- SPECS.md is a single specification covering both the portable core and the research/publishing machinery; `docs/standards/publishing.md` already isolates the publishing contracts but is not yet framed as a separate profile standard.
- The CLI statically imports `@publisle/research` and all five template packages (`packages/cli/src/run.ts`), so the Core path currently drags the research toolchain with it.
- Template engine facts: `article`, `ieee`, and `elsevier` declare `["pdflatex", "lualatex"]`; `article-arabic` is `["lualatex"]`; `acm` and `springer` are `["pdflatex"]` only.
- The pinned compiler container builds on the Ubuntu noble 2025-03-01 apt snapshot, which ships TeX Live 2023 — too old for the stable `tagging` interface (LaTeX format 2025-06-01 / TL2025+).

Consequently, Milestone 0 is landing the in-flight work; everything else builds on it.

## Milestone 0 — Land the in-flight research work (S)

Before any split or parity work, the uncommitted research/templates/CLI changes must be reviewed, tested, and merged:

- Run `pnpm check`, `pnpm test:research`, `pnpm test:conformance:p0`, and the LaTeX integration tests (container available) on the current tree.
- Resolve the deliberate loose ends the rewrite introduced: the deprecated `toPdf` migration export, the `citeproc.d.ts` typing surface, and the `NOTICE.md` obligations for citeproc-js and the Springer LPPL sources.
- Commit in reviewable slices (research core, templates, container recipe, CLI commands, docs) so later milestones rebase cleanly.

**Acceptance:** clean working tree; all existing gates green on the merged result.

## Milestone 1 — Split the standard into Publisle Core and the Publisle Research profile (M/L)

Goal: an adopter can read, validate, publish, and self-host articles against **Publisle Core** without TeX, citeproc, templates, or containers, and every research capability is explicitly part of the **Research profile** layered on top.

### 1.1 Normative document split

- Restructure SPECS.md: sections 1–13 and 15 remain the Core specification; the bibliography/citation/export material (parts of §13, the research rows of §14, and anything citing `@publisle/research`) moves to a clearly-marked "Research profile" part, with the Core text stating that it has no opinion on citation styles, LaTeX, JATS, or PDF.
- Promote `docs/standards/publishing.md` to the normative Research-profile document with its own name and version line ("Publisle Research profile"), while all frozen numeric versions (document 1, artifact 1, block payloads 1, schematic 2) remain unchanged. The profile is a named conformance claim in the sense of `docs/standards/conformance.md`, not a new envelope version.
- Update `docs/standards/README.md` with a Core-vs-profiles table: which contracts are Core, which are Research, and which are informational.
- State the adoption boundary explicitly in README.md and the developer guide: the Core path installs none of citeproc, TeX, xmllint, Docker, or the template packages.

### 1.2 Package boundary enforcement

- Add a machine-readable manifest (for example `packages/core-packages.json`) listing the Core set: `schema`, `core`, `block-sdk`, `blocks/core`, `blocks/technical`, `markdown`, `contracts`, `profiles`, `adapter-core`, `adapter-react`, `adapter-svelte`, `adapter-next`, `adapter-astro`, `adapter-vue`, `cli`. The Research set is `research`, `template-sdk`, `template-*`, `cli-research`.
- Extend `eslint.config.ts` with a boundary rule: **no Core package may import `@publisle/research` or `@publisle/template-*` — with no CLI exemption**, since the CLI split (§1.4) removes the need for one. Only `research`, `cli-research`, and cross-references inside the Research set itself are permitted.
- Verify `pnpm test:conformance:p0` passes with the Research packages excluded from typecheck and test collection, proving the P0 claims never needed them.

### 1.3 Profiles placement

- Move `researchPaperProfile` and `scholarlyProfile` from `@publisle/profiles` to the Research side (`@publisle/research`), preserving their profile name/version strings so cache-identity semantics do not shift. The moved `researchPaperProfile` composes `accessibilityProfile()` through a `research` → `profiles` dependency (the correct direction; no inversion).
- `accessibilityProfile`, `interactivePublicationProfile`, `localizationProfile`, and `printProfile` remain Core: they check portable content quality (readable naming, alternatives, direction, print/no-JS fallback) that applies to any host, not to TeX.
- Document the move in the Research-profile standard doc and the profiles guide.

### 1.4 CLI split into Core and plugin

- New `@publisle/cli` surface: `validate` and `upgrade` only; no research/template imports, no research dependencies in `package.json`.
- New `@publisle/cli-research` package: owns `export`, `bibliography`, `doctor`, and `setup compiler`; depends on `@publisle/research`, `@publisle/research/node` and the template packages; declares `@publisle/cli` as a peer.
- Discovery: the core `publisle` binary dynamically imports the plugin (a well-known module id) when a research subcommand is invoked. Absent plugin ⇒ print "install @publisle/cli-research" guidance and exit 2. One UX when installed, an honest boundary when not.
- Why not optional peer dependencies: npm auto-installs `optionalDependencies` (Core would not stay lean), and plain peers give muddy guarantees across package managers. A separate package is airtight and is what the M5 Core-only install check can actually prove.
- Docs: the developer guide's CLI section splits accordingly; `doctor`'s help text moves to the research guide.

### 1.5 Documentation consequences

- `docs/guides/journal-export.md` gains a header naming it the Research-profile guide and linking the Core alternative (publication artifacts, native adapters).
- The conformance evidence table grows a "profile" column so Core claims and Research claims cannot be conflated.

**Acceptance:** a reader can identify the Core contract set in one place; CI enforces the import boundary with no exemptions; P0 passes without Research packages; `@publisle/cli` contains no research/template imports or dependencies and reports guidance instead; `pnpm cli validate`/`pnpm cli upgrade` still work from the core package alone.

## Milestone 2 — Python full renderer parity, phased over shared fixtures (XL)

Goal: the Python consumer stops being "static evidence" and becomes a genuine second implementation whose renderer outcomes agree with TypeScript on a shared corpus, including math, migrations, citations, and interactive fallback. Phasing keeps every intermediate state honest.

Parity definition (recorded in `docs/standards/conformance.md`):

1. Both renderers consume the same fixture documents from `packages/contracts/fixtures/`.
2. For each fixture, both must produce the same classification (rendered, fallback-with-diagnostic, rejected) and semantically equivalent output asserted by shared expectation files — normalized HTML/MathML trees and diagnostic code sets, never byte-identical strings.
3. Both must emit identical capability declarations for their role; unsupported behavior MUST surface as the same diagnostic codes, not silence.

### 2a. Math and diagnostic-code unification (M)

- Unify diagnostic codes: replace renderer-private codes (`python-math-fallback`, `python-block-fallback`, `python-unsupported-version`, …) with codes shared with the TypeScript renderer, registered in one table under `packages/contracts/` so both implementations resolve them identically.
- Math: TypeScript renders KaTeX HTML with embedded presentation MathML. Python gains presentation-MathML output for the supported LaTeX subset — either a vendored pure-Python converter selected and pinned like the existing `rfc8785` wheel, or an in-repo subset converter for the KaTeX-supported syntax the corpus exercises. Compare normalized MathML trees, not KaTeX's HTML spans. Out-of-subset TeX keeps the honest source-text fallback with the shared code.
- Math accessibility is a renderer contract, not a preparation check: every math output carries MathML or a text alternative, asserted in the shared parity fixtures (see also M3.1).

### 2b. Migrations and version handling (S/M)

- Port the built-in portable migrations — currently one: the schematic envelope v1→2 `migrateInteractiveEnvelope` (`blocks/technical/src/index.ts`) — into Python, with fixture documents asserting both implementations migrate identically.
- Executable/host document migrations stay implementation-bound by design (VER-03): Python MUST keep refusing them with the shared `unsupported-migration` classification, and fixtures MUST assert both sides classify identically. This refusal is conformant behavior, not a gap.

### 2c. Citations and the CSL corpus (L/XL)

- Extend `render.py` beyond numeric-minimal citation resolution toward the Research-profile renderer role: first the built-in `numeric` and `author-date` styles, then the documented CSL vocabulary exercised by the corpus (layout, text, names, et-al, dates, group, choose, macro, sort, disambiguation, locators). Evaluate vendoring a pure-Python CSL processor versus implementing the corpus-defined subset in-repo; the evaluation is a decision gate at the start of 2c, with maintainability and license recorded in `NOTICE.md`.
- Build `packages/contracts/fixtures/citations.json` as a growing shared corpus of documents × styles × locale edge cases (each fixture: input document, CSL inputs, expected normalized reference list and citation markers). TypeScript output (citeproc-js) is the expectations generator; Python must match. Corpus growth defines parity incrementally — anything outside the corpus is declared unsupported by both, identically.
- Interactive and custom blocks: both renderers already emit readable fallback. Extend fixtures to assert fallback HTML equivalence (structure + text, not bytes) and identical capability limits (`plugins: false` on both sides).

### 2d. Gate wiring (S)

- Add a renderer-parity suite to the P0 gate (or a sibling `test:conformance:renderer`) that runs both renderers over the full shared corpus and fails on classification, output-structure, or capability-declaration divergence. Missing or skipped Python evidence fails the gate, matching the existing gate's strictness.

**Acceptance:** both renderers pass the shared corpus under one gate; the Python README and conformance documents describe a full second implementation with declared limits; TEST-01 evidence explicitly covers renderer outcomes, not only validation and digests.

## Milestone 3 — Accessibility: profile v2 and PDF/UA-2 (L)

### 3.1 Structural profile v2 (`packages/profiles`) (M)

Broaden `accessibilityProfile()` to the automatable WCAG-mapped subset, each finding carrying a documented success-criterion mapping (in the profile docs, not new diagnostic fields):

| Check                                                                                                                                               | WCAG mapping                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Document `language` present                                                                                                                         | 3.1.1 (Language of Page)                                     |
| Per-block direction validity                                                                                                                        | 1.3.2 (Meaningful Sequence)                                  |
| Heading order: no skipped levels from the document start                                                                                            | 1.3.1 (Info and Relationships) + 2.4.6 (Headings and Labels) |
| Tables: caption present, `headerRows` declared when headers exist                                                                                   | 1.3.1                                                        |
| Links: nonempty accessible names                                                                                                                    | 2.4.4 (Link Purpose)                                         |
| Figures: existing alt check (omitted = undescribed, `""` = decorative)                                                                              | 1.1.1 (Non-text Content)                                     |
| Diagrams: required alt (already structural — verified and covered here)                                                                             | 1.1.1                                                        |
| Embeds: title present                                                                                                                               | 4.1.2 (Name, Role, Value — the frame's accessible name)      |
| Interactive envelopes: accessible label or titled content, substantive fallback (referenced from `interactivePublicationProfile()`, not duplicated) | A11Y-01/02                                                   |

Math is deliberately **not** a preparation-profile check: display-math labels are reference machinery, and math accessibility (MathML or text alternatives in every output) is asserted as a renderer contract in the M2 parity fixtures and the M3.2 artifact fixtures.

Keep the profile optional and severable per §7.4; all v2 findings are warnings by default and policy-mappable as today. Explicitly document that schema checks are presence/reference checks, never a WCAG conformance claim (A11Y-04).

### 3.2 PDF/UA-2 tagged output on the LuaLaTeX path (L)

The LaTeX tagging project's primary target is PDF/UA-2 over PDF 2.0: since LaTeX 2025-06-01, `\DocumentMetadata` defaults the PDF version to 2.0 with `pdfstandard=ua-2`, and the project's flagship corpus is WTPDF/UA-2. Publisle targets **UA-2**; UA-1 (PDF 1.7) stays a template knob for consumers that need it. veraPDF validates both.

- **Committed templates:** `article` and `article-arabic` (standard-class basis) produce tagged, veraPDF-clean PDF/UA-2 output: `\DocumentMetadata{tagging, pdfstandard=ua-2, lang}` from template data, correct document language, alt text from figure/diagram data, table header scoping, and — with LuaLaTeX + `unicode-math` + the already-installed OpenType math fonts — LuaMML math tagging (`math/setup={mathml-AF,mathml-SE}`).
- **Experimental tier:** IEEEtran and elsarticle are third-party classes that the tagging project does not guarantee (their Tagging Status pages track per-class compatibility; `acmart` already mis-tags its title today). Run a compatibility spike against the current TL snapshot; templates expose `tagged: "experimental"` with an explicit diagnostic until proven, or remain untagged with the loss diagnostic. No tagged-IEEE promise ships in the plan.
- **Out of scope:** ACM and Springer starters (pdfLaTeX-bound today) emit an explicit `pdf-ua-unavailable` loss diagnostic instead of silent untagged PDFs; documentation states PDF/UA requires a LuaLaTeX-capable profile.
- **Compiler image rework:** the current noble apt snapshot ships TeX Live 2023, too old for the stable `tagging` key. Rebuild the compiler image on a **pinned upstream TeX Live snapshot** (frozen tlnet mirror, preserving reproducibility) with TL2025+/LuaLaTeX/unicode-math/tagpdf — this lands together with the M4 multi-arch work since upstream TL serves both architectures.
- Validation: pin the veraPDF CLI by digest in CI, run it over generated tagged PDFs, and fail on rule violations for the UA-2 profile. Locally, `publisle doctor` gains an optional veraPDF check that reports rather than gates.
- HTML side: add acceptance fixtures asserting `lang`/`dir` propagation, figure alt, table headers, and MathML presence in publication artifacts — most already exist; this closes the remainder and records it as evidence.

### 3.3 Documentation (S)

New `docs/guides/accessibility.md`: what the profile checks, the corrected WCAG mappings, what PDF/UA-2 tagging covers on which templates (committed vs experimental vs unavailable), the veraPDF workflow, and a manual-review checklist for keyboard/motion/announcements that automated checks cannot claim (A11Y-03/04).

**Acceptance:** profile v2 tests merged; `article` (and `article-arabic`) produce veraPDF-clean PDF/UA-2 output in CI; IEEE/Elsevier carry an explicit experimental-or-unavailable status; untagged paths carry explicit loss diagnostics; the guide is linked from the standards index.

## Milestone 4 — Toolchain weight: multi-arch prebuilt image and explicit tiers (M)

- Publish the digest-pinned compiler image to a registry (for example `ghcr.io/voidreg/publisle-compiler`) as a **multi-arch manifest: `linux/amd64` and `linux/arm64`**, built with buildx from the existing (TL-snapshot-reworked, per M3.2) Dockerfile by a release workflow that records both platform digests. Without this, Apple Silicon users run the image slowly under emulation or not at all.
- Multi-arch implementation details: Ubuntu apt sources must be arch-conditional (the `snapshot.ubuntu.com/ubuntu/` archive serves amd64; arm64 needs the `ubuntu-ports` snapshot), and any upstream TeX Live snapshot pin is recorded per architecture.
- `publisle setup compiler` prefers pulling the published digest-pinned multi-arch image and falls back to the documented local build; `publisle doctor` reports native, container-runtime, and image-digest status.
- Document the engine tiers in the Research-profile guide and `journal-export.md`:
  1. **Native TeX** — full control, user-managed versions.
  2. **Pinned container (prebuilt, multi-arch)** — reproducible output, one-command setup, no local TeX.
  3. **Zero-TeX preview** — `publisle export --to html` (new small CLI surface over the existing publication artifact compiler) plus browser print for drafts; journals still require tiers 1–2. This is a preview path, not a new PDF pipeline.
- Keep `compiler: "auto"` semantics: native when complete and healthy, otherwise the pinned container, never implicit downloads beyond the explicit image pull.

**Acceptance:** from a clean machine with Docker only (amd64 or arm64), `publisle setup compiler` + `publisle export --to pdf` completes without installing a TeX distribution; the docs table maps tiers to use cases; the published image digests are recorded in the release notes and verified by CI.

## Milestone 5 — Documentation freeze and distribution readiness (M/L)

### 5.1 Documentation

- README restructure: Core quickstart (no TeX) first; Research profile as a separate section with its own entry point; the system SVG already supports this.
- A `docs/` index tying together: Core standard, Research profile, conformance claims (with per-claim evidence links, including the new renderer-parity gate), guides, and the governance page.
- Governance/versioning page (VER-05): beta freeze semantics, digest-pinned contracts, deprecation policy going forward, and the Core/Research compatibility matrix (which profile versions assume which Core version).
- Conformance claims page updated so every TEST-01–16 row links either passing evidence or an explicit "not claimed".

### 5.2 Distribution planning

- Decide and implement the packaging story. Today every package exports raw `.ts` sources (`"import": "./src/index.ts"`), which works inside the workspace but not for npm consumers. Recommended: per-package `tsc` builds emitting `dist/` ESM plus declaration files, `exports` maps pointing at `dist`, source maps retained, with a workspace flag keeping internal source resolution during development.
- Define the publish set and order: Core first (`schema`, `core`, `block-sdk`, `blocks-*`, `markdown`, `profiles`, `contracts`, `adapter-*`, `cli`), then the Research profile (`research`, `template-sdk`, `template-*`, `cli-research`) with citeproc/Springer notice obligations in `NOTICE.md`.
- **Core-only install CI check:** a job installs only the packed Core tarballs into a temp project, asserts the dependency tree contains none of `@publisle/research`, `@publisle/template-*`, `@publisle/cli-research`, `citeproc`, or `fflate`, asserts `publisle validate` works, and asserts `publisle export` exits 2 with the install-guidance message. This is the mechanical proof of the split's core promise.
- Add the release scaffolding: `CHANGELOG.md`, `engines` fields (Node ≥ 24, pnpm 11.x), registry scope confirmation, `pnpm pack` dry-runs plus an artifact-types check in CI, and version numbering aligned with the beta-freeze statement (0.x during beta; the frozen v1 contract integers are not npm versions).
- Record the multi-arch container image digests and the veraPDF pin alongside each release.

**Acceptance:** a consumer outside the workspace can install the Core packages, import/prepare/render an article with no TeX, and follow documented links from package READMEs to the standard; the Core-only install check passes in CI; `pnpm pack` output passes the types/artifact check in CI; the release checklist exists and has been rehearsed once.

## Milestone 6 — Adoption: first outside consumers (M)

Without an external consumer, M5 can finish with nobody using the result. This milestone proves the release.

- **Minimum exit — showcase deployment:** the Fourier feature article published as a real public site built only from released npm packages (Astro or Next adapter + publication artifacts, versions pinned in its deployment manifest), serving as the reference deployment and living documentation, linked from the README. Built from the packed/published artifacts, not the workspace, so it exercises exactly what consumers receive.
- **Target exit — SaaS pilot:** the VoidReg SaaS consumes the Core packages in its own CI, making it the first consumer whose build can break when Publisle breaks; its integration friction feeds back into the docs before freeze.
- **Feedback loop:** issue templates, pinned-version reproduction instructions, and a dogfood CI job that consumes the packed tarballs (shared with the Core-only install check).
- Scope guard: adoption evidence does not loosen any conformance language; if the showcase hits a standard gap, the gap is fixed or documented as a limit, not papered over.

**Acceptance:** showcase site live and linked, built from published artifacts with pinned versions; SaaS pilot consuming Core packages in CI or a documented successor date; feedback-loop artifacts (issue templates, reproduction guide) merged.

## Sequencing and dependencies

| Order | Milestone                                                           | Depends on                                                 | Can parallel with      |
| ----- | ------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------- |
| 1     | M0 land in-flight work                                              | —                                                          | —                      |
| 2     | M1 Core/Research split (docs, boundaries, CLI split, profile moves) | M0                                                         | M4 image rework        |
| 3     | M2 Python parity 2a/2b                                              | M1 (fixture/role ownership)                                | M3 (accessibility), M4 |
| 4     | M2 Python parity 2c/2d                                              | 2a/2b                                                      | M3, M5 drafting        |
| 5     | M3 Accessibility v2 + PDF/UA-2                                      | M0 (templates), M1 (docs framing), TL image rework with M4 | M2                     |
| 6     | M4 Toolchain tiers + multi-arch image                               | M0 (container), shares TL rework with M3                   | M1–M3                  |
| 7     | M5 Docs freeze + distribution + Core-only install check             | all above                                                  | early drafting anytime |
| 8     | M6 Adoption (showcase, SaaS pilot)                                  | M5                                                         | —                      |

## Risks and honest limits

- **CSL parity scope creep** is the largest risk (2c). The corpus-grown definition of parity is the control: citeproc-js remains the TypeScript implementation; Python matches the corpus or declares identical unsupported limits. If 2c stalls, 2a/2b/2d still deliver a full static-core second implementation, and citations remain numeric-minimal with declared limits — the milestone is designed to degrade without dishonesty.
- **Tagging is a moving target.** The LaTeX team's own guidance warns that packages can break as `\DocumentMetadata` evolves (the December 2025 `captions` breakage is the cautionary example). Publisle commits only to the standard-class templates and pins the TL snapshot; journal-class tagging is experimental until proven against the Tagging Status suite.
- **PDF/UA-2 vs consumers:** some institutional workflows still demand UA-1; keeping `pdfstandard=ua-1` as a template knob covers them without making UA-1 the goal.
- **Registry publishing** of the image and of npm packages introduces naming/namespace decisions (org scope, availability) that are decision gates inside M4/M5, not afterthoughts.
- **Byte-level reproduction across renderers is not a goal**; every parity assertion is structural/semantic. This must be stated wherever parity is claimed so the conformance language stays scrupulous.
- **Adoption cannot be manufactured.** If the SaaS pilot slips, the showcase deployment remains the hard exit so the milestone cannot silently disappear.

## Tracker-ready issue breakdown

| Issue | Title                                                                                                     | Milestone |
| ----- | --------------------------------------------------------------------------------------------------------- | --------- |
| F-01  | Land research/templates/CLI work in reviewable slices                                                     | M0        |
| F-02  | Split SPECS.md into Core + Research profile parts; version the profile                                    | M1        |
| F-03  | Core package manifest + ESLint boundary rule (no CLI exemption); P0 without research                      | M1        |
| F-04  | Shared renderer diagnostic-code registry                                                                  | M2        |
| F-05  | Python MathML rendering + shared math fixtures                                                            | M2        |
| F-06  | Python built-in migrations + refusal-classification fixtures                                              | M2        |
| F-07  | CSL parity corpus generator and growing fixture set                                                       | M2        |
| F-08  | Python citation styles (numeric, author-date) over the corpus                                             | M2        |
| F-09  | Renderer-parity gate in CI                                                                                | M2        |
| F-10  | accessibilityProfile v2 with corrected WCAG mapping docs                                                  | M3        |
| F-11  | PDF/UA-2 tagging for article/article-arabic; experimental tier for IEEE/Elsevier; losses for ACM/Springer | M3        |
| F-12  | veraPDF-pinned CI validation + doctor check                                                               | M3        |
| F-13  | Accessibility guide                                                                                       | M3        |
| F-14  | Multi-arch (amd64+arm64) pinned compiler image; setup/doctor pull path                                    | M4        |
| F-15  | `export --to html` preview + engine-tier documentation                                                    | M4        |
| F-16  | Governance/versioning/conformance-claims pages                                                            | M5        |
| F-17  | Per-package dist builds + publish set + CHANGELOG + release checklist                                     | M5        |
| F-18  | Split CLI into `@publisle/cli` + `@publisle/cli-research` plugin                                          | M1        |
| F-19  | Move research-paper/scholarly profiles to the Research side                                               | M1        |
| F-20  | Rework compiler image onto pinned upstream TeX Live snapshot (TL2025+)                                    | M3/M4     |
| F-21  | Showcase deployment built from published artifacts                                                        | M6        |
| F-22  | Core-only install CI check (no research deps; guidance on export)                                         | M5        |
