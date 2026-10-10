# Governance and versioning

**Status:** Beta maintenance policy, reviewed 2026-10-10. Publisle is maintained by
VoidReg. This policy governs changes; it does not announce an npm release or
certify every conformance role.

## Contract identities and beta freeze

The current document envelope, publication artifact, contract format, island
`inputVersion` and Core payloads remain at **1**. The reference schematic payload
remains at **2**. Core accessibility's inspection behavior is version **2**;
Research is a named profile at version **1** (beta). These are independent domains,
not a shared product release number.

During beta, workspace schemas may gain optional fields without changing those
integers. An older strict consumer may reject a new optional field; the beta
freeze does not promise historical parser compatibility. An exact contract is
identified by its JCS SHA-256 digest. Once pinned, its content is immutable: a
change requires a new digest and an explicitly updated lock or bundle. Moving
publisher aliases do not change immutable pins. Integrity is not authority to
execute code; the host still approves implementations and resources.

Schematic 2 is the first published wire shape. Its version 1 predates
publication, so pre-publication version-1 payloads reach adopters only through
the declared v1→2 migration; no supported path hands a reader an unmigrated
version-1 document. Release notes must never renumber these integers to match an
npm version.

Npm packages use **0.x** while beta. The first coordinated package version is
**0.1.0**. The private root workspace version is
not a release. A package version records
implementation/API delivery, not a document or artifact schema integer. Release
notes must identify the shipped contract digests, supported roles and capability
limits, compiler image manifest/platform digests and validator pin where applicable.

## Core and Research compatibility

| Consumer/profile                   | Required Core                                 | Additional capability boundary                                                             |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Core portable document             | Envelope 1, supported exact contract digests  | Payload versions are checked independently; schematic 2 has the declared v1→2 migration    |
| Core publication artifact          | Artifact 1 and island input 1                 | Host approves HTML, assets and implementations; artifacts do not authorize code            |
| Core accessibility                 | Envelope 1; inspection behavior 2             | Optional presence checks; no WCAG or PDF/UA certification                                  |
| Research profile 1 (beta)          | Envelope 1 and supported pinned contracts     | Optional Research packages, templates and selected export/toolchain capabilities           |
| Independent static renderer        | Envelope 1, declared built-ins and migrations | Shared corpus, presentation MathML and authored fallback; no host plugins or full CSL      |
| Independent Research citation role | Envelope 1, v1 supported payloads             | Exact [citation subset](../packages/contracts/citation-subset.json); other features reject |

A version match is necessary but insufficient. A consumer states its role,
supported vocabulary, exact pinned contracts and fixture evidence. Consult
[conformance claims](standards/conformance.md) and the
[Research standard](standards/publishing.md) before transferring a claim between
implementations or outputs. A newer framework release alone does not change a
payload version.

## Change review

A change proposal or pull request must identify affected roles and version domains,
accepted wire shapes/meaning, preparation and renderer behavior, preservation and
conversion losses, migration capability, trust boundaries and reader costs. Update
source contracts, regression fixtures, relevant normative text and usage guidance
in the same change. Preserve failure/refusal cases as well as successful examples.
Run the applicable gates against the changed checkout; a saved report or previously
passing commit cannot certify the new result.

Maintain separate behavior identities for registry preparation, profiles, resource
resolvers and renderers when their behavior changes without a wire shape change.
Function source hashes do not replace explicit identities. Migrations state whether
they are portable/declarative or executable/host-bound; consumers lacking a required
capability preserve or reject explicitly. Source rewriting remains an explicit
operation.

Publisher namespaces need an identified owner. A mirror does not acquire namespace
authority by hosting a bundle. Report conflicting identities or claims; do not
resolve them by trusting whichever file is fetched first.

## Deprecation and release policy

Deprecations must name the affected API/capability, its replacement, migration or
preservation path, and the intended removal boundary in release notes. Beta has
no guaranteed deprecation duration: do not promise a fixed support window or
silently treat an existing deprecation as permission for data loss. Retain
regression coverage for supported behavior until its removal is explicitly
reviewed. Breaking public API or accepted wire meaning requires a documented
transition in its own domain, even if the numeric beta contract is frozen.

A stable 1.0 release must separately adopt explicit support windows and version
transition rules; this beta policy does not manufacture them. Registry
publication and live consumer evidence must be recorded when they occur.
