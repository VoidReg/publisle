# Optional scholarly and publishing profiles

These profiles are informational. They are not required for every document, and they do not select a citation style, page layout, font, or route.

## Citations and sections

`publisle:bibliography` stores optional entries (`id`, `title`, `authors`, `raw`). `raw` is opaque source and is kept exactly. The document envelope schema does not give this type its own alternative. The portable applicator refuses more than 16 `oneOf` branches, which is a validator limit rather than the interoperability rule, so envelope validation preserves the block as an unknown type. Entry shape is checked by the bibliography schema and the authoring parser. The `scholarly` profile warns by default on duplicate entry ids and on citation ids that have no entry. A host may promote those codes through `diagnosticPolicy`. Unresolved citations remain in the source and in rendered text. The profile does not format citations.

## Citation resolution and research export

`@publisle/research` is tooling. Readers must not import it. `resolveDocument` links each citation id to the first bibliography entry with that id and formats the citation cluster and the reference list. A missing id is reported as `unresolved-citation` and is left in the source. Duplicate ids keep the first entry.

Optional entry fields, still schema version 1, are `type`, `issued`, `containerTitle`, `volume`, `issue`, `page`, `publisher`, `doi`, and `url`. `raw` stays the original source text.

BibTeX import fills those fields and keeps each original entry in `raw`. BibTeX export writes the structured fields, or copies `raw` when the entry has none. CSL-JSON export uses the same fields. Built-in citation styles are `numeric` and `author-date`. A CSL 1.0 style may also be supplied. Rendering supports layout, text, names, name, et-al, date and year date-part, group, choose/if/else, macro, and sort. Numeric ranges collapse when the citation layout is only the citation number. A locator is appended when the layout does not render one. Author-date year suffixes disambiguate otherwise identical citations. Locale bundles, ibid, and the rest of the CSL vocabulary are losses, not guessed behavior.

`toLatex` writes an article that cites with `cite` or `natbib`. `toJats` writes one JATS Archiving 1.3 article with bibliographic cross-references and element citations. `toPdf` writes a textual PDF in Helvetica WinAnsi. Characters outside that encoding are question marks and a `pdf-unencodable-character` loss. None of these outputs is a publisher class, a submission package, or a print imposition. The host commands are `publisle export` and `publisle bibliography`.

Heading `role` may be `abstract` or `section`. The research-paper profile treats `role: abstract` as an abstract heading. Other documents may omit both the role and the profile.

Table `headerRows` says how many leading rows label the columns. When it is omitted, existing tables keep their previous header convention. `0` marks no header row.

Captions, credits, licenses, and figures stay the existing fields. This profile does not copy them into a second metadata model.

## Language, direction, and print

`metadata.language` is an exact string. `metadata.direction` and text `direction` are `ltr`, `rtl`, or `auto`. Unicode is not normalized. The `localization` profile reports that a host still chooses layout. A host that ignores `dir` is an explicit limitation, not a successful universal renderer.

The `print` profile warns by default when a diagram lacks `fallback` and `printFallback`, or an embed lacks `fallback`. It does not paginate. The localization profile reports `host-direction-policy` at `info` when direction is present. `diagnosticPolicy` can map any of these codes to `info`, `warning`, or `error`. Island explanations remain the interactive publication profile's job.
