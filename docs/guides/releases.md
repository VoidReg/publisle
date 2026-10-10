# Distribution and release checklist

Publisle is in beta. `0.0.0` is an unreleased workspace placeholder. Select a
coordinated 0.x npm version for an actual release; frozen contract version integers
are independent of that version. Development and CI use Node.js ≥24 and pnpm
11.x (currently pinned to 11.17.0). No package publishing runs automatically.

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
and executable consumer so failures can be reproduced. Set
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

- Choose and apply the coordinated beta version. Update the lockfile and changelog;
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
