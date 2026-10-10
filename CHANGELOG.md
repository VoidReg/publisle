# Changelog

## Unreleased

The repository remains in beta. Publishable packages currently use the workspace
placeholder `0.0.0`; no release or registry availability is implied. Contract
version integers and npm versions are separate identifiers.

Contract versions at the first release, frozen and independent of the npm
version: document envelope **1**, publication artifact **1**, block payloads
**1**, schematic **2**, accessibility inspection **2**, and the Research profile
at **1** (beta). Schematic 2 is the first published wire shape: version 1
predates publication, and pre-publication version-1 payloads reach adopters only
through the declared v1→2 migration. These integers are never renumbered to
match a release.

- Separate Core packages and CLI from optional Research tooling.
- Add ESM JavaScript, declarations, source maps and packed consumer validation for
  all 23 packages.
- Add independent renderer/citation conformance and PDF accessibility validation.

Before a release, replace this section with the selected 0.x version, dated
changes, compatibility notes, compiler manifest/platform digests, veraPDF version
and installer checksum, and links to the retained validation evidence.
