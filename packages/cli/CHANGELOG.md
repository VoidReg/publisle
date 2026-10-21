# @publisle/cli

## 0.2.0

### Minor Changes

- 879eed3: Add the `publisle build <file.json|file.md> --out <new-directory>` command: it compiles a portable document into a static reader page (HTML, stylesheets with inlined KaTeX rules, and a `publication.json` island manifest). Interactive blocks ship their authored fallbacks. The CLI now depends on `@publisle/adapter-core`; research tooling stays optional.

### Patch Changes

- Updated dependencies [879eed3]
- Updated dependencies [4342a8d]
  - @publisle/adapter-core@0.1.2

## 0.1.1

### Patch Changes

- e97d4d7: Allow compatible updates between independently versioned Publisle packages. Require Astro 7.2.8 or newer in the Astro adapter to resolve the reported security advisories. Astro 6 is no longer supported.
- Updated dependencies [e97d4d7]
  - @publisle/blocks-core@0.1.1
  - @publisle/contracts@0.1.1
  - @publisle/core@0.1.1
  - @publisle/markdown@0.1.1
