# Declaring meaning without duplicating prose

The [normative beta contract](../standards/meaning.md) defines the vocabulary and its limits. Add data-only `semantics` and `traversal` to a portable definition; they describe meaning without replacing its approved host parser or renderer.

```ts
import { definePortableBlock } from "@publisle/block-sdk";
import { RICH_TRAVERSAL_RULES } from "@publisle/schema";

const wave = definePortableBlock({
  type: "example:wave",
  schemaVersion: 1,
  schema: approvedWaveParser,
  semantics: {
    entities: [
      {
        id: "frequency",
        kind: "input",
        name: "Frequency",
        origin: "declared-rule",
        binding: "/payload/frequency",
        valueType: "number",
        unit: "Hz",
        effects: ["spectrum"],
      },
      {
        id: "spectrum",
        kind: "output",
        name: "Spectrum",
        origin: "calculated-result",
        binding: "/payload/spectrum",
        implementation: {
          status: "implementation-bound",
          identity: "host:solver",
          limitation: "Computing these samples requires the host solver.",
        },
      },
    ],
  },
  traversal: {
    root: {
      properties: {
        explanation: {
          items: { ref: "flow" },
        },
      },
    },
    rules: RICH_TRAVERSAL_RULES,
  },
});
```

Keep constraints in the structural schema. `domain`, units and effects explain the contract; they are not executable equations. `validateSemanticBindings(semantics, normalizedData, schema, dependencies)` from `@publisle/contracts` checks both the real instance and explicit schema locations offline. It does not infer a portable schema from a callback. Schema-first definitions and complete contract export follow in G3.

For interactive blocks, `defineInteractiveBlock` already declares the shared explanation paths by default. A custom traversal replaces that declaration, so compose/include those paths explicitly. Arbitrary JSON fields do not become headings, resources or references just because their names resemble built-ins.

Reuse existing prose for unknown-reader fallback:

```ts
import { createBlock, document } from "@publisle/schema";
import { getBlockSourceDigest } from "@publisle/core";

const block = createBlock({
  type: "example:wave",
  data: {
    payload: { frequency: 2, spectrum: [0, 1, 0] },
    content: {
      title: [{ type: "text", value: "Wave explorer" }],
      purpose: [
        {
          type: "paragraph",
          content: [
            { type: "text", value: "Compare the signal and spectrum." },
          ],
        },
      ],
    },
  },
});

const article = document({
  blocks: [
    {
      ...block,
      readable: {
        sourceDigest: getBlockSourceDigest(block),
        provenance: { kind: "authored" },
        binding: "/content",
      },
    },
  ],
});
```

Update the digest deliberately when editing the source block; compilation will not repin it for you. If a payload has no explanation slot, put the sole authored explanation in `readable.content` instead. Never store another editable copy of the same prose in both locations. Generated content requires explicit generator/version/source provenance; there is no automatic summary generator.

`prepare` preserves an unknown block and warns about the missing definition. With a valid readable association, both native framework output and publication HTML retain substantive fallback without loading plugin code. Stale associations are retained for recovery but not displayed as current content. Preserve source JSON when exporting Markdown: the new interactive slots round-trip, but the block sidecar itself awaits archival exchange in G4 and currently produces a loss warning.

The [shared wave fixture](../../packages/contracts/fixtures/meaning.json) provides a larger JSON-only example, including actions, initial/reset state, evidence, views and preset associations. Generic controls or a diagram of these relationships would not reproduce the host's solver or 3D scene.
