# @publisle/playground

Editor primitives for Publisle playground hosts: a `DocumentEditor` over the
portable document schema, declarative field specs for every core block, and a
Svelte 5 `BlockEditor` component. Hosts extend the block palette through
`PlaygroundExtensions` (labels, default data, field specs, registry
definitions) without forking the editor.

Requires Node.js 24 or later and Svelte 5.

```ts
import { DocumentEditor, createPlaygroundRegistry } from "@publisle/playground";

const editor = new DocumentEditor();
editor.addBlock("publisle:heading");
editor.importMarkdown("# Hello");
```

This package is part of Publisle, independently versioned and published under
the npm `beta` tag. See the
[core standard](https://github.com/VoidReg/publisle/blob/main/docs/standards/README.md)
and the [playground](https://publisle.xyz/playground) for the hosted editor.
