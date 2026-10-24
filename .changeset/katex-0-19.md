---
"@publisle/adapter-core": patch
"@publisle/playground": patch
---

Update KaTeX from 0.16.47 to 0.19.0. The rendered CSS is re-exported from the
installed package, so the 0.18 internal class prefixing (`katex-` prefixed
selectors) applies automatically; no publisle selector targeted the old class
names, and the playground math editor already renders with `strict: "ignore"`,
which preserves the previous behaviour for missing character metrics.
