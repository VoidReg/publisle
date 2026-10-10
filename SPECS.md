# Publisle — Specification

**Status:** Implemented Core v1 and Research profile v1 (beta), revision 7  
**Reviewed against:** Workspace implementation, 2026-10-10  
**Brand:** Publisle by VoidReg  
**License:** [MIT](LICENSE)

This specification describes the current portable model, public tooling contracts,
and production rendering boundaries. It distinguishes implemented behavior from
deferred work; “v1” identifies the document/platform contract, not a claim that
workspace packages have been published as a stable npm release.

The source types and tests linked below define exact API signatures. The
[README](README.md) provides the overview; the [developer guide](docs/developer-guide.md)
provides integration examples.

## Normative authority

The [beta standards](docs/standards/README.md) are normative for the portable
subset they name. This specification summarizes them and must not redefine them.
Frozen numeric versions stay at 1 for the document, the publication artifact, the
contract format, and island `inputVersion`. Core block payloads stay at 1. The
schematic payload stays at 2. A pinned contract is identified by its digest, not
by that integer. Workspace schemas may gain optional fields in place. A digest
that already pins different content must not be reused.

| Topic                                           | Normative document                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Schemas, sealed exports, locks, offline bundles | [Contract export](docs/standards/contracts.md), [Exchange](docs/standards/exchange.md) |
| Inputs, outputs, actions, state, bindings       | [Meaning](docs/standards/meaning.md), [Composition](docs/standards/composition.md)     |
| Inspection without executing the plugin         | [Projections](docs/standards/projections.md)                                           |
| One island input for native and artifact paths  | [Delivery](docs/standards/delivery.md)                                                 |
| Named conformance claims                        | [Conformance](docs/standards/conformance.md)                                           |

A descriptor's portable payload schema is not a validator. Another implementation
obtains a contract by local export or an offline bundle, checks the JCS SHA-256
seal, and resolves schema resources inside that bundle. It does not fetch them.
A valid digest establishes integrity, not permission to execute the plugin.
Declaring inputs, outputs, actions, or state does not run the plugin. Semantic
projection is a separate export, not a side effect of rendering. Native and
artifact paths use the same `inputVersion: 1` value. Named TEST groups are claims.
`pnpm test:conformance:p0` reruns the tests that support those claims. It does
not trust a stored report.

## Part I — Publisle Core

Sections 1–19 describe Core. Core stores citation identifiers, bibliography data
and mathematical source as portable content; it has no opinion on citation
styles, publisher templates, LaTeX compilation, JATS or PDF. Those optional
operations are specified in [Part II](#part-ii--publisle-research-profile) and the
[normative Research profile](docs/standards/publishing.md). The
[governance policy](docs/governance.md) records the independent version domains.

## 1. Product definition

Publisle is a framework-independent semantic document model and publishing toolkit
for technical articles, research explainers, documentation, and interactive
explanations. Code-authored typed documents are the primary representation.
Markdown is a supported import/export format, not the canonical internal model.

Publisle separates portable content, trusted preparation, and host-native output.
The host owns layout, routing, metadata/SEO policy, rendering, framework hydration,
styling, bundling, caching, and deployment.

Publisle is not a CMS, site builder, hosting service, frontend framework,
unrestricted code-execution service, or page metadata engine.

The performance contract applies to **native generated static output**:

> Static content adds no Publisle client runtime. Validation, migration and
> Markdown analysis stay at a trusted server/build boundary. Interactive content
> loads only referenced implementations and the adapter runtime they need.

Framework shell JavaScript and the island implementation's own dependencies are
not zero-cost. Browser-authoring playgrounds intentionally include editor/tooling
code. Runtime convenience components are not the static zero-runtime path.

## 2. Architectural boundary

![Publisle preparation, compilation, and host-owned rendering pipeline.](docs/assets/publisle-system.svg)

The SVG is a static documentation asset; readers need no Mermaid compilation.

The supported paths are:

```text
Markdown -- import ---+
                      +--> portable document --> prepare --> prepared document
JSON ----- parse -----+                              |
                                                     +--> native adapter module
                                                     +--> publication artifact
Portable/upgraded document ------------------------------> Markdown / JSON export
```

Core prepares semantic data; it does not render a page. The platform-neutral
adapter compiler creates render plans, diagnostics and publication artifacts.
React and Svelte targets lower plans into native components and island boundaries.
The host composes and renders the result beside unrelated application content.

Markdown export consumes portable documents (or an explicitly projected upgraded
wire document), not prepared resource/island plans. Compilation and rendering
never rewrite source files.

## 3. Layer responsibilities

| Layer             | Current responsibility                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Schema            | Portable document, block, metadata, diagnostic and prepared-plan contracts                                           |
| Core              | Registry, preparation, migrations, profiles, references, resource planning, cache identity, pure document helpers    |
| Block SDK         | Portable and interactive definition helpers; no framework rendering                                                  |
| Block definitions | Core content catalog and reference schematic extension                                                               |
| Markdown          | Import, export, formatting, native directive codecs and source locations                                             |
| Adapter core      | Render planning, HTML-fragment publication artifacts, Vite tooling and island controller                             |
| React / Svelte    | Native module emission, composable content/artifact components, framework mount/unmount                              |
| CLI               | Optional Core Node validation, explicit source upgrades, locks, inspection and projections; dynamic plugin discovery |
| Host              | Page policy, implementations, resource I/O/transforms, asset delivery and deployment                                 |
| Playgrounds       | Example authoring applications using public APIs                                                                     |

Schema, core and Block SDK have no framework, Markdown, editor or bundler imports.
Adapter core has no React/Svelte imports. Its Vite integration uses Markdown at
build time; neither tool belongs in a generated reader bundle. A package-level
tooling dependency is not permission to import that dependency into client output.

## 4. Semantic document model

The wire document is JSON-compatible data:

```ts
interface Document {
  schemaVersion: number;
  metadata?: PublicationMetadata;
  blocks: Block[];
}

interface Block<Type extends BlockType = BlockType, Data = JsonValue> {
  id: BlockId;
  type: Type;
  schemaVersion: number;
  data: Data;
}
```

The current document envelope version is **1**. IDs serialize as strings and are
opaque branded values in TypeScript; parsing accepts UUIDs or ULIDs. Block types
are namespaced strings such as `publisle:heading` and `demo:interactive-scene`.
Builders assign IDs/current versions; `createBlock` can retain explicit IDs and
versions. `parseDocument`/`parseBlock` check the wire boundary; registered payload
schemas run in preparation.

Actual authoring APIs:

```ts
import { document } from "@publisle/schema";
import { heading, paragraph } from "@publisle/blocks-core";
import { interactiveSchematic } from "@publisle/blocks-technical";

const article = document({
  metadata: { title: "Digital timing" },
  blocks: [
    heading({
      level: 1,
      content: [{ type: "text", value: "Digital timing" }],
    }),
    paragraph({
      content: [{ type: "text", value: "Observe each clock edge." }],
    }),
    interactiveSchematic({
      activation: "visible",
      content: {
        title: [{ type: "text", value: "Clocked counter" }],
        description: [
          {
            type: "paragraph",
            content: [{ type: "text", value: "Use Clock and Reset." }],
          },
        ],
      },
      accessibility: { label: "Interactive clocked counter" },
      payload: { source: "./counter.json" },
    }),
  ],
});
```

Document data contains no components, callbacks, DOM nodes, CSS selectors, router
objects or bundler configuration. Portable intent such as a callout variant is
allowed. Plugin implementations and services remain outside the document.

### 4.1 Publication metadata

All fields are optional:

```ts
interface PublicationMetadata {
  documentType?: string;
  title?: string;
  description?: string;
  language?: string;
  direction?: "ltr" | "rtl" | "auto";
  authors?: Author[];
  publishedAt?: IsoDateTime;
  modifiedAt?: IsoDateTime;
  identifiers?: Record<string, string>;
  license?: LicenseReference;
  subjects?: string[];
  image?: ImageReference;
  extensions?: Record<string, JsonValue>;
}
```

Dates use the schema's ISO date-time contract. Authors can carry affiliations and
identifiers. Extensions retain namespaced/source-format metadata outside portable
fields. Metadata never instructs Publisle to create a route, hero, head element,
canonical URL, robots policy, feed, or search record. The host may merge, transform
or ignore it.

Source contracts: [document](packages/schema/src/document.ts),
[blocks](packages/schema/src/block.ts), [metadata](packages/schema/src/metadata.ts).

## 5. Block SDK and content contracts

`definePortableBlock` accepts a namespaced type, current schema version and
`Schema<Data>.parse(unknown)`, with optional defaults, migrations, normalization,
resource extraction and island classification. `defineInteractiveBlock` wraps a
payload schema in the shared interactive envelope and retains a definition-level
descriptor.

There are no `registerReactBlock`/`registerSvelteBlock`, `text()`, or
`resource()` public helpers implied by this spec. Inline text is a data node;
resources are `{ uri, transform?, options? }`. Markdown codecs and renderer
registration are separate tooling contracts, not fields of the portable definition.

### 5.1 Shared interactive envelope

```ts
interface InteractiveEnvelope<Payload> {
  activation: "load" | "visible" | "idle" | "interaction";
  content?: {
    title?: readonly JsonValue[];
    description?: readonly JsonValue[];
    instructions?: readonly JsonValue[];
  };
  fallback?: readonly JsonValue[];
  accessibility?: { readonly label?: string };
  payload: Payload;
}
```

For core-rich-content integrations, title nodes are inline content and description,
instructions and fallback nodes are flow content. The SDK accepts optional
`parseTitle`/`parseFlow` parsers; without them the generic envelope performs
structural node checks, not full core-rich-text validation.

Omitted activation defaults to `visible` during parsing. The envelope rejects
unsupported keys. Payload parsing and optional resource extraction belong to the
definition; `resources` on an interactive definition receives its **payload**.

Descriptors include display name, description, a portable payload schema and optional
documentation/examples/capabilities. That schema is documentation attached to the
definition. It is not, by itself, the sealed validator another implementation
runs. Descriptors are not duplicated into each article payload, and they are not
a security sandbox or a guarantee that canvas or 3D behavior can be inferred
from data.

Reader-facing descriptions, instructions and authored fallback are optional.
The payload is not a substitute for readable fallback content. A visible title or
accessible label can name an interactive region; no mandatory free-form “alt note”
must be added to every interactive payload.

Source contracts: [Block SDK](packages/block-sdk/src/index.ts),
[interactive envelope](packages/schema/src/prepared.ts).

The envelope is the authored storage shape. It can hold readable prose and an
arbitrary JSON payload. It does not, by itself, make that payload interpretable
by another implementation.

### 5.2 Portable contract distribution

Normative detail is [contract export](docs/standards/contracts.md) and
[locked exchange](docs/standards/exchange.md). Export produces
`ExportedContract` as `{ id, digest, contract }`. The digest is SHA-256 over the
JCS bytes of the entire `contract` body. `id` is `urn:publisle:contract:` followed
by that digest. A lock inventories root ids, contract identities, and schema
resource digests. A bundle carries roots, sealed contracts, and their lock.

Consumption is offline. The consumer checks shape, the seal, complete internal
schema references, declarations and examples, and exact dependency identities.
Missing, cyclic, duplicate, or altered dependencies fail. No registry module,
callback, renderer, or network request is used. The interactive envelope remains
the block shape stored in the article. It does not replace this export.

### 5.3 Interactive semantic model

Normative detail is [meaning](docs/standards/meaning.md) and
[bounded composition](docs/standards/composition.md). A semantic declaration is
JSON that another parser can inspect without executing the plugin.

- Entities have stable ids. Kinds include input, output, action, and state.
- A binding is an RFC 6901 JSON Pointer into normalized `block.data`, or the
  entity explicitly identifies implementation-bound behavior and its limitation.
- A state's `reset` names an action. Presets and ports belong to the composition
  profile. They are not a second copy of `payload`.
- `validateSemantics` checks structure, ids, references, and bindings. It does
  not execute the plugin and it does not fetch contracts.
- A canvas, solver, or arbitrary plugin stays implementation-bound unless a
  sealed contract actually declares its operations. A generic consumer must not
  claim equivalent rendering or simulation from the envelope alone.

[Projections](docs/standards/projections.md) export that declared meaning as
linked or standalone JSON and as authored reading Markdown. Rendering does not
produce that export.

## 6. Versioning, migrations and explicit upgrades

Document and block schema versions describe data shapes, not edit counters or
framework component releases.

Optional fields added during beta, including publication `direction`, heading
`role`, table `headerRows`, and bibliography entries, stay on schema version 1.
A document that omits them remains valid for a current parser. An older strict
parser that rejects unknown properties will reject a document that includes
them. That is not backward compatibility. New content receives a new contract
digest. It does not receive a new version integer.

Block preparation proceeds as:

```text
stored payload -> ordered migrations -> merge defaults -> schema.parse -> normalize
```

Normalization follows parsing and is trusted definition code; it must preserve
its declared data contract. The core does not perform a second schema pass after
normalization. Callbacks are host code, not sandboxed execution.

Each block migration is `{ from, migrate(data) }` and advances exactly one version.
Its input is cloned. Missing or throwing steps report `migration-failed`; malformed
current payloads report `invalid-block-data`. Known block versions newer than the
definition are rejected. Unavailable definitions can be preserved under unknown
block policy, but their payloads cannot be validated or migrated.

`PrepareOptions.documentMigrations` is a separate ordered envelope extension point.
Each step receives an isolated document and must produce a complete valid envelope
at exactly `from + 1`, before block preparation. Missing, duplicate, throwing or
invalid steps report `document-migration-failed`. The supported envelope remains
v1: this hook does not invent a historical v0 format or permit arbitrary future
envelopes.

Rendering, Vite imports and in-memory preparation never rewrite stored source.
Only the explicit upgrade operation in §7.5 writes when authorized. Plugin
migration/normalization callbacks remain responsible for their own semantics.

## 7. Preparation and trusted validation

The required option is a registry:

```ts
import { assertPrepared, createRegistry, prepare } from "@publisle/core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";

const registry = createRegistry([
  ...coreBlockDefinitions,
  interactiveSchematicDefinition,
]);
const prepared = assertPrepared(prepare(article, { registry }));
```

`PrepareOptions` also accepts `unknownBlocks`, `profiles`, `diagnosticPolicy`,
`documentMigrations`, `sourceMap`, `resourceResolver`, and `preparationVersion`.
There is no `resources` option.

```ts
interface PrepareResult {
  readonly document?: PreparedDocument;
  readonly diagnostics: readonly Diagnostic[];
}

interface PreparedDocument {
  readonly kind: "publisle:prepared-document";
  readonly schemaVersion: number;
  readonly metadata?: PublicationMetadata;
  readonly blocks: readonly PreparedBlock[];
  readonly resources: ResourcePlan;
  readonly references: ReferencePlan;
  readonly islands: readonly IslandPlan[];
  readonly cacheIdentity: string;
  readonly sourceMap?: DocumentSourceMap;
}
```

Preparation migrates and validates, checks duplicate IDs/reference labels and
cross-reference targets, plans resources/artifacts and islands, and runs optional
profiles on normalized semantic data. Any error prevents a prepared document;
warnings and informational diagnostics may accompany successful output.

Unknown block policy defaults to `preserve`: retain ID/type/version/data with an
`unknown-block-type` warning. `error` fails preparation. Preservation does not
supply missing plugin behavior or validate unknown payload semantics.

### 7.1 Validation boundary

JSON input uses public parsing before preparation; Markdown uses public import
before preparation. Trusted boundaries include builds, server loads, editor
imports and CLI validation. Reader output consumes already prepared/compiled data
and does not repeat schema traversal.

`PreparedDocument` has a discriminant and typed prepared blocks, not a cryptographic
trust seal. The host must not treat an arbitrary object with the same discriminator
as validated untrusted input. Browser authoring can explicitly include tooling;
ordinary readers must not.

### 7.2 Cache identity and ownership

`cacheIdentity` incorporates document content, registry identity, resource/artifact
plans, resolver version, internal preparation contract version, host preparation
version, unknown policy, profile names/versions, diagnostic policy and source map.

`createRegistry(definitions, { preparationVersion })` hashes sorted type/version
pairs plus the explicit behavior version. Its behavior version defaults to
`"1"`. Bump it for changes to parsing, defaults, migrations, normalization,
resource extraction or island classification not expressed by schema versions.
The separate prepare-level `preparationVersion` versions other host configuration,
including envelope migrations. Profile behavior versions must also be maintained.

Function source is not hashed. Source location/file identity partitions caches.
The host owns cache storage, lookup, invalidation, resource revision refresh and
watching; core supplies an identity, not a persistent cache or filesystem watcher.

`compileCorpus` is an optional in-memory helper for a host that wants to reuse
unchanged prepared output, compiled publication output, and shared contract or
resource bytes inside one process. It does not watch the filesystem. Production
readers must not import it. Measurements that compare uncached preparation stay
uncached.

Unchanged means the document fingerprint matches and every recorded dependency
still verifies. The fingerprint hashes schema version, metadata, extensions,
dependencies, and each block's id, type, schema version, data, and readable
association. It also hashes sorted contract and resource ids, `registry.version`,
`compilerIdentity`, and preparation options: unknown-block policy,
`preparationVersion`, profile name and version, `diagnosticPolicy`, resolver
version and base, contract pins, source map, and migration `from` versions. A hit returns the stored prepared document and
publication and does not call `prepare`. Editing one block rebuilds that
document only. A changed shared contract or resource invalidates the documents
that list it. A conflicting shared body is rejected as `tampered-cache`. Function
source is not hashed, so the host must change `compilerIdentity` or
`preparationVersion` when a renderer or migration function changes.
[Corpus cache tests](packages/core/tests/compilation.test.ts) are the acceptance
case: one edited document is rebuilt, unrelated prepared and compiled outputs
are reused, and a changed shared dependency invalidates only its dependents.

### 7.3 Development and production paths

Tooling can prepare at build/server/editor boundaries. There is no universal
production API that silently accepts an unprepared document or an arbitrary
`renderPublisle(prepared)` function. Generated targets and publication compilation
consume prepared plans; runtime convenience components consume render plans (§8.4).

### 7.4 Structural validity versus optional profiles

Structural problems cannot be downgraded through profile policy.
`PublicationProfile.inspect(document)` receives an independent, deeply frozen
normalized snapshot. Findings carry `profile` provenance; invalid policies and
inspector failures are errors. Policy maps **diagnostic codes**, not camelCase names:

```ts
import { accessibilityProfile } from "@publisle/profiles";

prepare(article, {
  registry,
  profiles: [accessibilityProfile()],
  diagnosticPolicy: {
    "irregular-heading-hierarchy": "warning",
    "missing-alternative-text": "error",
  },
});
```

Core profiles are optional checks from `@publisle/profiles`: accessibility,
interactive-publication, print and localization. Print and accessibility findings
are warnings by default. Localization's `host-direction-policy` finding is
`info` by default. A diagnostic policy can map profile codes to `info`, `warning`
or `error`; an error prevents a prepared document. Profiles do not choose layout,
pages or a citation style. Research-paper and scholarly inspection belong to
[Part II](#research-preparation-profiles), with the same isolation/policy contract.

`accessibilityProfile()` (version 2) checks the automatable presence subset:
document language, heading level jumps, figure alt, table captions, and link
accessible names, each mapped to a WCAG 2.2 success criterion in the developer
guide. Diagram alt and embed titles are structural schema requirements.
MathML/text alternatives for math are a renderer contract asserted in the
shared renderer fixtures, not a preparation check. Omitted figure alt means
undescribed; explicit `""` means
decorative. Both are structurally valid; non-string supplied alt is invalid.
The default renderer gives missing descriptions a visible notice and nonempty
placeholder alternative, without changing source. This is not a WCAG
conformance claim.

### 7.5 Optional Node validation / source upgrade CLI

`@publisle/cli` is implemented as optional source-workspace tooling for Node >=24.
It is Core: `validate`, `upgrade`, `lock`, `inspect`, `semantic`, and `reading`
need no Research package. The `export`, `bibliography`, `doctor`, and
`setup compiler` commands are Research-profile features provided by the optional
`@publisle/cli-research` plugin, which the CLI imports dynamically; without it
those commands explain how to install the plugin and exit 2. A Core-only install
carries no citeproc, template, or TeX tooling:

```sh
pnpm exec publisle validate article.md --config ./publisle.config.ts
pnpm exec publisle upgrade article.json --config ./publisle.config.ts
pnpm exec publisle upgrade article.md --output article.upgraded.md
pnpm exec publisle upgrade article.json --in-place
```

The root `pnpm cli` script is another entrypoint. Explicit trusted ESM/erasable-TS
config exports a default `CliConfig` containing optional `prepare: PrepareOptions`
and `markdown: { codecs? }`. No automatic config discovery or renderer registry
is required. Default registration includes core blocks only.

Validation never writes; unknown blocks default to errors. Upgrade defaults to
stdout preview and preserves unknown blocks with warnings. An explicit config
`unknownBlocks` overrides either default. Diagnostics go to stderr.
Exit codes are 0 for success/warnings, 1 for document errors and 2 for usage/config/I/O
errors. One input is supported; JSON/Markdown extension inference can be overridden
by `--format json|markdown`, which selects the same input and output format.

`--output` creates a new file exclusively. Only `--in-place` authorizes source
replacement; it stages beside the source, preserves ordinary permission bits,
checks for changes, and renames atomically. Symlinks and multiply hard-linked
sources are rejected for replacement. This is not a filesystem lock or backup;
ownership, timestamps and extended attributes are not preserved.

Failed migrations/profile errors prevent output. Upgrades serialize wire fields,
not prepared flags/plans. Unmodeled JSON fields are rejected rather than silently
discarded. Native fallback Markdown is reimported and compared for metadata,
ordered block types/versions/payloads; semantic loss refuses output. Regenerated
native IDs and unversioned normalization changes produce warnings.
Formatting/comments may change. There is no forced-write, lossy-standard-export,
cross-format conversion, asset fetch or browser rendering option.

`processSource(source, options)` returns diagnostics/optional output without file
I/O; `runCli` is available from `@publisle/cli/run`. Configs/hooks execute with
host authority and can themselves perform I/O; never load untrusted code.
The source CLI is not a prebuilt standalone npm distribution.

Source contracts: [preparation options](packages/core/src/types.ts),
[profiles](packages/profiles/src/index.ts), [CLI](packages/cli/src/index.ts),
[Node runner](packages/cli/src/run.ts).

## 8. Framework-native rendering and publication artifacts

`createRenderPlan(prepared, options)` maps prepared blocks to text, elements, raw
markup, native components and islands. Options include `renderers`, `rawHtml`,
`embedProviders` and synchronous `diagramRenderers`.
A plan retains metadata, source/prepared data and diagnostics for tooling.

The host registers modules, not semantic callbacks inside article data:

```ts
const renderers = {
  "demo:interactive-scene": {
    static: { module: "./SceneFallback", exportName: "default" },
    interactive: { module: "./Scene", exportName: "default" },
  },
};
```

Default and named exports are supported. Static modules must be SSR-safe.
Interactive implementations must be separated from static paths.

### 8.1 Native generated output

`publisleReact` / `publisleSvelte` configure Vite targets; the underlying
`reactTarget` / `svelteTarget` emit native React 19 / Svelte 5 modules.
The shared Vite plugin imports Markdown with host codecs/current registry versions,
prepares it with source maps, and lowers the result. Preparation is build-time,
not reader-time.

Referenced static components are imported directly and rendered through framework
SSR/build output, including static island fallbacks. Repeated modules share one
import while retaining per-instance props. Missing modules/exports fail builds.

Static-only generated output contains zero Publisle runtime/schema/Markdown/editor
modules and performs no client document traversal. Framework code required by the
host shell is separate accounting. Code blocks render escaped pre/code with
language classes; built-in syntax highlighting is not promised.

### 8.2 Interactive islands

Portable intents are `load`, `visible`, `idle`, and `interaction`.
Visible/idle scheduling can fall back when browser APIs are unavailable.
Implementations load only for referenced islands; native props/loaders remain
stable across host rerenders. Repeated instances share loading but not state.

Controllers coalesce overlapping activation, track successful mounting even when
no handle is returned, cancel schedules on destruction, prevent mounting after
destruction, and clean up idempotently through framework-native lifecycle APIs.
Load/export/mount failures retain readable static fallback.

React uses native React mounting; Svelte mounts a fresh leaf with `mount()` and
cleans it with `unmount()`, rather than hydrating the island against fallback
markup. No SvelteKit `$app/*` imports are needed in the island runtime.
Host service/context objects remain host-owned, not serialized document fields.

### 8.3 Publication artifact path

`compilePublication(preparedOrPlan)` produces a serializable HTML-fragment artifact:

```text
format: "publisle:publication"
formatVersion: 1
identity, rendererBuild, html
styles[], modules[], islands[]
metadata?, diagnostics[]
```

Artifacts are output, not the canonical article. `instantiatePublication`
namespaces placement IDs; `attachPublication` and framework `PublisleArticle`
components attach explicitly supplied implementations/services and dispose them
on cleanup. The host resolves asset IDs and styles; these APIs do not rewrite head
metadata or take over routing. Minimal document/math stylesheet references can be
disabled through `styles: "none"`.

The Vite `publislePublication` target exports `publication`, `metadata` and
`diagnostics` from imported Markdown. Native module generation and publication
artifacts are distinct paths: an artifact serializer is not native SSR for a
registered framework static component. Use native output when that component must
render on the server; authored fallback markup remains available to artifact users.
Native modules and publication artifacts are different delivery paths. They are
not different island input contracts. Both receive one `IslandInput` from
[delivery](docs/standards/delivery.md), built by
[createIslandInput](packages/schema/src/island-input.ts):

```ts
interface IslandInput {
  inputVersion: 1;
  block: {
    id: string;
    type: string;
    schemaVersion: number;
    contract?: { id: string; digest: string };
  };
  activation: "load" | "visible" | "idle" | "interaction";
  payload: JsonValue;
  content?: {
    title?: readonly JsonValue[];
    description?: readonly JsonValue[];
    instructions?: readonly JsonValue[];
  };
  fallback?: readonly JsonValue[];
  accessibility?: { readonly label?: string };
  readable?: ReadableRepresentation;
  initialState?: JsonValue;
}
```

`payload` is any JSON value, including arrays, strings, numbers, booleans, and
null. Both paths preserve every allowed shape. Empty props are not a substitute
for a non-object payload. An unsupported `inputVersion` is rejected and the
authored fallback is kept. Hosts must not keep a second prop contract for the
artifact path. `readable`, when present, is the block's association: a
`sha256:` digest, authored or generated provenance, and either a JSON Pointer
`binding` or inline reading `content`. Services, executable loaders, DOM
targets, and lifecycle handles stay outside this value.

There is no separate `renderer-html` package or complete-page renderer.

### 8.4 Composable components and pure helpers

A generated native fragment or `PublisleArticle` can be surrounded by arbitrary
host components. The host may choose to render metadata separately; no required
publication header or references wrapper is provided.

Runtime `PublisleContent` accepts a **RenderPlan** through `plan` and optional
module loaders through `islands`; it does not accept `document={prepared}`.
It walks nodes on the client, and its asynchronous static module loaders are
client-mounted, not SSR static-component output. This convenience path is useful
for authoring/dynamic previews but does not establish the native static zero-runtime
guarantee.

`@publisle/core` exposes implemented pure helpers:

- `getDocumentMetadata(prepared)`: detached authored metadata or undefined.
- `getDocumentOutline(prepared)`: flat ordered top-level heading entries
  `{ blockId, level, title, label? }`, including unlabeled headings.
- `getDocumentReferences(prepared)`: detached existing reference targets, retaining
  preparation's titles and kind-specific numbering.

Results are independent views and cannot mutate prepared data/cache identity.
Outline titles flatten formatting/link children, preserve inline code/literal
LaTeX, use image alt and turn breaks into spaces. Raw HTML, citation/footnote
markers and implicit cross-reference labels are omitted. Nested flow/plugin
headings, generated anchors and inferred hierarchy are not included.
Prepared reference titles are not recomputed from outline titles.

`createHeadContribution`, `createSearchRecord`, publication wrappers and metadata/SEO
policy generators remain unimplemented/deferred. No helper mutates page head,
router, layout or global state.

Source contracts: [adapter options](packages/adapter-core/src/types.ts),
[publication artifact](packages/adapter-core/src/publication.ts),
[pure helpers](packages/core/src/document-helpers.ts).

## 9. Resources, source identities and derived artifacts

Definitions extract `ResourceReference { uri, transform?, options? }`.
Preparation separates shared source resources from transform requests:

```ts
interface ResourcePlan {
  readonly resources: readonly PlannedResource[];
  readonly artifacts?: readonly PlannedArtifact[];
}

interface PlannedResource {
  readonly uri: string;
  readonly identity: string;
  readonly version?: string;
  readonly dependencies?: readonly string[];
}

interface PlannedArtifact {
  readonly identity: string;
  readonly sourceIdentity: string;
  readonly transform: string;
  readonly options?: JsonValue;
}
```

Equivalent relative paths are lexically canonicalized; absolute roots and leading
parent traversals remain significant, and URLs are not rewritten. Canonicalization
is not filesystem security validation.

The optional synchronous host `ResourceResolver` provides a behavior `version`
and `resolve({ uri })` returning `{ uri?, version, dependencies? }`, or undefined
for missing resources. Resolution is reused per normalized URI during preparation.
Without a resolver, references are unchecked: existence/content is not verified.

Source identity includes canonical URI, revision and sorted transitive dependency
identities. Artifact identity includes source identity, transform identity and
options. Transform options must be finite, acyclic JSON and require a transform.
Transform strings should carry implementation versions when behavior changes.

Missing sources, resolver/extraction failures, invalid results/options, conflicting
canonical revisions and dependency cycles produce structural diagnostics associated
with the owning block. Dependency revision changes invalidate affected artifacts.

Core performs no resource I/O, fetching, transformation, URL rewriting or asset
generation. The host refreshes revisions, implements transforms, resolves
document-relative paths, watches files and chooses delivery URLs.

## 10. Markdown interoperability

`@publisle/markdown` provides `fromMarkdown`, `toMarkdown` and `formatMarkdown`.
The reader/runtime path has no Markdown tooling imports. Vite's tooling entrypoint
does depend on Markdown; this is deliberately separate from reader execution.

### 10.1 Native content and archival forms

CommonMark/GFM content maps to native blocks/inline nodes. Math, figures, diagrams,
embeds, callouts, citations and cross-references extend that representation.

Every interactive type uses `:::interactive`: attributes retain type/version/ID/
activation and optional accessible label; content slots carry title, description,
instructions and fallback. A `publisle-payload` fenced JSON block retains complete
instance data. `payloadFormatting: "pretty" | "compact"` changes whitespace only.

Generic `:::publisle` directives preserve unavailable/unsupported blocks' ID, type,
schema version and JSON payload. External source URIs remain references; exporting
does not fetch or inline them. Unknown native directives without a codec are
retained as raw source rather than guessed as plugin data.

There is no separate LLM-summary export mode. Payload data and separately maintained
plugin contracts describe structure; arbitrary renderer behavior is not inferred.

### 10.2 Current-version resolution

Authored native extensions can omit schemaVersion. Resolution checks the host
`resolveSchemaVersion(type)`, then codec version, then built-in definition version.
Unknown interactive types retain data at version 1 with
`unresolved-markdown-version`; explicitly record a version when needed.
Explicit versions bypass lookup, and import does not run migration/validation.

Generic archival forms bypass current-version resolution and native codecs;
legacy omitted archival versions default to 1. Unavailable plugin data can be
preserved even when newer than the current host understands.

### 10.3 Native block codecs

`MarkdownBlockCodec` declares a namespaced type, unique native container directive,
current schemaVersion, synchronous `decode` and `encode`.
Registration is accepted by import/export/format, the CLI and Vite
`markdownCodecs`. Vite and playground imports use the host registry for versions.

The supported extension point is **top-level container directives**, not arbitrary
lexer/parser extensions or inline codecs. Built-in directive names/types are
reserved. Decoders receive a cloned AST and version/source location, return
JSON-compatible data, and do not validate/migrate payloads. Encoders receive an
isolated block and export options. Native encoding uses the registered directive;
export records the actual source version.

Decode/registration failures are errors. Encoder opt-outs/failures under non-strict
policies preserve the block through a generic directive with diagnostics.
Codecs are trusted host tooling, not renderer dependencies or article fields.

### 10.4 Export policies and preservation

| Policy             | Current behavior                                                              |
| ------------------ | ----------------------------------------------------------------------------- |
| fallback (default) | Prefer native mappings; preserve unsupported blocks generically with warnings |
| warn               | Same preservation behavior; warnings never silently drop unsupported blocks   |
| strict             | Unsupported mappings/codec failures produce errors and no Markdown            |
| standard           | Downgrade extensions to standard Markdown with semantic-loss warnings         |

Standard export is explicitly lossy, not a canonical archival representation.
A standard codec can emit ordinary Markdown; native codecs emit their directive.

Supported round-trips target semantic equivalence, not byte-identical formatting.
Native Markdown can regenerate IDs; stable labels retain cross-reference intent.
Generic archival forms preserve IDs/versions/payloads. Canonical formatting is
deterministic/idempotent for supported formats; a host codec must meet that contract.
The upgrade CLI separately checks round-trip preservation before producing output.

Source contracts: [Markdown API](packages/markdown/src/types.ts),
[tested native codec](packages/markdown/tests/fixtures/notice-codec.ts).

## 11. Extensions, diagrams and external services

Plugins can provide separate portable definitions, Markdown codecs, React/Svelte
implementations, resource transforms and editor metadata. Install/import only
needed pieces; no framework renderer belongs inside schema/core.

Diagram blocks retain editable engine/source, required alternative text, optional
label/caption, authored fallback and print resource. Engines include Mermaid,
Graphviz, WaveDrom, PlantUML and namespaced host engine IDs. This is a shared
**block/result contract**, not a universal diagram language or source translator.

`diagramRenderers[engine]` synchronously returns static RenderNodes and optional
accessible text, print nodes and an interactive implementation. Missing/failing
engines produce diagnostics and source/text/fallback output. Core does not bundle,
execute or fetch diagram engines.

The example playgrounds supply optimized Mermaid integration: generated themed SVG
assets for bundled diagrams, cached/session previews, lazy runtime loading for
uncached work, isolated frame rendering, bounded source/edge limits, strict
configuration and Dagre layout. ELK requests are rejected in this optimized preview.
The host controls theme/config/cache versions. Other example diagram engines use
authored fallbacks unless the host supplies an implementation.

The user-owned `examples/scene-demo` defines and renders `demo:interactive-scene`
using Three.js. Its payload describes camera, lights, objects/materials and
controls. Three.js belongs only to that demo; it is not a Publisle dependency.
The schematic example has Clock/Reset controls and a source reference, not a netlist
parser or electrical/Fourier simulator.

Code execution, containers, queues, backend protocols and security isolation belong
to external plugins/services. Descriptor capabilities are declarations, not
automatic enforcement.

## 12. Editors, themes and trust

React/Svelte playgrounds are implemented example authoring applications operating
on semantic documents through public APIs, with live preview, payload editing,
Markdown/JSON import/export and a Fourier feature article. They are not a released
headless editor framework or official separate editor product.

Publication CSS is host-controlled. Load document and KaTeX styles when needed;
editor chrome is not document semantics. Math is rendered with KaTeX at the
server/build boundary, including color commands. This is supported KaTeX syntax,
not a full TeX interpreter or document/package execution environment.

Embeds use provider/resource IDs, title and aspect ratio, not arbitrary authored
iframe URLs. YouTube/Vimeo providers are built in; hosts can add restricted
providers. Fallback content is used when unavailable. The host owns external
network/privacy policy.

Raw HTML is retained as semantic source. Top-level adapter policy defaults to
escaping and supports omit/trusted or a host sanitizer callback. “Trusted” does
not sanitize. URL safety checks remove unsafe URLs with diagnostics. Host
renderer/codec/resolver callbacks and arbitrary remote content require their own
trust boundaries; Publisle is not a universal content sandbox.

## 13. Diagnostics and source locations

```ts
interface Diagnostic {
  readonly level: "info" | "warning" | "error";
  readonly code: string;
  readonly message: string;
  readonly blockId?: BlockId;
  readonly sourceLocation?: SourceLocation;
  readonly profile?: string;
}

interface SourceLocation {
  readonly source?: string;
  readonly line: number;
  readonly column: number;
  readonly offset?: number;
}
```

Markdown's optional `sourceMap` sidecar maps stable block IDs and document start
to original source locations. Lines/columns are one-based; offsets are zero-based
character offsets. Interactive-fence normalization preserves original coordinates.
Preparation, renderer diagnostics and Vite build errors retain locations; explicit
diagnostic locations take precedence. Newly created IDs may use document fallback.

Source maps are not article wire fields; code-authored documents need not provide
them. Structural diagnostics, profile findings and render/export warnings remain
distinct. Preservation does not guarantee that unavailable plugins can render.

References plan labeled headings/figures/tables/equations/diagrams, including
kind-specific ordinals for non-heading targets. Cross-reference verification is
implemented. Citation identifiers and bibliography source remain portable data.
Formatting and resolving them belong to the optional
[Research profile](#citation-resolution-and-acquisition); Core does not require a
citation processor or remote records.

## 14. Package and distribution boundaries

```text
packages/
  schema          portable data and prepared-plan contracts
  core            registry, preparation, profiles, resources, helpers, optional corpus reuse
  block-sdk       portable definition and interactive envelope helpers
  profiles        Core inspection profiles: accessibility, interactive-publication, print, localization
  markdown        import, export, formatting, native codecs, and an initial MyST loss mapping
  adapter-core    render plans, publication artifacts, Vite, island controller
  adapter-react   React native target and runtime/artifact components
  adapter-svelte  Svelte native target and runtime/artifact components
  adapter-next    server component/local loader and optional client attachment
  adapter-astro   content loader, integration, article component and attachment
  adapter-vue     native Vue emitter, SSR/Vite and shared island lifecycle
  cli             optional Core Node CLI: validation / source upgrades / locks / projections; dynamic plugin discovery

blocks/
  core            static/publication block definitions
  technical       reference interactive schematic

examples/
  react
  svelte
  playground-core
  playground-react
  playground-svelte
  scene-demo
  articles
```

The [package-set manifest](packages/core-packages.json) identifies the Core and
Research sets. Core packages cannot import Research packages; ESLint enforces the
boundary. The CLI dynamically discovers its optional Research plugin and produces
install guidance if it is absent. The [Research package map](#research-package-boundaries)
is separate.

Development resolves TypeScript workspace sources. `pnpm build:packages` emits
ESM, declaration files and source maps; packed package exports and CLI entry points
use `dist/`. `pnpm test:distribution` builds/packs the 23-package publish set and
checks a clean Core consumer, dependency boundaries, CLI validation/plugin refusal
and declaration resolution. See the [release guide](docs/guides/releases.md).
Node tooling requires Node >=24; the package manager contract is pnpm 11.17+
within 11.x. Package publication is pending; the frozen v1 data contract does not
imply an npm release.

Dependency constraints are checked through ESLint and production bundle tests:
framework-free schema/core/SDK; framework-neutral adapter core; no cross-framework
renderer imports; no editor/Markdown/schema/migration tooling in generated readers;
static paths cannot import interactive implementation modules. Markdown codecs
remain tooling-only even when types are shared through erased imports.

## 15. Implemented v1 content scope

All built-in core definitions currently use block schema version 1. The reference
schematic uses version 2 (including legacy-alt migration).

| Block type            | Native data / capabilities                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| publisle:paragraph    | Inline rich content                                                                                                                                                                      |
| publisle:heading      | Levels 1–6, optional label and section role                                                                                                                                              |
| publisle:list         | Ordered/unordered; listItem/taskListItem with nested flow                                                                                                                                |
| publisle:quote        | Nested flow                                                                                                                                                                              |
| publisle:code         | Literal source, optional language/meta                                                                                                                                                   |
| publisle:math         | Source, display intent, optional label                                                                                                                                                   |
| publisle:figure       | Image resource, optional alt/title/label, caption/credit/original                                                                                                                        |
| publisle:table        | Rich cells, alignment, optional label/caption/header row count                                                                                                                           |
| publisle:embed        | Provider/resource ID, title/aspect ratio, caption/fallback                                                                                                                               |
| publisle:diagram      | Engine/editable source, alt, label/caption/fallback/print resource                                                                                                                       |
| publisle:callout      | Variant, optional title, nested flow                                                                                                                                                     |
| publisle:divider      | Thematic break                                                                                                                                                                           |
| publisle:footnote     | Identifier and flow content                                                                                                                                                              |
| publisle:bibliography | Optional citation entries. `id` is required. `title`, `authors`, `type`, `issued`, `containerTitle`, `volume`, `issue`, `page`, `publisher`, `doi`, `url`, and opaque `raw` are optional |
| publisle:raw-html     | Preserved source and inline intent                                                                                                                                                       |

Publication metadata may carry `ltr`, `rtl`, or `auto` direction. Inline text may carry the same optional direction. Other inline nodes include emphasis, strong, strikethrough, inlineCode, link,
hardBreak, softBreak, inlineImage, inlineMath, footnoteReference, citationReference,
crossReference and rawHtml. List items are nested data, not independent top-level
registered block types. Tables have cells/rows, not standalone portable cell blocks.

Figures are publication concepts rather than bare images: labels/references,
captions, numbering, alt, credit and downloadable originals. Their renderer
provides static/print behavior. Omitted and decorative alt remain distinct.

Builders cover paragraph/heading/list/quote/code/math/figure/table/callout/divider/
embed/diagram. Footnote, bibliography, and raw-HTML definitions are registered and
can be constructed with `createBlock`; this spec does not invent builders that are
not exported.

`publisle:bibliography` stores optional entries. Opaque `raw` text is kept exactly.
The document envelope schema has no dedicated alternative for this type. The
portable schema applicator refuses more than 16 `oneOf` branches, and that limit
is an implementation bound, not the interoperability rule. Envelope validation
therefore preserves the block as an unknown type. Entry shape is checked by the
[bibliography schema](packages/contracts/schemas/bibliography.json) and the
authoring parser. Optional citation fields stay on schema version 1. See
[publishing profiles](docs/standards/publishing.md).

### Additional hosts and independent rendering

[Next.js](packages/adapter-next/src/index.ts) loads/prepares local Markdown or JSON
on the server and renders publication HTML as a server component. Its separate
`./client` attachment entry point is opt-in for islands. Static articles import
no Publisle client entry point; hosts retain routing and page metadata.
[Astro](packages/adapter-astro/src/index.ts) provides a local content loader,
integration and server-rendered article component, plus explicit runtime
attachment/disposal for host islands. [Vue](packages/adapter-vue/src/index.ts)
provides a native emitter, Vite integration, SSR components and island lifecycle
through the shared controller. Repeated placements retain independent IDs/state.

The [Python renderer](tools/python/render.py) consumes portable JSON directly,
without Node or TypeScript-produced HTML. Its declared v1 static subset covers
core prose, lists/quotes/code, figures/tables, rich text/direction, labels,
footnotes, numeric references, presentation MathML and the built-in schematic
v1→2 migration. Interactive/custom behavior uses authored or explicit readable
fallbacks; known future document/block versions are rejected. Full CSL, host
plugins and executable host migrations are outside this role.
[Shared static fixtures](packages/adapter-core/tests/python-rendering.test.ts) and
[migration/fallback/refusal fixtures](packages/adapter-core/tests/renderer-parity.test.ts)
check semantic outcomes through `pnpm test:conformance:renderer`. This is a second
implementation of the declared static subset, not full engine conformance.
The bounded optional Research citation role is recorded in Part II.

An initial MyST import and export is not a universal round trip. Preservation
and conversion loss are different outcomes. Preservation keeps the source block,
including an unsupported interactive block stored in a Publisle JSON fence.
A conversion loss records that MyST behavior was not translated: a cite role
becomes a citation id without a style or locator, and other roles or directives
remain visible text. A fence that is not strict JSON is a loss, not a guessed
block. The loss table is [the MyST mapping](docs/standards/myst.md).

The [Fourier article](examples/articles/fourier-series.md) exercises the content
catalog and inline features, colored math, labeled references and host demos.
Its illustrative schematic/scene do not simulate Fourier analysis.

Source contracts: [core definitions](blocks/core/src/definitions.ts),
[rich content types](blocks/core/src/types.ts),
[schematic](blocks/technical/src/index.ts).

## 16. Deferred work and explicit non-goals

Not implemented as platform features:

- Official editor product, headless editor framework, collaboration, CMS/auth/hosting.
- Browser/remote execution platforms, WebContainers, Pyodide and terminal blocks.
- Additional framework adapters beyond React, Svelte, Next.js, Astro and Vue.
- Dedicated Core full-page site renderer/package; the Research CLI provides an
  explicit self-contained HTML preview wrapper over publication artifacts.
- Universal diagram syntax or compile-time translator between engine languages.
- Diagram engines or Three.js bundled into portable core.
- Universal journal acceptance, journal-portal submission integration and print imposition.
- Full accessibility/scientific conformance audits.
- Automatic head/search/feed/SEO generators or mandatory publication wrappers.
- Plugin marketplace, large specialized block catalog or unrestricted page layout.
- Persistent core cache/watch infrastructure or built-in asset transformation.
  `compileCorpus` is an in-memory host helper, not that infrastructure.
- A separate LLM-summary Markdown export or inference of arbitrary renderer behavior.

Optional pure metadata/outline/reference helpers, conformance profiles, source
maps, resource resolution contracts, native Markdown codecs, CLI validation/
upgrades and the [Research operations in Part II](#part-ii--publisle-research-profile)
are **implemented**, not deferred roadmap items.

## 17. Performance contract and verification scope

### Static-only native output

No Publisle runtime, schema, migrations, Markdown/editor code, complete block
registry or document walker is present in the client bundle. Static registered
components and fallbacks are SSR/build-readable. Framework shell cost is separate.

### Referenced and repeated islands

Only referenced implementations are reachable; unrelated registration entries do
not enter the client bundle. Repeated modules share loading/imports while props
and state remain independent. Visibility/idle/interaction/load intents, native
cleanup, pending-load destruction, failure fallback and host rerenders are covered.

### Evidence, not blanket benchmark claims

The production acceptance suite uses minified SSR/client Vite fixtures with real
Chromium for both frameworks. It reports raw/gzip bundle totals and separate
framework/Publisle/host/bundler rendered-module attribution. Rendered bytes are not
an additive compressed/minified breakdown; framework shell bytes are not counted
as Publisle overhead.

Visibility/idle scheduling is controlled deterministically. These checks are
correctness and bundle-boundary tests, not proof of performance on every old
device/network. The spec sets no universal byte or time threshold. Section 18
runs this suite in the Check workflow. GitHub Actions does not fail a change
against a recorded timing or byte snapshot.
Host plugins and browser-authoring paths have their own costs.

Local benchmark scripts under `tools/benchmarks/` can compare this implementation
with another one, or with an older commit, on one machine. That comparison is
run by hand. A recorded numeric snapshot may be consulted. It is not a merge gate.

## 18. Acceptance criteria and current coverage

The implemented contract is exercised by unit/build fixtures and production
browser acceptance:

1. Typed and imported documents prepare into current normalized data.
2. Invalid payloads, known unsupported versions and failed migrations report errors
   at trusted tooling boundaries, with no incidental source writes.
3. Dependency checks enforce framework-free core/SDK and framework-neutral planning.
4. Native static client output has zero Publisle runtime/tooling and no traversal.
5. Island bundles exclude unrelated implementations; repeated instances share
   loading while preserving independent state through host rerenders.
6. Fallbacks are readable before activation and without JavaScript; failures retain
   them and native cleanup/pending destruction work.
7. Block/envelope migration contracts and original-source diagnostic sidecars are
   tested without inventing unsupported production envelope formats.
8. Canonical source identities, distinct artifacts, revision/dependency changes,
   missing resources and cycles are covered.
9. Unknown data is preserved under preservation policy and rejected under strict
   preparation policy; preservation does not claim plugin availability.
10. Supported native/generic Markdown, host codecs, version resolution, policy
    diagnostics and deterministic formatting have regression coverage.
11. Profiles inspect isolated data; policy changes conformance severity without
    downgrading structural errors.
12. Metadata/helpers/artifacts/native output coexist with unrelated host components
    without changing head, router or global application state.
13. CLI validation is read-only; previews, explicit writes, stale-source detection,
    migration failure and Markdown loss refusal are tested.

GitHub runs the Check workflow on every pull request and on every push to `main`:

```sh
pnpm check
pnpm test:conformance:renderer
pnpm test:conformance:p0
```

`pnpm check` typechecks, lints, checks formatting, runs the default unit tests,
and builds examples. The default Vitest config excludes `*.acceptance.test.ts`
and `*.integration.test.ts`. Unit tests cover preparation, migrations, Markdown
round-trip and research source generation; TeX integration uses a separate job.

`pnpm test:conformance:p0` executes the Python suite, the unit suite, and the
browser acceptance suite against the checkout that just ran, then requires
named passing titles in that fresh report. It reruns those tests. A committed
evidence file is not an input. A skipped or missing title fails the command.
The report belongs to that checkout. [tools/p0-gate.ts](tools/p0-gate.ts)
performs that run. The named groups are defined in
[conformance](docs/standards/conformance.md). The browser portion is the
automated gate for these product guarantees:

- reader bundles contain no schema, compiler, or contract tooling
- unused island implementations stay out of the bundle
- activation, disposal, failure fallback, and readable no-JavaScript output hold

`pnpm test:acceptance` runs that same browser suite by itself. Install Chromium
first. A missing browser does not silently skip those tests. Local compatible
Chromium can be selected with `PUBLISLE_BROWSER_PATH`. Check invokes the suite
through the conformance command after installing Playwright's Chromium.

```sh
pnpm exec playwright-core install --with-deps chromium
pnpm test:acceptance
```

The sibling `pnpm test:conformance:renderer` gate independently runs Python and
requires shared static, MathML, migration, fallback/refusal and bounded Research
citation evidence. Its [gate implementation](tools/renderer-gate.ts) rejects
missing/skipped results and verifies the pinned corpus generator. Core structural
and reader claims do not inherit full CSL, TeX, PDF/UA or journal acceptance.
Research-specific integration evidence is recorded in Part II.

Timing and byte snapshots under `tools/benchmarks/` are local comparisons.
They are not pull-request checks, and they are not a substitute for the bundle
and lifecycle gates above. Documentation-only edits additionally check links
and static diagram rendering. Test counts are evidence snapshots, not spec
constants.

Source evidence: [core tests](packages/core/tests),
[Markdown tests](packages/markdown/tests), [CLI tests](packages/cli/tests),
[shared adapter acceptance](packages/adapter-core/tests/adapter-acceptance.ts).

## 19. Governing principles and maintenance

1. Semantic data describes content, not framework/page ownership.
2. Preparation validates and analyzes at a trusted boundary.
3. Framework adapters translate plans into native host behavior.
4. Metadata is information; the host determines policy and presentation.
5. Structural integrity and optional conformance policy remain distinct.
6. Static generated content carries no Publisle browser runtime.
7. Interactive documents load only referenced implementations and needed runtime.
8. Markdown supports exchange without becoming the internal architecture.
9. Extensions use public contracts; callbacks/services retain host trust boundaries.
10. Rendering never rewrites source; authorized upgrade operations are separate.
11. Implemented APIs and deferred proposals must never be described interchangeably.

When changing a wire/API contract, update its source types, tests, developer guide
and this spec together. Bump relevant schema/preparation/profile/resolver/renderer
behavior versions, rather than relying on function source hashes or edit counters.
Keep examples executable against actual exported APIs and record review dates;
do not retain fictional helpers, obsolete options or unsupported guarantees.

## Part II — Publisle Research profile

**Profile version:** 1 (beta); requires Publisle Core document envelope 1.
**Normative authority:** [Publisle Research profile](docs/standards/publishing.md).

Research layers optional tooling on Core. Its profile identity does not introduce
a new document envelope, block version or publication artifact version. Exact
beta contract compatibility requires the matching pinned digests and supported
capabilities, as defined in [governance](docs/governance.md). Installing Core alone
requires none of citeproc, TeX, xmllint, Docker or the template packages.

### Research package boundaries

```text
packages/
  research        citation resolution, exports, acquisition and research profiles
  cli-research    optional export/bibliography/doctor/setup CLI plugin
  template-sdk    public article/template/source-package contracts
  template-*      article, IEEE, ACM, Elsevier and Springer starter packs
```

These packages are tooling, not reader dependencies. Plugin callbacks and template
renderers are trusted host code; portable documents do not authorize execution.

### Research preparation profiles

`researchPaperProfile({ abstractLabel? })` checks title, authors, affiliations,
an abstract heading immediately followed by a nonempty paragraph, and the
Core accessibility v2 subset using the supplied supported-content traversal.
A heading with `role: "abstract"` identifies the abstract; by default “Abstract”
text or label `abstract` also identifies it. An explicit `abstractLabel` selects
a label. Metadata description is not inferred as an abstract. This is not a
scientific-quality audit or arbitrary custom-block inspection. The research-paper and
scholarly profiles ship with `@publisle/research` as part of the Research
profile; the accessibility, interactive-publication, print, and localization
profiles remain Core.

The scholarly profile reports duplicate and unresolved bibliography identifiers.
These checks do not select a citation style or guarantee scientific quality.
The research-paper profile composes Core accessibility v2 and adds scholarly
metadata/abstract checks. Core accessibility remains independently usable.

### Citation resolution and acquisition

`@publisle/research` resolves citations with pinned citeproc-js, bundled versioned
CSL locale resources, and history-aware updates to earlier citations. Built-in
styles are numeric and author-date; host CSL XML and complete CSL-JSON items,
structured names, custom locales and note indices are accepted. Ibid, subsequent
forms, locale terms, sorting and disambiguation are handled by the processor.
Opaque references remain literal with diagnostics; raw BibTeX is normalized when
possible. DOI and HTTPS bibliography import are explicit Node operations with
cached provenance and refresh. Exports stay offline and never alter source.

### Templates, PDF and submission packages

The public [template SDK](packages/template-sdk/src/index.ts) exposes projected
article types, pure rendering/validation callbacks, supported engines/languages/
directions, bibliography policy, required metadata, source files, binary resources
and local asset references. These callbacks are trusted host code, not portable
wire contracts. `createSubmissionPackage` accepts a template object or registry;
`createLatexPackage` is its compatibility name. Research orchestration contains
no publisher-specific rendering rules.

Separate packs supply generic Unicode and Arabic-first article profiles, IEEEtran
journal, ACM manuscript review, Elsevier numeric/author-date review, and Springer
sn-jnl math/physics numeric. The CLI registers these profiles and accepts host
registries through trusted `--config`, with JSON `--template-data`. ACM requires
country data for affiliations. Springer retains original publisher class/style
bytes and LPPL notices; other publisher requirements come from TeX. Starter
profiles do not imply acceptance by every journal.

The Research CLI also supports `export --to html` as a zero-TeX preview, using a
self-contained wrapper with publication styles. The host still owns a production
site and browser print is a draft path.

PDF export defaults to generic LuaLaTeX. Standard article templates request
PDF/UA-2 tagging; publisher paths emit `pdf-ua-unavailable`. A requested standard
and successful compilation do not prove PDF/UA conformance; the
[accessibility guide](docs/guides/accessibility.md) defines validation evidence.
The old synchronous Helvetica `toPdf`
function is deprecated and rejects unsupported characters unless lossy output is
explicitly enabled. There is no fallback to it when a compiler is missing.
`exportPdf` is the Unicode-safe asynchronous Node API. IEEE retains its explicit
CLI id and pdfLaTeX default. LuaLaTeX supports mixed Arabic/Han/math with shaping
fonts; `article-arabic` sets the main language and page flow to Arabic. Missing
glyphs and unresolved references fail; overflow is diagnosed. Tables, figure
captions, equations, labels, authored notes and cross-references survive package
rendering. PDF/source generation does not execute interactive content.

The compiler accepts `auto`, `native`, or `container`. Auto probes native
requirements/fonts, then an already installed digest-pinned container; no export
downloads a toolchain. `publisle doctor` reports dependencies and
`publisle setup compiler` explicitly installs the compiler; the
[compiler recipe](packages/research/compiler/README.md) records the frozen Ubuntu
base and upstream TeX Live snapshot. Registry availability and platform evidence
must be checked separately from the recipe.
Container builds have no runtime network, a read-only root, and only collected
work mounted. Manifests record backend, template version, requirements, image ID
or native engine/font versions. Native compilation still needs the documented
TeX/fonts. Time/output limits terminate processes; container cleanup also removes
timed-out builds.

Submission outputs claim a new directory, or `--archive` creates a new ZIP.
LaTeX packages contain source, bibliography, local assets, PDF, instructions and
logs. JATS article/assets packages use `--to jats-submission`, validate offline
against the bundled Archiving 1.3 DTD, and retain nested sections, safe IDs and
references. `toJats` remains the single XML API. No portal upload is performed.

See [export and migration guide](docs/guides/journal-export.md),
[template orchestration](packages/research/src/package.ts),
[Node compiler](packages/research/src/node.ts), and
[publisher integration checks](packages/research/tests/templates.integration.test.ts).

### Independent Research citation role

The optional `resolvePortableCitations` API and independent Python formatter
implement the corpus-bounded capability record in
[the citation subset](packages/contracts/citation-subset.json). Numeric and
author-date, `en-US`/`fr-FR`, supported ordering/locators and restricted names are
compared against pinned citeproc-js expectations. Unsupported features reject
with `unsupported-citation-feature`; full CSL equivalence is not claimed.
The [renderer gate](docs/standards/conformance.md#independent-renderer-gate)
records the exact role and evidence separately from the broader TypeScript API.

### Research validation evidence

The separate [Research export workflow](.github/workflows/research.yml) runs on
pull requests and pushes to `main`. It installs TeX/font and Poppler dependencies,
runs `pnpm test:research` using [the research config](vitest.research.config.ts),
and retains generated PDFs, sources, logs and page previews as CI artifacts.

The local journal integration suite exercises the real CLI, verifies US Letter
pages and embedded fonts without Type 3 fonts in the English fixture, checks
Arabic/Chinese/math rendering and references, and rebuilds both source packages
in fresh directories. It also covers existing-output refusal, missing assets,
tools and fonts, missing glyphs, unsafe package paths, incompatible citation
styles and compilation timeout (including an intentionally looping TeX document).
The [English manuscript](examples/articles/ieee-journal.md) is an illustrative
research fixture; the [multilingual companion](examples/articles/ieee-unicode.md)
is a rendering fixture. Successful local compilation is not journal acceptance.

```sh
pnpm test:research
```

Set `PUBLISLE_RESEARCH_ARTIFACTS` to retain local PDFs, source packages, logs and
page previews in a fresh subdirectory for each run. TeX integration is separate
from browser/bundle conformance and does not extend the TEST-01–10 claims.

The [PDF/UA fixture gate](packages/research/tests/pdf-ua.integration.test.ts)
has local passing evidence for English UA-2, the
[authored Arabic article](examples/articles/article-arabic.md) UA-2 and English
UA-1, including tagged structure, language, column-scoped table headers, figures
and attached MathML. Arabic UA-1 is not claimed. The [Research evidence record](docs/standards/conformance.md#research-artifact-evidence)
states the checked scope separately from hosted CI. The gate
uses a [pinned veraPDF installer](tools/install-verapdf.py) and strict
[report checker](tools/validate_pdf_ua.py). A passing conformance claim requires
an actual passing report for the generated artifact; source tagging declarations
and a configured CI job alone are insufficient. See the
[accessibility guide](docs/guides/accessibility.md) for scope and manual review.

Source evidence: [research source tests](packages/research/tests/package.test.ts),
[local journal integration](packages/research/tests/latex.integration.test.ts),
[publisher integrations](packages/research/tests/templates.integration.test.ts),
[tagged source guards](packages/research/tests/pdf-accessibility.test.ts).

## Appendix A — Host compile-on-write integration (non-normative)

A host can prepare and compile when content is saved, store an artifact, and deliver
it without recompiling on each request:

```text
author saves -> parse/import -> prepare -> compilePublication -> store artifact
reader request -> fetch artifact -> instantiate placement -> host renders page
referenced islands -> host supplies implementations -> activate -> dispose
```

This is a host policy, not built-in storage or a mandatory deployment architecture.
The artifact identity/output format is distinct from the canonical source document
and prepared cache identity. Hosts must invalidate/rebuild artifacts when renderer,
resource or configuration behavior changes.

Svelte islands mount fresh rather than hydrating against their fallback. A host
can disable its page's client rendering for static content when the framework
permits, but Publisle does not set that policy. Server-only boundaries must exclude
schema/Markdown/compiler code from reader bundles. Storing arbitrary HTML also
requires a host trust boundary; core validation alone is not HTML sanitization.
