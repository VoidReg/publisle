---
"@publisle/research": patch
---

Pin the optional `@publisle/pdf-native-*` platform packages to 0.4.0, which carries
the native math fixes from publisle/publisle-rs#25: bounded support for common TeX
commands (`\hat`, `\binom`, accents, `\overset`/`\underset`, `\boxed`, `\tag`),
italic variables, operator spacing, display-style limits, stretched fences, LaTeX-
matching equation numbering, and visible warnings instead of aborted exports for
unknown commands. The VPS native runtime pin moves to the same version.
