---
"@publisle/cli": minor
---

Add the `publisle build <file.json|file.md> --out <new-directory>` command: it compiles a portable document into a static reader page (HTML, stylesheets with inlined KaTeX rules, and a `publication.json` island manifest). Interactive blocks ship their authored fallbacks. The CLI now depends on `@publisle/adapter-core`; research tooling stays optional.
