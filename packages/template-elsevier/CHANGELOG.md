# @publisle/template-elsevier

## 0.1.2

### Patch Changes

- 0c8ad7b: Add an explicit experimental Rust PDF compiler API and CLI engine with pinned fonts, bounded math, local assets and structured diagnostics. Allow editor hosts to supply resolved citation and bibliography text without loading CSL in publication readers. Omit empty abstracts and normalize body section levels in LaTeX exports.
- a9d627b: Add npm keywords to every package manifest. The Astro adapter now carries the `astro-integration`, `astro-component` and `withastro` keywords so it appears in the Astro integrations directory.
- Updated dependencies [0c8ad7b]
- Updated dependencies [a9d627b]
- Updated dependencies [603d12a]
- Updated dependencies [f3dd162]
  - @publisle/template-sdk@0.1.3

## 0.1.1

### Patch Changes

- e97d4d7: Allow compatible updates between independently versioned Publisle packages. Require Astro 7.2.8 or newer in the Astro adapter to resolve the reported security advisories. Astro 6 is no longer supported.
- Updated dependencies [e97d4d7]
  - @publisle/template-sdk@0.1.1
