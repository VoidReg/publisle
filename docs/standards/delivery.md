# Native and artifact delivery (beta)

Both React/Svelte native targets and precompiled publication artifacts receive the same island input:

```json
{
  "inputVersion": 1,
  "block": {
    "id": "authored-block",
    "type": "example:scene",
    "schemaVersion": 1,
    "contract": { "id": "<immutable contract ID>", "digest": "<digest>" }
  },
  "activation": "visible",
  "payload": null,
  "initialState": { "selected": 0 },
  "accessibility": { "label": "Example scene" }
}
```

`payload` is any JSON value, including arrays, strings, numbers, booleans and null; it MUST NOT be flattened or replaced with an empty object. Contract identity is present when source is locked. Content, fallback, accessibility, readable associations and optional `initialState` retain their authored structure. Services, executable loaders, DOM targets and lifecycle handles stay out of band. This is an atomic frozen-beta ABI update; there is no reader-side legacy interpretation branch. Incompatible artifact/input versions preserve fallback and receive explicit incompatibility markers.

## Artifact versus native fidelity

Artifacts contain an HTML fragment, stylesheet and module identifiers, used island inputs, compatibility/static-fidelity report, diagnostics, output identity and optional reproducibility provenance. They are not framework templates or executable module mappings. Hosts separately approve implementation IDs and URLs; document-provided module-like strings do not execute themselves. `publicationReaderManifest` extracts only format, version, identity, compatibility and islands for attachment, avoiding duplication of SSR HTML, resources, diagnostics or source AST in browser data. The `publication-runtime` entry excludes schema validators, compiler, registry and formatter tooling.

| Capability                         | Native target                    | Publication artifact                                                  |
| ---------------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| Core static blocks and math        | Direct target output             | Precompiled HTML                                                      |
| Host static framework component    | Host component                   | Host-approved `lower(input)` nodes or substantive authored fallback   |
| Interactive host implementation    | Approved module and common input | Approved ID mapping and the same input                                |
| Unsupported static component       | Host responsibility              | Error and `staticFidelity: unsupported`; no empty success placeholder |
| Missing/failed implementation      | Preserve fallback                | Preserve fallback                                                     |
| Trusted authored raw HTML with IDs | Host markup policy               | Reject by default, or explicit restricted-placement preservation      |

Static lowering/fallback is reported and is not a promise of arbitrary framework visual equivalence. Used modules/styles are deduplicated. Payloads and declared datasets are not unsafely pruned merely because a renderer appears not to read them. No full source AST/schema/registry is delivered solely for rendering. Three.js, Mermaid and other computation engines remain host-side implementations.

## Placement and CSS policy

Compiler-generated IDs, fragment links, label/form associations and ARIA token references are namespaced per placement. Hosts supply a unique instance ID matching `[A-Za-z][A-Za-z0-9_-]{0,63}`. Generated React/Svelte targets use framework-owned IDs when a host does not supply one. Repeated placements do not share interactive state. Compiler-generated CSS is rooted under Publisle classes; approved components/styles remain the host's responsibility. Arbitrary authored trusted HTML cannot be generically rewritten into safe scoped markup; artifact compilation rejects identity-bearing raw HTML by default. `rawHtmlPlacement: preserve` produces a warning and requires host restrictions.

Hosts remain responsible for sanitization, CSP, stylesheet/asset origins and internal component IDs. Raw HTML opt-in is not a sanitizer. Browser acceptance verifies native/artifact JSON input parity, repeated ID/reference behavior, independent state and the absence of preparation tooling from readers. It does not claim a universal CSS reset or numerical equivalence of user engines.
