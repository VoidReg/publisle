# Distribution and release checklist

Publisle packages have independent numeric `0.x.y` versions and publish under
npm's `beta` tag. Contract version integers and compiler image recipes evolve
independently. Development and CI use Node.js ≥24 and pnpm 11.17.0.

## Release pending npm package changes from GitHub

1. Run `pnpm changeset`, select the changed packages, choose their bump levels,
   and describe the changes. Commit the generated Changeset with the implementation.
   During `0.x`, use a minor bump for breaking compatibility and a patch for
   compatible fixes. Private examples are not released.
2. Merge to `main`. Open **Actions → Release npm packages → Run workflow** and
   select `main`. There is no shared version input: Changesets calculates each
   package's next version and any necessary dependent releases. An empty plan
   exits without committing or publishing.
3. Follow **Validate and publish npm packages**, automatically dispatched against
   the preparation commit. Publication remains explicitly initiated by step 2.

The [preparation workflow](../../.github/workflows/npm-release.yml) consumes pending
Changesets, updates package versions and changelogs, package READMEs, showcase
references, and the pnpm lockfile. It commits `.release/plan.json`, containing
schema version 2, a unique batch ID, the complete package/version map, and the
publication subset with old/new versions. Internal `workspace:^` dependencies
become compatible npm ranges rather than requiring one shared exact version.
A dependency update within an existing compatible range does not itself require
republishing its consumers; incompatible ranges require dependent releases.

The [publication workflow](../../.github/workflows/npm-publish.yml) requires Check,
Research export, and Distribution to pass. Release distribution tests combine the
candidate tarballs with downloaded, integrity-checked npm tarballs for unchanged
packages. Rebuilding unchanged packages cannot substitute for testing the actual
published dependency graph. The workflow publishes only the planned subset in
dependency order and verifies each package's own version, `beta` tag, integrity,
and downloaded bytes. Fresh registry-only Core, Research, and showcase consumers
then verify the resulting version map, declarations, CLI isolation, and Astro
build with normal peer dependency validation.

After successful verification, it creates tags such as
`@publisle/adapter-astro@0.2.0` and a GitHub prerelease named for the
`npm-release-RUN-ATTEMPT` batch. Evidence includes the validated tarballs, version
map, contract bundle, publication record, and consumer report. Preparation and
publication runs share a concurrency group. A new preparation is refused until
the preceding batch has a completed, non-draft GitHub release.

If publication fails, use **Re-run failed jobs** on its original run. Retained
artifacts and upload progress allow matching published versions to be skipped;
conflicting immutable versions fail the entire preflight before any upload.
Do not rebuild artifacts after partial publication. If dispatch fails after the
preparation commit was pushed, run `npm-publish.yml` on `main` with the full
prepared commit SHA as `expected_commit`. If validation fails before any upload,
fix the source and dispatch publication against the corrected commit. Never
change planned versions or replace tarballs after an upload has been accepted.

The first independent batch migrates 22 packages' dependency metadata:
`adapter-astro` to `0.2.0` with Astro ≥7.2.8 within version 7, and the other 21
packages with internal dependencies to `0.1.1`. `schema` remains at `0.1.0`.
This is a one-time migration, not a requirement to release every package together.
KaTeX security remediation remains deferred; its alerts are not dismissed.

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
pass, `release-manifest.json` records schema version 2, the complete package/version
map, source commit, release batch ID and publication subset, SHA-256 of each exact
tarball, built-in contract identities and
digests, and current compiler release metadata. `contract-bundle.json` contains
the corresponding offline contracts exported by the installed Core tarballs.
The gate accepts mixed package versions and rejects placeholder versions or
incompatible internal dependency ranges. Ordinary distribution checks pack all
local packages; release validation uses the committed plan and registry artifacts
for unchanged packages. This report proves packed-artifact validation;
publication and compiler registry availability remain separate checks. Set
`PUBLISLE_DISTRIBUTION_ARTIFACTS` locally to choose the retained directory. From its
`consumer/` directory, run `npm ci --ignore-scripts`,
then `node consumer.ts` and
`node node_modules/@publisle/cli/dist/bin.js validate source.json`.

## Publish set and dependency order

Publish only the planned packages, each at its own version. Within each tier,
publish dependencies before consumers. A dependency order is:

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

- Review the package-specific release plan, lockfile and changelogs;
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
