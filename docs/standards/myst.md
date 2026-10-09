# MyST mapping

The machine-readable loss table is `MYST_LOSS_TABLE` in `@publisle/markdown`. It is the initial mapping, not a promise that every MyST document round-trips.

Supported Markdown prose and dollar math map through the existing Markdown importer. A MyST cite role becomes a citation reference and is recorded as lossy because no citation style or locator is inferred. Other roles and unknown directives stay as visible text and are marked unsupported.

Diagrams, embeds, and interactive blocks are unsupported MyST behavior. `toMyST` writes them into a `publisle` fence of strict JSON so the opaque source can be read back. A fence that is not strict JSON is a loss, not a guessed block.

No other format adapter is implied.
