# Changelog

## Unreleased

## 0.1.0 — Prepared, not published

All 23 publishable packages are coordinated at `0.1.0` for the first beta release.
Registry publication and the release date remain pending. Contract version
integers and npm versions are separate identifiers.

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
- Prepare the coordinated `0.1.0` beta package set and versioned showcase rehearsal.
- Retain dependency-derived publication order, tarball hashes and installed Core
  contract digests in the distribution release manifest.
- Generate the showcase lock in a clean temporary directory and replay it with
  `npm ci`, preserving integrity metadata when a previous installation exists.

Compatibility: this is the first package release, with Core and Research profile
boundaries described above. Node.js ≥24 is required. Research remains optional.

Before publication, record the release date, compiler manifest/platform digests,
veraPDF version and installer checksum, and links to retained validation evidence.
