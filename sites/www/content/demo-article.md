## A live Publisle publication

This article is a Markdown file inside the website project, compiled by
`@publisle/adapter-core` at build time and rendered through the Astro adapter.
Nothing on this page is hand-written HTML: it is Publisle output.

### Structured content

Publisle blocks carry semantics, not styling: the host decides how a table or
figure looks, while the document keeps IDs, captions, and reading order
machine-checkable.

| Block    | What it preserves                    |
| -------- | ------------------------------------ |
| Headings | Cross-reference labels and hierarchy |
| Figures  | Alternative text, caption, source    |
| Math     | TeX source in the portable document  |

Inline structure survives round-trips: inline math such as $e^{i\pi} + 1 = 0$
and `inline code` keep their node types instead of collapsing to plain text.

> Blocks that cannot run (print, readers, static previews) fall back to
> readable content instead of blank space.

### Diagnostics, not surprises

Invalid structure produces diagnostics with stable codes at compile time, not
broken pages at runtime. The playground shows the same diagnostics inline.

```ts
import { loadPublication } from "@publisle/adapter-astro";

const publication = await loadPublication("article.md", { registry });
```
