# Contributing to Publisle

Thanks for helping build a publishing toolkit that treats articles as portable,
validatable data. This file covers the practical basics; product and beta
limits live in the [documentation index](docs/README.md).

## Getting help and proposing ideas

- Ask questions and share ideas in
  [GitHub Discussions](https://github.com/publisle/publisle/discussions).
- Bug reports start best as a [Discussion](https://github.com/publisle/publisle/discussions)
  unless you can already reproduce them against `main` — then open an issue
  with the reproduction template.
- Look for issues tagged
  [`good first issue`](https://github.com/publisle/publisle/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  for scoped entry points.

## Development setup

- Node **24+** and pnpm **11.17+ (11.x)**.
- `pnpm install` at the repository root. The workspace covers `packages/*`,
  `blocks/*`, `examples/*`, and `sites/*`.
- The site and playgrounds resolve TypeScript sources; no build step is needed
  for local development.

```sh
pnpm --filter @publisle/playground-svelte dev   # or playground-react
pnpm --filter @publisle/www dev                 # the website (docs are the demo)
```

Rust engine changes belong in [publisle-rs](https://github.com/publisle/publisle-rs).
This repository owns the TypeScript projection, runtime integration and VPS deployment.
To verify a new external native release, build the packages and run
`node tools/native-consumer-proof.mjs`; CI repeats this on Linux, macOS and Windows.

## Before you open a pull request

Run the standard gate and keep it green:

```sh
pnpm check        # typecheck, lint, format, unit tests, example builds
```

Depending on the area you touched, also run the relevant gates:

| Area                         | Command                  |
| ---------------------------- | ------------------------ |
| Research/LaTeX export        | `pnpm test:research`     |
| Browser/playground flows     | `pnpm test:acceptance`   |
| Packed-artifact distribution | `pnpm test:distribution` |
| PDF service (needs Docker)   | `pnpm test:pdf-service`  |

## Conventions

- Conventional Commits (`feat:`, `fix:`, `perf:`, `chore:` …), subject only.
- Prettier and ESLint config live at the root; `pnpm format` before pushing.
- Wire contracts and block schemas are versioned deliberately — see
  [contracts](docs/contracts.md) and the
  [beta standards](docs/standards/README.md) before proposing changes.
- Every documented behavior deserves a test that fails without it.

## Licensing

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).
