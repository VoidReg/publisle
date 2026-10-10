# Third-party resources

Citation formatting uses citeproc-js (`citeproc` 2.4.63), by Frank Bennett and
contributors, https://github.com/Juris-M/citeproc-js. Its original LICENSE is
included by the dependency. That file offers CPAL 1.0 or AGPL 3-or-later;
upstream npm SPDX metadata reads `CPAL-1.0 OR AGPL-1.0`. Publisle's own source
license does not replace dependency licenses.

The bundled locale data comes from the Citation Style Language project,
https://CitationStyles.org/, under CC BY-SA 3.0. Translator metadata is preserved
in every locale. The exact upstream revision and notices are retained under
`vendor/locales`.

The reviewed citation corpus under `packages/contracts/fixtures/citations.json`
is generated with this pinned processor and those locale resources. The
independent Python implementation is authored in-repository and vendors no CSL
processor or locale XML; its dependency evaluation is recorded in
`tools/python/NOTICE.md`. Both implementations expose a limited portable role,
not a general CSL parity claim.

JATS Archiving 1.3 schema files retain their original NLM/W3C/ISO notices under
`vendor/jats`; download provenance is recorded there. Springer class/style
assets belong to the separate template package and retain their original LPPL
notices and unmodified source bytes. The compiler's Mozilla CA bundle retains
its notices; see `compiler/README.md`.

The optional PDF accessibility gate downloads veraPDF Greenfield 1.28.2 from
https://software.verapdf.org/releases/1.28/ with a pinned SHA-256 digest. Its
installed notices describe GPL v3 and MPL v2-or-later licensing. No veraPDF
binaries are vendored in this repository. Upstream TeX Live packages retain
their individual license notices in the explicitly installed compiler image.
