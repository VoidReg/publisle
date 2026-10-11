# Distribution and release checklist

Publisle is in beta. All 23 publishable packages ship at one coordinated version
under the npm `beta` tag. Frozen contract version integers are independent of
that version. Development and CI use Node.js ≥24 and pnpm
11.x (currently pinned to 11.17.0). Publishing starts only when a maintainer
manually activates the release workflow.

## Release all npm packages from GitHub

1. Merge the changes to `main` and describe them under `Unreleased` in the
   [changelog](../../CHANGELOG.md). Update contract revisions and the compiler
   release record first if those independently versioned artifacts changed.
2. Open **Actions → Release npm packages → Run workflow**, select `main`, and
   enter the next coordinated beta version, for example `0.1.1` or `0.2.0`.
   Versions must increase. The current beta policy accepts numeric `0.x.y`
   versions other than the placeholder `0.0.0`.
3. Follow **Validate and publish npm packages**, which the preparation workflow
   starts automatically. Its URL is linked in the preparation run summary.

The [preparation workflow](../../.github/workflows/npm-release.yml) updates all
public package versions, exact internal dependency pins, package READMEs,
Fourier showcase tarball references and the changelog. It refreshes the pnpm
lockfile and commits the release metadata to `main`. Private root and example
package versions and contract integers are not npm release versions.
The showcase rehearsal regenerates its npm lockfile from the actual tarballs;
the resulting lock and hashes are retained as distribution evidence.

The [publication workflow](../../.github/workflows/npm-publish.yml) runs on that
new commit so npm provenance identifies the source containing the version bump.
It requires the existing Check, Research export and Distribution gates to pass,
then publishes the exact validated tarballs in dependency order. It verifies
every public package index, `beta` tag, integrity value and downloaded SHA-256,
then installs fresh registry-only Core and Research consumers, checks strict
declarations and CLI isolation, and builds the complete Fourier showcase.
Finally it creates `vVERSION` and a GitHub prerelease containing the tarballs,
contract bundle and publication/consumer verification records. Overlapping
publication runs are serialized.

The workflow does not overwrite npm versions. It checks the entire batch for
conflicts before uploading anything. If npm publishing or post-publication
verification fails, use **Re-run failed jobs** on the original publication run.
This preserves the original Distribution artifacts and restores the upload
progress record. Already published versions are skipped only when their bytes
match those artifacts. Do not rerun all jobs or rebuild artifacts after a partial
publish: packed bytes can differ between builds, and npm versions are immutable.
If preparation dispatch fails after its commit was pushed, run the publication
workflow directly on `main` with that version and its full commit SHA; the
workflow rejects any mismatch between the selected source and expected commit.
If validation fails before publication, fix the source and dispatch a new
publication run with the prepared version and the new full commit SHA.

### One-time npm authentication setup

All 23 packages are configured to trust GitHub repository `VoidReg/publisle`,
workflow filename **`npm-publish.yml`**, with direct publishing allowed and no
environment restriction. The publishing job has `id-token: write` and uses npm
12.2.0. It needs no stored npm token or interactive login. The dispatch workflow
also needs the repository's Actions token to push release metadata and dispatch
another workflow; branch protection must permit that release commit.

For a newly added public package, first publish it and add the same trusted
publisher in its npm settings, or run this command outside the pnpm workspace
with a current npm CLI and authenticate when prompted:

```sh
npm trust github @publisle/PACKAGE --repo VoidReg/publisle --file npm-publish.yml --allow-publish --yes
```

See npm's [trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).
Changing the publishing workflow filename or repository requires updating these
package settings. Compiler image releases retain their separate explicit
[compiler workflow](../../.github/workflows/compiler-release.yml); ordinary npm
updates reuse the digest recorded in the packaged compiler release record.

## Package artifacts

Run `pnpm build:packages` to emit ESM JavaScript, declarations and both source maps
for the 23 packages listed in `packages/core-packages.json`. Workspace exports
continue to resolve source TypeScript. `pnpm pack` applies each package's
`publishConfig` so installed consumers resolve `dist` JavaScript and declarations.
Relative declaration imports use `.js`, matching the emitted modules. The package
also contains TypeScript sources for source maps, framework `.svelte`/`.astro`
components, CSS, contract schemas/fixtures and Research compiler/vendor assets.
Framework components remain source components for their framework compiler;
ordinary Node consumers receive compiled ESM. Relocated source maps point to the
packaged `src/` files, rather than the build machine.

Run `pnpm test:distribution` to build and pack every package, check export/bin/type
artifacts and rewritten workspace versions, then create an isolated consumer
outside this workspace. It installs the ten framework-independent Core packages,
imports and prepares an article, renders its static HTML, validates through the
compiled CLI, checks that PDF export refuses with Research installation guidance,
checks the full installed dependency tree for Research/TeX-related packages, and
compiles consumer TypeScript with library checking enabled. A second isolated
consumer builds an Astro site using the packed integration, retained `.astro`
component and CSS. A third isolated consumer installs Core plus all eight Research packages, checks
default tagged article sources, five publisher/article templates, embedded Springer
class resources, portable citations and CLI plugin imports, then checks strict
declarations. A deliberately invalid mutable compiler reference proves the packed
release manifest resolves before setup refuses it; no compiler is built or pulled.
Other framework adapter builds are covered separately by
`pnpm check` example builds.

The workflow also replays the [complete Fourier showcase](../../showcase/fourier/README.md)
from the exact packed Core tarballs and retains its static output and hash/version
report. This remains local artifact evidence until released packages and public
deployment are available.

The Distribution workflow retains the tarballs, dependency lock, source document,
and executable consumer so failures can be reproduced. After all consumer checks
pass, `release-manifest.json` records the coordinated version, dependency-derived
publication order, SHA-256 of each exact tarball, built-in contract identities and
digests, and current compiler release metadata. `contract-bundle.json` contains
the corresponding offline contracts exported by the installed Core tarballs.
The gate rejects placeholder or mixed package versions and incorrect
internal dependency pins. This report proves packed-artifact validation;
publication and compiler registry availability remain separate checks. Set
`PUBLISLE_DISTRIBUTION_ARTIFACTS` locally to choose the retained directory. From its
`consumer/` directory, run `npm ci --ignore-scripts --legacy-peer-deps`,
then `node consumer.ts` and
`node node_modules/@publisle/cli/dist/bin.js validate source.json`.

## Publish set and dependency order

Publish all packages at the same chosen beta version. Within each tier, publish
dependencies before consumers. A dependency order is:

1. Core: `schema`, `contracts`, `core`, `block-sdk`, `blocks-core`,
   `blocks-technical`, `markdown`, `profiles`, `adapter-core`, the five framework
   adapters, then `cli`.
2. Research: `template-sdk`, the template packages, `research`, then
   `cli-research`. Research remains a separate optional installation.

The intended npm scope is `@publisle`, with public access configured per package.
Scope ownership, publishing credentials and name availability must be verified by
the release operator before publishing; repository metadata does not prove npm
ownership. Confirm with `npm whoami` and `npm org ls publisle`, and review existing
package ownership/version records with `npm view <name> versions maintainers`.
Run these npm registry checks outside the workspace: the root `devEngines`
intentionally requires pnpm for workspace commands.

## Release rehearsal and operator checklist

- Review the next coordinated beta version, lockfile and changelog;
  review compatibility and any changed contract digests. Never publish `0.0.0`.
- Record the shipped contract version integers in the changelog. They are
  protocol revisions, independent of the npm version, and are never renumbered
  to match a release: schematic 2 is the first published wire shape even though
  no public 1 ever shipped, and version-1 inputs migrate transparently.
- Run `pnpm install --frozen-lockfile`, `pnpm check`, renderer and P0 conformance,
  `pnpm test:research`, `pnpm test:pdf-ua`, and `pnpm test:distribution`.
- Review notices, contract/Research compatibility, accessibility claims, each packed
  manifest, exported declarations and retained Core consumer evidence.
- Record the compiler multi-arch manifest digest and separate amd64/arm64 digests
  from its publishing workflow. Record veraPDF 1.28.2 installer SHA-256
  `d1693a5f0bf0997180f6d97e8a5568b0cf39e27eee338d439c8adb58435c1e89`
  and link successful PDF validation reports. Local image IDs are not registry
  release digests.
- Confirm npm scope ownership and two-factor/trusted publishing policy. Review the
  concrete tarballs and versions before the operator publishes in dependency order.
- Install the published versions in a clean project; repeat the consumer checks.
  Deploy the showcase from these exact versions and record its URL/version manifest.

The local packed-artifact rehearsal on 2026-10-10 passed for all 23 tarballs and the
isolated Core consumer and standalone Astro build. Both compiler platforms are
verified locally against recipe 2 on the same day: amd64 natively, and arm64 with
`linux/arm64` confirmed by `docker image inspect` and execution under QEMU —
each passing the five-publisher smoke and the three PDF/UA fixture gates with
veraPDF 1.28.2. Registry publication, credentials, clean-machine verification of
each published platform image and the public showcase remain release/adoption
gates.

Npm authentication and `publisle` organization ownership were verified for the
release operator `voidreg`. Compiler recipe 2 was published as `recipe-2.0.0`
after both native architecture jobs passed. Its reviewed manifest and platform
digests, plus the veraPDF pin, are recorded in
[the packaged compiler release record](../../packages/research/compiler/release.json)
and the [changelog](../../CHANGELOG.md). Anonymous registry access to the compiler
manifest was verified. The final npm tarballs must contain that digest record;
preparation tarballs with `publishedImage: null` are superseded.

The prepared `0.1.0` tree passed local validation: 632 unit tests, 33 Python tests,
renderer parity, P0 TEST-01–13, 14 Research integration checks, three PDF/UA
fixtures, all example builds, and the full packed distribution gate. All 23
tarball hashes, exact internal pins and publication order were checked against the
release manifest; the installed Core consumer validated all 16 exported contract
seals. The complete Fourier showcase then built and verified from eleven of those
exact Core tarballs. These checks establish local package readiness. Verify the published versions
in a clean registry-only consumer before recording distribution completion.
Public showcase deployment and the SaaS pilot remain separate adoption work.
