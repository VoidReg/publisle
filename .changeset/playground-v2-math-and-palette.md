---
"@publisle/playground": minor
---

Playground editor upgrades: `duplicateBlock` on `DocumentEditor` (deep clone,
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
