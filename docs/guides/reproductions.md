# Reproducing a consumer or rendering issue

A useful report pins the source, package artifacts and environment, then shows the
smallest command that fails. Use the
[reproduction issue form](../../.github/ISSUE_TEMPLATE/reproduction.yml) and keep
expected behavior separate from diagnostics and observed output. Public npm
publication, showcase deployment and an outside SaaS consumer remain pending;
local packed consumers are the currently reproducible distribution evidence.

## Pin the input and installation

For a registry installation after publication, record exact `@publisle/*` versions
in `package.json`, commit the package-manager lockfile, and reproduce with the
lockfile's clean-install command. Avoid `latest`, version ranges and workspace
links in a pinned reproduction. Include the framework/adapter versions too.
Do not use the unreleased workspace `0.0.0` placeholder as a published version.

For current repository work, record the commit, relevant uncommitted patch/new
files, Node/package-manager versions and the unchanged source document. A commit
alone cannot identify an uncommitted fix. Retain contract locks/bundles and their
digests when the failure involves portable contracts. Preserve block IDs, versions,
metadata, locale/direction, assets and diagnostic codes that affect the result.
Reduce unrelated content until the same failure remains.

```sh
git rev-parse HEAD
git status --short
node --version
pnpm --version
```

State whether the failure comes from workspace source imports, packed artifacts
or installed registry packages. For rendering, identify native or publication
artifact delivery and whether JavaScript was enabled. Include the command,
expected output, actual output, exit status and full relevant diagnostics. A
screenshot can explain appearance, but source and commands reproduce it.

## Reproduce the packed Core boundary

From the repository root, create retained artifacts outside the workspace:

```sh
PUBLISLE_DISTRIBUTION_ARTIFACTS=/tmp/publisle-reproduction pnpm test:distribution
```

The command prints a fresh `publisle-distribution-*` directory containing all 23
package tarballs, a plain Node `consumer/` and an `astro-consumer/`. Keep the whole
parent directory: lockfiles reference the sibling `tarballs/` directory. Inside
its `consumer/` directory, run:

```sh
npm ci --ignore-scripts --legacy-peer-deps
node consumer.ts
node node_modules/@publisle/cli/dist/bin.js validate source.json
node node_modules/@publisle/cli/dist/bin.js export source.json --to pdf
```

The static consumer must prepare/render readable HTML and validation must pass.
The final export command must exit **2** with Research plugin installation guidance:
that is expected Core-only behavior. Capture `npm ls --all --json` when reporting a
dependency leak; the gate rejects Research/template/CLI-plugin packages, citeproc
and fflate in this Core installation.

Inside the sibling `astro-consumer/` directory, rebuild the packed framework host:

```sh
npm ci --ignore-scripts --legacy-peer-deps
node node_modules/astro/bin/astro.mjs build
```

The [Distribution workflow](../../.github/workflows/distribution.yml) uploads this
layout without `node_modules` as `packed-consumer-and-tarballs`. Download and extract
the artifact, keep its relative directory layout, then use the commands above.
The [release guide](releases.md) explains package build/packing and the checks.
A local packed Astro build does not establish a public showcase deployment.

## Research and PDF reports

For a Research failure, include the template ID/version, selected engine,
compiler backend and generated package manifest. Record a container's exact image
ID or registry manifest/platform digests plus architecture, or native engine/font
versions. Include explicit source assets and template data. A Docker tag alone
is not a reproducible compiler identity.

Retain source/PDF/log/report evidence by setting `PUBLISLE_RESEARCH_ARTIFACTS`:

```sh
PUBLISLE_RESEARCH_ARTIFACTS=/tmp/publisle-research-reproduction pnpm test:research
PUBLISLE_RESEARCH_ARTIFACTS=/tmp/publisle-research-reproduction pnpm test:pdf-ua
```

These commands require the selected compiler and PDF tooling; the PDF/UA gate also
requires the checksum-pinned veraPDF installation described in the
[accessibility guide](accessibility.md). Include validator version, requested
UA-1/UA-2 flavour and the complete XML report, not only a success line. A missing
compiler or unsupported template is a capability result; it does not certify
accessible output. The [Research evidence matrix](../standards/conformance.md#research-artifact-evidence)
states the currently verified fixture scope.

## Conformance and feedback

For a portable-outcome disagreement, identify the claimed role/test ID, supported
subset, source fixture and exact expected classification/diagnostic codes. Run the
relevant gate against the pinned checkout:

```sh
pnpm test:conformance:renderer
pnpm test:conformance:p0
```

P0 needs Chromium and the independent Python implementation; missing/skipped
results fail. A failure outside a declared subset should be reported as a requested
capability, rather than silently extending an existing claim. The
[conformance matrix](../standards/conformance.md#claim-and-evidence-matrix) records
limits and evidence. Include the retained artifact or workflow run link in the
issue so maintainers can reproduce the same inputs and feed the result back into
fixtures and documentation.
