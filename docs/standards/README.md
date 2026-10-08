# Publisle beta standards

These documents define the implemented portable subset independently of SDK types. They are not a claim that the entire standardization roadmap is complete.

| Contract                      | Normative definition                | Machine-readable source                                                               |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| Roles, trust and beta changes | [Conformance](conformance.md)       | [Foundation diagnostics](../../packages/contracts/schemas/foundation-diagnostic.json) |
| JSON boundaries and digests   | [JSON wire profile](json-wire.md)   | Shared canonical fixtures                                                             |
| Structural validation         | [Schema profile](schema-profile.md) | [Beta schemas](../../packages/contracts/schemas/)                                     |
| Preparation                   | [Preparation order](preparation.md) | Existing preparation APIs and regression fixtures                                     |

## Status and frozen versions

All existing package/document/block/artifact/ABI versions remain unchanged during beta. In particular the document and publication artifact remain at 1, core block payloads at 1, and the already-existing schematic payload at 2. This work does not reset that schematic version or bump other counters.

The workspace schema snapshot may evolve in place before release. Contract content, once pinned by a digest, MUST remain immutable; different content has a different digest. A frozen numeric version alone does not identify an immutable beta contract. Historical beta compatibility is not implied. Conversions preserve original source and require explicit author/host action.

Future version domains, transitions and deprecation enforcement are design policy only until release preparation is authorized. The beta freeze supersedes requirements for immediate envelope/artifact version transitions.

SDK usage belongs in [the tooling guide](../guides/contracts.md), not these normative definitions. GitHub [tracker #28](https://github.com/VoidReg/publisle/issues/28) identifies remaining deliverables. Semantic vocabulary/traversal, contract bundle/export/discovery, locked dependencies, projections, artifact/ABI changes, Python conformance and publishing profiles are NOT implemented by this foundation group.

## Implemented beta changes

- Added strict text/UTF-8 JSON ingestion and JCS/SHA-256 tooling.
- Added read-only offline structural validation and reviewed current-shape schemas.
- Preserved existing version constants, dependencies' placement outside readers, and existing normalization APIs.
