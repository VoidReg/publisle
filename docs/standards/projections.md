# Semantic exports and renderer-free inspection

Canonical JSON and archival Markdown remain authoritative and lossless. The
following are distinct, build/save-time projections, not replacement formats:

| Export                   | Interface                                              | Meaning                                                                                                       |
| ------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Archival                 | Existing canonical JSON / `toArchivalMarkdown`         | Full supported source, IDs, versions, pins and opaque data                                                    |
| Linked semantic JSON     | `exportSemanticDocument(source, {mode: "linked"})`     | Actual bound instance values, declarations, explanation, immutable pins and unresolved dependencies           |
| Standalone semantic JSON | `exportSemanticDocument(source, {mode: "standalone"})` | Identical meaning, plus the deduplicated verified contract closure needed for inspection                      |
| Reading Markdown         | `toReadingMarkdown(document)`                          | Narrative/authored explanation plus source and declared contract links; structured details explicitly omitted |
| Generic inspection       | `inspectDocument(source, options)`                     | Seven question-oriented views of the same semantic extraction                                                 |

The JSON APIs live in `@publisle/contracts`; reading Markdown lives in
`@publisle/markdown`. The CLI exposes:

```sh
publisle semantic source.json --bundle contracts.json --mode standalone
publisle inspect source.json --bundle contracts.json
publisle reading source.json
```

These commands accept canonical JSON, not executable host configuration, and write
only to stdout. They never normalize/migrate source or load a registry, renderer
or scientific simulation. The existing archival/locking commands stay separate.
Library callers may reuse the verified resolver cache across articles; default
resolution is offline. An explicitly supplied approved remote resolver policy
can retrieve contract JSON only, never datasets or executable implementations.

Each projected entity includes its source block ID, source digest, instance JSON
Pointer, immutable contract pin, declaration pointer and actual bound value when
available. Missing/invalid bindings remain diagnostics, not inferred meaning.
Standalone mode includes only used contract closures, not the complete registry,
remote datasets or executable code. Linked and standalone block semantics are
identical; contract delivery is their only difference. Unresolved closures are
listed explicitly. Integrity failures throw instead of being hidden as missing
dependencies. Duplicate block IDs are rejected.

Cloned bound values/explanation have a 2 MiB aggregate projection budget to avoid
amplifying one large payload across thousands of bindings. Exceeding it is an
explicit error, not silent truncation or invented substitute meaning.

The inspector exposes what an element represents, which inputs/actions can
change, their declared effects/relations, observed outputs/views, declared states
and authored preset values, assumptions/explanation and implementation-bound
behavior. It follows declarations and actual JSON bindings; dependency edges do
not establish a computation. Unfamiliar wave/Fourier fixture tests require no
plugin implementation or visual renderer.

Authored explanation is marked authored. Declared rules are identified as derived
declarations, not executed calculations. A `calculated-result` entity is **not**
proof of a verified result: verification remains `not-established`. Generated
explanation retains generator/version/source provenance and is unverified rather
than being promoted to authored facts or deterministic computation. Stale readable
source associations are diagnosed and not presented as current explanation.

Reading Markdown uses ordinary CommonMark/GFM serialization, preserving actual
bold/emphasis and escaping untrusted labels. It does not embed JSON payloads or
interpret a canvas/3D scene black box. Unknown content receives available authored
portable prose or an explicit interpretation-unavailable notice. Each block links
to `urn:publisle:source:sha256:<digest>#/blocks/<index>` and, when declared, its exact
immutable contract ID. These are identity references, not promises that a website
implements a fetch endpoint. Hosts may expose corresponding approved JSON through
their own API. Reading output explicitly says it is not an archival round trip.

The optional [bounded-composition layer](composition.md) implements scalar state,
validated authored presets, revision-targeted snapshots and typed cross-block ports.
Semantic export includes its declarations, source/contract associations and assertion
provenance without executing them. Schema validity still proves neither HTML safety
nor scientific correctness. Existing beta versions remain frozen.
