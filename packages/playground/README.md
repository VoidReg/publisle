# @publisle/playground

Publisle document tooling.

```sh
npm install @publisle/playground
```

portable document schema, declarative field specs for every core block, and a
Svelte 5 `BlockEditor` component. Hosts extend the block palette through
`PlaygroundExtensions` (labels, default data, field specs, registry
definitions) without forking the editor.

```ts
import { DocumentEditor, createPlaygroundRegistry } from "@publisle/playground";

const editor = new DocumentEditor();
editor.addBlock("publisle:heading");
editor.importMarkdown("# Hello");
```

the npm `latest` tag. See the
[core standard](https://github.com/VoidReg/publisle/blob/main/docs/standards/README.md)
and the [playground](https://publisle.xyz/playground) for the hosted editor.
