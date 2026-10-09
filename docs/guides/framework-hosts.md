# Next.js, Astro, Vue and Python hosts

Hosts own routes, page metadata and implementation loaders. The adapters preserve
portable source semantics and diagnostics; they do not add a CMS or editor.

Next.js App Router uses `@publisle/adapter-next` on the server. `loadPublication`
reads local Markdown/JSON, prepares it with the host registry, and compiles a
publication artifact without Vite. `PublisleArticle` renders namespaced HTML for
an explicit `instanceId`. Static pages have no Publisle client imports. For
interactive articles, a host client wrapper supplies local loaders to
`ClientAttachment` from `@publisle/adapter-next/client`, passing a
`publicationReaderManifest`. This component attaches the shared controller and
disposes it when React unmounts or navigation replaces the article. See the
[Next example](../../examples/next/app/page.tsx) and its
[interactive route](../../examples/next/app/interactive/page.tsx).

Astro uses `publisleAstro()` in its config and `publisleLoader(files, options)` in a
content collection. Files map stable host collection IDs to local paths.
`@publisle/adapter-astro/Article.astro` emits publication HTML with no script.
Hosts add islands explicitly and call `attachArticle(root, manifest, environment)`
from `./runtime`, retaining its returned disposal function for removal/navigation.
The [Astro example](../../examples/astro/src/pages/index.astro) has a static route
and an [interactive host](../../examples/astro/src/pages/interactive.astro) whose
custom element disposes automatically when disconnected.

Vue uses `publisleVue` as an optional Vite integration and `vueTarget` as a native
module emitter. Generated modules use Vue components and SSR; only referenced
islands import the controller runtime. `PublisleArticle` renders existing
artifacts and attaches host implementation loaders after mounting. Both island
paths dispose on unmount and retain independent repeated placements. See the
[Vue example](../../examples/vue/src/main.ts).

```sh
pnpm --filter @publisle/example-next build
pnpm --filter @publisle/example-astro build
pnpm --filter @publisle/example-vue build
pnpm test:acceptance
```

Production browser tests verify static delivery, repeated placements, independent
island state, ABI inputs and cleanup. A static Next page still includes Next's
own framework scripts; no Publisle client runtime is required. Static Astro pages
emit no JavaScript.

The independent Python renderer reads portable JSON directly:

```sh
python3 -B tools/python/render.py packages/contracts/fixtures/static-rendering.json
pnpm test:python
```

It supports a declared v1 static subset: prose, rich text/direction, lists,
quotes/code, figures/tables, labels, authored notes and numeric references.
It escapes HTML and refuses executable URLs. Math, interactive/custom behavior
and unsupported versions use readable fallback with diagnostics. It executes
neither migrations nor plugins and does not implement full CSL. Its shared
fixture is compared with the TypeScript renderer for supported semantics.
