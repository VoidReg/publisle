# Locked source and offline exchange (beta)

This implements discovery, document manifests, archival Markdown, resources and reproducibility for the current frozen beta. Existing document/block/artifact/package versions are unchanged. New exchange and island-input domains start at 1. Content revisions change digests, never overwrite immutable IDs or silently repin a publication.

## Source manifest and explicit conversion

A document MAY carry `dependencies`: at most 128 entries `{type, schemaVersion, id, digest}`. Each used block type/version MUST appear exactly once. Entries MUST use `urn:publisle:contract:sha256:<64 lowercase hex>` with matching `sha256:<hex>` digest. Instances share a pin; the manifest does not repeat whole contracts. The verified bundle supplies their transitive block/schema closure. Optional `extensions` is a JSON object; opaque block data and digest-associated readable representations remain in their original envelopes.

`lockDocument` is an explicit save-time operation returning the original document, pinned document and verified bundle. It MUST reject noncanonical payloads, unmodeled envelope fields, missing contracts, version mismatches or changed existing pins. Authors retain the original source before approving normalization/conversion. Preparation requires host-approved pins for locked documents and MUST NOT discover contracts, migrate a pinned block version or rewrite source. Unpinned historical documents remain usable locally; that is not locked-exchange conformance.

## Resolution and trust

Resolution order is supplied verified bundle, reverified host cache, then explicitly approved static JSON locations. IDs are immutable names, not executable endpoints. Locations are host-supplied mirrors, not document-controlled import authority. A cache integrity failure is an error, not permission to replace it remotely. Cache updates occur only after the full closure validates.

Remote retrieval defaults to HTTPS, manual redirects with zero permitted hops, omitted credentials, 2 MiB per response, 5 seconds, 128 contracts and depth 32. Host policy may lower limits; upper bounds are 2 MiB, 60 seconds, 128 contracts, depth 64, five redirects and eight mirrors per contract. Every redirect destination is checked against exact approved origins, allowed schemes and absence of user information/fragments. Both declared and streamed bytes are bounded; stalled fetches/reads time out. Schema references resolve only from supplied schema JSON, never through network retrieval.

Offline mode MUST perform no retrieval and report all missing identities reachable through the available closure. Resource/block dependency cycles are invalid; productive recursive schemas operating on child values remain supported by the schema profile. These controls do not make synchronous validator compilation a hostile-code sandbox. Hosts isolate untrusted compilation and provide transport/DNS policy if approved origins alone are insufficient for their threat model.

## Archival Markdown grammar

Ordinary Markdown is a reading projection and can lose IDs, pins, versions or unsupported structure; its diagnostics are part of the export result. Archival Markdown is a separate lossless exchange dialect containing complete JSON envelopes, not natural-language approximations of black-box behavior:

```text
::::publisle-document
~~~publisle-manifest
{"schemaVersion":1,"dependencies":[],"extensions":{}}
~~~

:::publisle-block
~~~publisle-envelope
{"id":"00000000-0000-4000-a000-000000000001","type":"example:opaque","schemaVersion":1,"data":null}
~~~
:::
::::
```

The document has exactly one manifest followed by zero or more block directives. The manifest excludes `blocks`; each envelope contains the complete block. Directives MUST begin at column one; trailing whitespace, blank separator lines and CRLF are accepted. JSON fences use at least three identical tildes or backticks, with the exact same marker for closing. No prose, nested directives or trailing content is accepted outside JSON fences. JSON escaping, not Markdown inline escaping, applies inside fences; apparent directives inside escaped strings are inert. Unterminated/mismatched fences and unsupported envelope fields fail explicitly. Import preserves IDs rather than generating new ones and reports document/block directive locations. It does not validate unknown block semantics without contracts.

## Resources and identity domains

Resource plans retain authored `originalUris`, normalized URI, optional host-resolved location, media type, exact-byte SHA-256 pin, host revision/version, dependencies, external flag and JSON dataset descriptor. Core performs no I/O. Lexical path normalization does not substitute for a source base or host authorization. Resolver base and declared behavior version participate in identities. Resource and transform identities are distinct; transform options do not mutate the original resource. Unchecked URIs/revisions are not evidence of verified asset content.

Source identity hashes the canonical original source. Semantic identity hashes prepared content and its declared preparation/registry/resource inputs, excluding source-map locations. Artifact identity hashes compiled output, minimal assets, contract/resource provenance and explicit host configuration/seed, excluding diagnostics. Diagnostic identity covers located diagnostics independently. Source-map-only edits do not invalidate semantic/artifact output. Host compiler/renderer configuration and randomness MUST be pinned or reproducibility MUST be marked false. No clock or function-source inference supplies a missing pin. Diagnostic/profile policy currently remains part of preparation configuration; this deliberately conservative cache key may invalidate more than the minimum.

## Directory package

`@publisle/contracts/exchange` is Node-only preparation tooling. Export creates a **new** directory with `exchange.json`, `source.json` or `source.md`, `contracts.json`, `lock.json`, and deduplicated `assets/<raw-byte-sha256>.bin`. The inventory pins exact file bytes; contract bodies retain their independent canonical JSON pins. Hosts may additionally pin the inventory itself with `expectedManifestDigest` supplied out of band. This is integrity, not publisher authentication.

The source MUST be locked and canonical, and its contract closure verified. Archival codecs are explicitly host supplied and must preserve the same source. Only caller-permitted resource bytes are packaged; no asset or executable is fetched. Declared URI references without supplied bytes are listed as missing; external resources and unresolved resource dependencies must be explicit. Executable requirements are reported separately; packaging does not grant permission to run them. Imported assets are returned as bytes, not installed or executed.

Default budgets are 256 files, 64 MiB per file and 128 MiB total. Paths MUST be relative, bounded and contain no empty/dot/dot-dot segments, backslashes, colons or control characters. Metadata uses reserved paths; included assets use content-addressed paths. Import rejects symlinked roots/components/files, nonregular or hardlinked files, root escapes, digest mismatches, misleading inventories and dependency cycles. Reads are bounded even if a file grows. Export refuses an existing directory and never replaces source; an I/O failure can leave a partial newly created directory with no completed inventory. Hosts clean up only their own staging directory. Concurrent adversarial mutation of parent directories requires host filesystem isolation; this is not an operating-system sandbox.

Independent Python validation, behavior execution, semantic exports/inspection and distribution-scale performance budgets are later batches, not claims of this exchange contract.
