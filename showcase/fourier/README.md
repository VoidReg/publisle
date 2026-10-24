# Fourier showcase rehearsal

This standalone Astro site builds the **complete** authored Fourier tutorial from
packed Core packages. It uses no workspace imports and sits outside pnpm's
workspace package patterns. Requires Node.js 24 or later.

The existing article, square-wave illustration, clock payload, host-owned scene
contract, Mermaid SVGs and playground palette/styles are retained from
`examples/` — `scripts/rehearse.sh` copies the article and its two assets from
`examples/articles/` into `public/` before building, so they are not checked in
twice. The three Mermaid diagrams use the checked-in SVGs. Other diagram
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

The checked-in manifest and lock use exact published Publisle versions and Astro
7.3.8, so dependency scanners can resolve this site without local tarballs.
The rehearsal script substitutes the validated tarballs listed in the distribution
report, generates a temporary lock, and then replays it with `npm ci`. It copies
the shared article assets before building and verifies the resulting page.

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
