---
"@publisle/research": patch
"@publisle/adapter-core": patch
"@publisle/template-sdk": patch
"@publisle/cli-research": patch
---

Preview and export fidelity fixes. LaTeX export reduces embeds, diagrams and raw HTML to one readable text instead of concatenating the alternative text with the authored fallback. Publication artifacts number footnote markers and definitions by first reference instead of showing raw labels, and style the numbers. LuaLaTeX section levels are relative to the first emitted heading, so documents whose title doubles as a level-1 heading no longer number sections 0.1 onward. The website shortens four documentation titles below 60 characters.
