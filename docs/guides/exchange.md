# Lock, archive and serve without reader tooling

Work on the authoring/build side, retaining the original input until the conversion is reviewed:

```ts
import { createRegistry, prepare, assertPrepared } from "@publisle/core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { lockDocument, resolveContracts } from "@publisle/contracts";
import { exportExchange, importExchange } from "@publisle/contracts/exchange";
import { toArchivalMarkdown, fromArchivalMarkdown } from "@publisle/markdown";
import {
  compilePublication,
  publicationReaderManifest,
} from "@publisle/adapter-core";

const registry = createRegistry(coreBlockDefinitions);
const locked = await lockDocument(article, registry);
// Store/review locked.original separately; approval saves document AND bundle.
const verified = await resolveContracts(locked.document.dependencies ?? [], {
  bundle: locked.bundle,
  offline: true,
});
const prepared = assertPrepared(
  prepare(locked.document, {
    registry,
    contractPins: locked.document.dependencies ?? [],
  }),
);
const decode = (text: string) => fromArchivalMarkdown(text).document;
await exportExchange("./new-article-package", {
  source: locked.document,
  bundle: verified,
  archival: { markdown: toArchivalMarkdown(locked.document), decode },
  resources: prepared.resources.resources.map((resource) => ({ resource })),
}); // Missing bytes stay explicitly missing; no network access occurs.
const imported = await importExchange("./new-article-package", {
  decodeArchival: decode,
});
const artifact = compilePublication(prepared, {
  build: {
    configuration: { renderers: "host-approved-configuration-1" },
    reproducible: true,
  },
});
const readerData = publicationReaderManifest(artifact);
```

Pass only `readerData`, separately instantiated HTML and approved host loaders to your reader. Import `attachPublication`/`instantiatePublication` from `@publisle/adapter-core/publication-runtime`. Artifact mode reports unsupported static framework components; supply `renderers[type].static.lower` or authored fallback rather than claiming arbitrary framework components compile to HTML. See [delivery](../standards/delivery.md).

For authoring previews, `pnpm cli lock article.json` prints a pinned copy without writing. `--output new-locked.json` refuses overwrite; `--in-place` is prohibited for lock. Trusted CLI `contractBundle` config approves pins for later validation. Save the returned bundle through the library workflow above; source pins alone are not a distributable closure. Existing noncanonical inputs require an explicit upgrade preview first. Both playgrounds now offer **Export archival Markdown**; ordinary Markdown remains a separate readable projection. Import auto-detects the archival document directive.

Enable remote resolution only in preparation tooling with explicit policy and locations:

```ts
const closure = await resolveContracts(pins, {
  cache: verifiedCache,
  remote: {
    policy: {
      origins: ["https://contracts.example"],
      maxBytes: 500_000,
      timeoutMs: 2000,
    },
    locations: approvedImmutableIdToMirrorUrls,
  },
});
```

Neither a schema `$ref` nor a document module name enables fetching or execution. Keep full contracts/Ajv out of readers. Relative resources need a host resolver with the source `base`, explicit behavior version, resolved location and exact byte digest if verified. Directory exchange includes only bytes you explicitly supply and permit. See the [exchange contract](../standards/exchange.md) for grammar, integrity domains, budgets and filesystem limitations.
