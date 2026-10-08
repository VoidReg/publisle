# Bounded state and composition (beta)

`SemanticDeclaration.composition` is optional. Its profile is
`urn:publisle:composition:beta`; existing package, document, block, artifact and ABI
versions do not change. Changed declarations receive a new sealed contract digest.
The closed wire shape is published in `contracts/schemas/semantics.json`.
`parseComposition` and `validateSemantics` validate declarations during preparation.
Unsupported profiles/operations fail explicitly; archival source remains intact.

## State and compatible snapshots

Fields reference stable semantic input/state/output IDs and the same fixed JSON
Pointer as their entity. Only finite numbers, safe integers, bounded strings and
booleans are supported in this initial profile. Numeric bounds and finite enums
are optional; strings are limited to 4096 Unicode scalar values, matching JSON
Schema length semantics. Invalid Unicode is rejected. Objects, datasets,
ephemeral requests, pointer positions and service handles are not writable state.
Hosts can keep those independently without putting them in canonical source.

- Authored configuration stays untouched. Compiled sessions retain a frozen
  scalar baseline; no full payload or schema is copied into the reader.
- Named authored presets contain bounded, validated writable field values.
  Selection applies the preset's partial patch atomically; unlisted fields retain
  their current values. Presets are compiled constants, never reader-editable.
- Each placement creates independent session state. `reset()` restores all
  fields to the authored baseline, not the most recently selected preset.
- `shareable: true` is permitted only on writable fields. Other session fields
  are transient and never exported. They reset to authored values on restore.
- `snapshot()` emits `profile: "urn:publisle:snapshot:beta"`, `documentDigest`,
  `contractDigest`, `blockId` and exactly the shareable `state` fields. Export and
  restore reject snapshots exceeding 16 KiB of UTF-8 JSON. Restore rejects stale
  identities, missing/extra fields, wrong types, bounds and accessors before any
  mutation. No automatic migration, fallback revision or silent truncation.

Snapshot transport is a host responsibility: URL encoding, storage, authentication,
strict duplicate-key/Unicode JSON parsing and optional compression are not owned by
the document. The generated object API expects plain JSON data, not hostile Proxy
objects or services. It does not ship the general JSON/schema parser to readers.
Snapshot profiles identify compatibility without introducing a beta version counter.
`createSnapshotSchema(validatedProfile, target)` in `@publisle/contracts` exports a
closed Draft 2020-12 schema with those exact revision constants and shareable field
constraints for independent backend validators. `validateSnapshot(value, schema)`
adds the 16 KiB policy check at the offline tooling boundary; it is not reader code.

## Meaning versus execution

Abstractions are parameter-control, plot, series, table, state-diagram,
image-annotation, scene-entity and narrative-action. They reference entities with
compatible kinds. Relations have IDs and typed endpoints: dependency, containment,
series-axis, action-state and narrative-preset. Dependencies **do not compute**
anything. Hosts may implement equivalent accessible views, not identical pixels.

Allowlisted operations have stable action IDs:

| Operation    | Deterministic behavior                                                        |
| ------------ | ----------------------------------------------------------------------------- |
| assign       | Validate a host-provided scalar, then replace one writable field              |
| preset       | Apply one validated named partial patch                                       |
| transition   | Require the exact `from` value, then write `to`; both belong to a finite enum |
| view binding | Return a fresh frozen map of declared view IDs to current field values        |

There is no expression language, arithmetic, shader execution, graph evaluation,
callback source or scientific simulation. Invalid actions do not mutate state.
Observations associate preset/output IDs with authored explanation. Optional
assertions declare typed expected values, nonnegative tolerance and producer/evidence
provenance. Semantic export retains them as **not executed**, not verified results.
Scientific verification requires separate evidence and implementation.

## Compile once, bind per placement

`compileComposition` is exported by `@publisle/adapter-core` (build-time entry,
**not** `/publication-runtime`). Supply verified, host-approved instances containing
`blockId`, contract body `contractDigest`, normalized data and semantic declarations,
plus the digest of the exact canonical document and declared port connections.
The compiler checks structure/behavior but does not resolve or authenticate contracts;
use the pinned preparation/resolution workflow first. It returns a direct ES module
exporting `createPlacement()`. Bundle it as an approved host module alongside actual
island implementations. Native/artifact hosts can provide the placement handle as
an out-of-band service; no source import string authorizes execution.

The module includes only referenced state checks, action handlers, views and direct
port assignments. It contains no profile, relationship graph, schema evaluator,
registry, Ajv, compiler or source AST. Merely importing the build-time API into a
reader is unsupported. No Three.js or diagram engine is added to Publisle.

Each placement exposes `session(blockId)`, `observe(blockId, hostListener)`,
`batch(commands)` and idempotent `dispose()`. Observers receive frozen view values
and an AbortSignal; they are approved host functions, never canonical callbacks.
Use `batch` for connected changes. Direct session actions/restore are local;
submit an assignment batch after restore when connected propagation is desired.

## Ports, ordering and failure rules

Ports have stable IDs, input/output direction and a field whose declared scalar
type defines the port type. Inputs require writable fields. Connections name exact
block/port IDs. An input with `presetSelection: true` requires a finite string enum
of declared preset IDs; it applies the receiving block's validated preset and then
writes the selector field. This exchanges named presets without callbacks or routing.
Missing references, duplicate edges, mismatched types and **all
cycles**, including self-links, are rejected. Bounds/enums are checked by receiving
handlers: an incompatible value isolates that edge rather than corrupting state.

Commands are captured when submitted and executed in submission order. Within a
batch, invalid commands are reported and valid commands continue. Propagation runs
once after the commands, using final source values. Blocks are topologically
ordered with UTF-16 lexical ID tie-breaking; outgoing edges use JCS lexical order.
Multiple writes to one input are last-writer-wins in that explicit order. Each
successful receiving block propagates downstream. Failed edges do not prevent
other edges. There is no implicit global mutable state.

Changed host views are notified in that same block order after propagation. Throws
and rejected promises become returned errors; they do not poison subsequent batches.
An observer times out after one second. Disposal aborts pending observation waits,
rejects queued work, clears listeners and invalidates session access. Host code must
honor cancellation for its own effects; arbitrary functions cannot be forcibly
terminated or sandboxed. Observer timeouts do not roll back already committed state.
Do not await a nested batch from an observer: the queue is serialized.

Limits: 64 KiB per profile, 128 entries per collection, 128 blocks, 256 connections,
128 commands per batch, and 128-character IDs. Each operation is a bounded direct
assignment or patch. Hosts separately impose input/request budgets and approve code.

## Executable evidence

`contracts/fixtures/composition.json` provides a shared positive declaration;
negative unit fixtures cover malformed profiles, IDs, bindings, types, presets,
relationships, stale/oversized snapshots and unsupported cycles. Sealed-contract
tests verify provenance and tamper rejection. Reader tests exercise actual production
bundling and Chromium: two related islands, presets/reset/snapshots, asynchronous
failure isolation, repeated placements and useful no-JavaScript authored fallback.

`tools/composition/demo.ts` is the host-owned accessible reference demo builder.
Its isolated production module inventory contains only the generated host entry;
the fixture budget is under 5 KiB gzip. This is a bounded fixture budget, not a
universal performance or visual/scientific equivalence claim.
