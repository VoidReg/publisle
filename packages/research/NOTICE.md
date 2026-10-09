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

JATS Archiving 1.3 schema files retain their original NLM/W3C/ISO notices under
`vendor/jats`; download provenance is recorded there. Springer class/style
assets belong to the separate template package and retain their original LPPL
notices and unmodified source bytes. The compiler's Mozilla CA bundle retains
its notices; see `compiler/README.md`.
