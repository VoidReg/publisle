# @publisle/playground

## 0.2.0

### Minor Changes

- 69132ae: New package promoted from the example hosts: `DocumentEditor` over the portable
  document schema with an injectable block registry, declarative field specs for
  every core block, and Svelte 5 `BlockEditor`/`JsonField` components. Hosts
  extend the block palette through `PlaygroundExtensions` (labels, default data,
  field specs, registry definitions) instead of forking the editor.
- 2ddf71a: Playground editor upgrades: `duplicateBlock` on `DocumentEditor` (deep clone,
  fresh id), block palette metadata (`CORE_BLOCK_DESCRIPTIONS`,
  `CORE_BLOCK_CATEGORIES`, `blockDescriptions`, `blockCategories`, and optional
  `description`/`category` on `PlaygroundBlockExtension`), and a math editing
  toolkit — searchable symbol-palette data, pure `insertMathSnippet` insertion
  with selection wrapping and caret placement, `tokenizeMath`/`highlightMath`
  for syntax-highlight overlays, and `MathEditor`/`MathBlockEditor` Svelte
  components with live KaTeX preview. `BlockEditor` gains a selection ring,
  duplicate action, per-kind segment tint chips, and inline math segments that
  expand into a compact math editor. Palette labels are glyphs (α, ∑, ⎧⎨⎩) and
  `□` argument guides render as `\square` in the preview instead of erroring.
