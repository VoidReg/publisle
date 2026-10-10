# Fourier showcase rehearsal

This standalone Astro site builds the **complete** authored Fourier tutorial from
packed Core packages. It uses no workspace imports and sits outside pnpm's
workspace package patterns. Requires Node.js 24 or later.

The existing article, square-wave illustration, clock payload, host-owned scene
contract, Mermaid SVGs and playground palette/styles are retained from
`examples/`. The three Mermaid diagrams use the checked-in SVGs. Other diagram
engines, the 3D scene and manual counter retain their authored static fallback
prose. The page identifies itself as a static reading edition.

## Replay the packed-artifact build

From the repository root, create the tarballs:

```sh
pnpm test:distribution
```

The gate prints a retained `publisle-distribution-…` directory. Pass its absolute
`tarballs/` path to the showcase rehearsal:

```sh
cd showcase/fourier
./scripts/rehearse.sh /tmp/publisle-distribution-EXAMPLE/tarballs
```

The script copies the eleven exact `0.0.0` Core tarballs, restores dependencies from
`package-lock.json`, builds the Astro page, and verifies MathML, table/SVG output,
resolved references, static fallbacks and absence of Research dependencies. It
writes `dist/rehearsal.json` with source/page hashes, package versions/integrities
and diagnostics. Packed tarball bytes are not reproducible across machines (gzip
records timestamps) and npm enforces a lock's recorded digests even for `file:`
dependencies, so the rehearsal rebuilds the lockfile from the exact pinned
`package.json` versions and the copied tarballs. The registry-release flow below
restores pure `npm ci` replay against published packages. `.artifacts/`,
dependencies and generated output are ignored.

`0.0.0` is the unreleased workspace placeholder. This rehearsal does **not** prove
registry publication or satisfy the public deployment acceptance criterion.

Preview after building:

```sh
npm run preview
```

## Substitute an actual release

After the operator publishes a coordinated 0.x version, replace every `file:`
Publisle dependency in `package.json` with that exact published version. Keep Astro
pinned. Regenerate and review `package-lock.json` against the registry, then run
`npm ci --ignore-scripts --legacy-peer-deps`, `npm run build`, and `npm run verify`
in a clean checkout without `.artifacts/`. Confirm the lock resolves the registry
packages and retain the validation evidence. The report infers packed files versus
exact registry versions from the requests and lockfile, while always leaving public
deployment unclaimed until an actual deployment URL is recorded.

Deploy `dist/` only after that clean released-package build passes. Record the
literal deployment URL and exact package-version manifest in the adoption evidence.
Sites registration and publication are deferred until that release prerequisite
is met. The current package tarball lock is for this local rehearsal.
