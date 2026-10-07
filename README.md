# Publisle

Portable semantic documents. A host page owns layout, navigation, and routing. Publisle compiles the article into a fragment the host can place inside that layout.

## Markdown

`@publisle/markdown` converts between CommonMark/GFM and Publisle documents:

```ts
import { fromMarkdown, toMarkdown } from "@publisle/markdown";

const imported = fromMarkdown(source);
if (!imported.document) throw new Error("Invalid Markdown");

const exported = toMarkdown(imported.document);
```

Every interactive block uses the same directive. Attributes carry `type`, `schemaVersion`, `id`, and `activation`. `title`, `description`, `instructions`, and `fallback` are content slots. The `publisle-payload` fence is the component configuration. `label` is an accessible name, used when the visible title cannot name the region.

````md
:::interactive{type="publisle:interactive-schematic" schemaVersion="2" activation="interaction" label="Interactive clocked counter"}
:::title
Clocked counter
:::

:::description
Observe the output on each clock edge.
:::

```publisle-payload
{ "source": "./counter.json" }
```

:::
````

## Publication

`publislePublication` compiles each Markdown module into a publication artifact. The host renders that artifact with `PublisleArticle` and supplies island implementations at runtime. `publisleSvelte()` and `publisleReact()` remain available when a project wants native Svelte or React components instead of a publication fragment.

### SvelteKit

```ts
// vite.config.ts
import { publislePublication } from "@publisle/adapter-core/vite";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { createRegistry } from "@publisle/core";
import { sveltekit } from "@sveltejs/kit/vite";

const registry = createRegistry([
  ...coreBlockDefinitions,
  interactiveSchematicDefinition,
]);

export default {
  plugins: [publislePublication({ registry }), sveltekit()],
};
```

```svelte
<script>
  import PublisleArticle from "@publisle/adapter-svelte/article";
  import "@publisle/adapter-core/document.css";
  import { metadata, publication } from "./article.md";
  import Schematic from "$lib/Schematic.svelte";

  const implementations = {
    "publisle:interactive-schematic": () =>
      Promise.resolve({ default: Schematic }),
  };
</script>

<h1>{metadata?.title}</h1>
<PublisleArticle {publication} instanceId="article" {implementations} />
```

### React

Use `publislePublication()` before the React Vite plugin. Markdown modules export `publication`, `metadata`, and `diagnostics`. Render the fragment with `PublisleArticle` from `@publisle/adapter-react`.

See [`examples/svelte`](./examples/svelte) and [`examples/react`](./examples/react) for complete integrations.

## Playgrounds

Interactive visual builders are available in both React and Svelte flavours:

```bash
pnpm --filter @publisle/playground-react dev
pnpm --filter @publisle/playground-svelte dev
```

They let you assemble an article from blocks, preview it live, and import/export Markdown or JSON.
