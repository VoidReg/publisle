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

These are role definitions, not declarations that every role is currently implemented. G1 provides JSON/digest tooling and a structural validator; G2 adds descriptive meaning, bounded declared traversal and readable preservation. Independent validation and full archival, semantic-export/behavior and artifact conformance remain separate milestones.

## Capabilities

Structural, descriptive, declarative and implementation-bound capabilities are orthogonal. A block MAY be descriptive and implementation-bound simultaneously. A schema does not prove semantic equivalence, numerical correctness, visual fidelity or accessible usability. Unknown or unsupported behavior MUST remain preserved where the supported archival contract permits it and MUST be reported rather than treated as implemented.

A portable claim requires an exportable verified contract. Arbitrary parse/refinement/normalization/migration callbacks MUST be declared executable and implementation-bound; do not serialize callback source or fabricate complete schemas from callbacks. Lightweight SDK descriptors are documentation, NOT complete portable contracts. [Schema-first definitions, verified adapters and offline export](contracts.md) now implement this boundary; fixture parity does not prove universal code/schema equivalence.

## Trust boundary

JSON contracts, examples and descriptor strings are untrusted content, not host instructions. Validation does not authorize implementations or resources, sandbox plugins, sanitize arbitrary HTML, or verify scientific claims. Hosts separately approve executable modules, resources, capabilities, HTML/URL policy and asset serving. No document-provided import string grants execution authority.

Validation/importing contracts MUST NOT perform network retrieval by default. Schema tooling compiles trusted/reviewed schema inputs at preparation time; it is not a sandbox for hostile executable code. Unknown-origin schema compilation requires host isolation/time/memory limits in addition to the synchronous profile's structural limits. Bounded fetch/discovery is a later group. Readers do not fetch schemas or receive the full registry/compiler merely to display a publication.

## Beta policy and future release governance

Existing numeric versions MUST remain frozen while this roadmap runs in beta. Content digests and Git history identify revisions. Changed pinned content gets a new identity/digest; publisher aliases may move, immutable pins may not. Publisher namespaces must have an identified owner; decentralized mirrors do not acquire namespace authority. Conflicting claims are reported, never resolved by trusting the first fetched file.

Future independent domains are document envelope, payload schema, contract format, semantic vocabulary/profile, implementation ABI, publication artifact, snapshot schema and implementation/build revision. Once release policy is activated, a change to accepted wire meaning, required fields or behavior is breaking in its own domain; framework upgrades do not automatically change block payload versions. No new version counter is introduced solely to distinguish beta changes.

Changes require a proposal documenting affected roles, shapes, fixtures, preservation/conversion, security and reader costs. Retain regression fixtures and a beta change log. Release deprecation periods and version transitions remain deferred until explicitly approved; no current deprecation duration is promised. A migration declares whether it is portable/declarative or executable/host-bound. Consumers without its capability preserve or reject source explicitly. Missing explanations require authorship, not generated migration facts.
