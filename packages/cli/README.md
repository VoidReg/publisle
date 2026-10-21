# @publisle/cli

Node CLI for validation, static reader builds, and explicit source upgrades.

Requires Node.js 24 or later. Framework adapters also require their declared peer dependencies.
This package is part of Publisle, independently versioned at `0.1.1` and published under the npm `beta` tag.
Frozen contract version integers are independent of npm package versions.

- [Core standard](https://github.com/VoidReg/publisle/blob/main/docs/standards/README.md)
- [Quickstart and package usage](https://github.com/VoidReg/publisle#readme)
- [Distribution and release checklist](https://github.com/VoidReg/publisle/blob/main/docs/guides/releases.md)

Core packages do not install Research templates, citeproc, PDF compilers, or TeX.

## Build a static reader

```sh
npm install -g @publisle/cli
publisle build article.md --out dist/
```

The input may be Markdown or canonical JSON. Add `--config host.mjs` (or
`host.ts`) for a trusted Core registry and Markdown codecs. The output directory
must be new. It contains `index.html`, `document.css`, `katex.css`, fonts, and a
`publication.json` reader manifest. Islands retain authored fallbacks: the CLI
has no host runtime. Attach interactive runtimes through a framework host.

Exit codes: **0** success, **1** document errors, **2** usage, config, or I/O errors.
Research export requires a separate `@publisle/cli-research` installation.
