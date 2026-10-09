# Optional scholarly and publishing profiles

These profiles are informational. They are not required for every document, and they do not select a citation style, page layout, font, or route.

## Citations and sections

`publisle:bibliography` stores optional entries (`id`, `title`, `authors`, `raw`). `raw` is opaque source and is kept exactly. The document envelope schema does not give this type its own alternative. The portable applicator refuses more than 16 `oneOf` branches, which is a validator limit rather than the interoperability rule, so envelope validation preserves the block as an unknown type. Entry shape is checked by the bibliography schema and the authoring parser. The `scholarly` profile warns by default on duplicate entry ids and on citation ids that have no entry. A host may promote those codes through `diagnosticPolicy`. Unresolved citations remain in the source and in rendered text. The profile does not format citations.

## Citation resolution and research export

`@publisle/research` is tooling. Readers must not import it. `resolveDocument` links each citation id to the first bibliography entry with that id and formats the citation cluster and the reference list. A missing id is reported as `unresolved-citation` and is left in the source. Duplicate ids keep the first entry.

Optional entry fields, still schema version 1, are `type`, `issued`, `containerTitle`, `volume`, `issue`, `page`, `publisher`, `doi`, and `url`. `raw` stays the original source text.

BibTeX import fills those fields and keeps original entries in `raw`; opaque references remain literal with diagnostics. CSL JSON import also retains complete records for structured names, particles, dates and other citation variables. The pinned citeproc-js processor supplies full CSL formatting with bundled versioned locale resources, history-aware ibid/subsequent forms and revisions to earlier citations during disambiguation. Built-in styles are `numeric` and `author-date`; `resolveDocument` accepts custom styles, locale resources, full items and note indices.

PDF defaults to the Unicode LaTeX article template. The old synchronous `toPdf` is deprecated and rejects unsupported characters unless lossy output is explicit. Public templates live in separate article, IEEE, ACM, Elsevier and Springer packages, using `@publisle/template-sdk`; hosts can supply their own objects or registries. Directory/ZIP submission exports collect sources and assets. JATS packages validate offline against Archiving 1.3; `toJats` remains a single-article API. Compilation chooses complete native dependencies or an already installed pinned container and never downloads implicitly. DOI/HTTPS acquisition is explicit, cached and separate from export. See [research export and migration](../guides/journal-export.md). Individual journals can require other metadata/templates/files; these starter profiles do not imply universal journal acceptance.

Heading `role` may be `abstract` or `section`. The research-paper profile treats `role: abstract` as an abstract heading. Other documents may omit both the role and the profile.

Table `headerRows` says how many leading rows label the columns. When it is omitted, existing tables keep their previous header convention. `0` marks no header row.

Captions, credits, licenses, and figures stay the existing fields. This profile does not copy them into a second metadata model.

## Language, direction, and print

`metadata.language` is an exact string. `metadata.direction` and text `direction` are `ltr`, `rtl`, or `auto`. Unicode is not normalized. The `localization` profile reports that a host still chooses layout. A host that ignores `dir` is an explicit limitation, not a successful universal renderer.

The `print` profile warns by default when a diagram lacks `fallback` and `printFallback`, or an embed lacks `fallback`. It does not paginate. The localization profile reports `host-direction-policy` at `info` when direction is present. `diagnosticPolicy` can map any of these codes to `info`, `warning`, or `error`. Island explanations remain the interactive publication profile's job.
