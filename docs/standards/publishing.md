# Optional scholarly and publishing profiles

These profiles are informational. They are not required for every document, and they do not select a citation style, page layout, font, or route.

## Citations and sections

`publisle:bibliography` stores optional entries (`id`, `title`, `authors`, `raw`). `raw` is opaque source and is kept exactly. The document envelope's closed type list is already at its 16-branch limit, so this block is preserved there and its entry shape is checked by the bibliography schema and the authoring parser. The `scholarly` profile warns on duplicate entry ids and on citation ids that have no entry. Unresolved citations remain in the source and in rendered text.

Heading `role` may be `abstract` or `section`. The research-paper profile treats `role: abstract` as an abstract heading. Other documents may omit both the role and the profile.

Table `headerRows` says how many leading rows label the columns. When it is omitted, existing tables keep their previous header convention. `0` marks no header row.

Captions, credits, licenses, and figures stay the existing fields. This profile does not copy them into a second metadata model.

## Language, direction, and print

`metadata.language` is an exact string. `metadata.direction` and text `direction` are `ltr`, `rtl`, or `auto`. Unicode is not normalized. The `localization` profile reports that a host still chooses layout. A host that ignores `dir` is an explicit limitation, not a successful universal renderer.

The `print` profile warns when a diagram lacks `fallback` and `printFallback`, or an embed lacks `fallback`. It does not paginate. Island explanations remain the interactive publication profile's job.
