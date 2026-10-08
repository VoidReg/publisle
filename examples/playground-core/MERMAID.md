# Host-owned Mermaid previews

Both playgrounds use the same SVG preview controller. Mermaid is a dependency of
this private example package, never of Publisle's published packages. Documents
keep their native `engine: "mermaid"` and source; no translation language is added.

The Fourier article and default diagram have versioned, pre-rendered SVG assets.
Loading them requests no Mermaid runtime. After a source edit or import, uncached
diagrams render automatically after 400 ms. The host lazily imports Mermaid
12.1.0, selects Dagre, disables HTML labels, and retains strict security. ELK
requests are rejected; security and layout configuration cannot be overridden by
diagram directives. Other engines retain their existing fallback behavior.

The lazy renderer runs in an off-screen, same-origin workspace frame. It is not
an untrusted-code sandbox: strict Mermaid security and SVG image output remain
the safety boundaries. The frame is reused after successful renders and discarded
after failures or host disposal, allowing failed engine imports to retry in a
fresh browser module context without losing the article. It is created only when
an uncached preview needs rendering.
It shares the browser's main thread; this isolates module state for recovery,
not CPU work on a background thread.

Rendering is serialized, duplicate sources share a result, and stale edits do
not overwrite the current preview. The reusable session cache is capped at 100
entries and 5 MiB; active previews remain available even if their result exceeds
the reusable cache limit. No browser storage or server endpoint is required.

The generated theme tokens come from `theme.css`, including the site's font
stack. Mermaid's base theme uses those colors, and each SVG embeds light/dark
CSS variables. Images follow the host color scheme without downloading Mermaid
or rerendering when the preference changes. The print image is forced to the
light palette. Regenerate assets after changing the CSS color/font tokens; tests
detect stale theme metadata. Diagram directives cannot override the host theme.

SVGs are displayed as images, including for print, rather than inserting SVG DOM
into the article. Captions, numbering, references, and alternative text continue
to come from the document. A failed render retains a text fallback with a
diagnostic and retry action. Markdown and JSON exports remain source-based.

## Regenerating bundled assets

After changing bundled Mermaid sources, the pinned version, or rendering policy:

```sh
pnpm --filter @publisle/playground-core generate:diagrams
```

Generation uses a temporary Vite server and headless Chromium. It defaults to
`/usr/bin/google-chrome`; set `MERMAID_CHROME_PATH` to another Chrome/Chromium
executable on other systems. Normal builds do not need Chromium. Commit the
generated SVGs, manifest, and asset imports together. Stale manifest entries are
not accepted by the preview controller and fall back to lazy browser rendering.

Use `@publisle/playground-core/mermaid` only in the host UI, not the main editor
entry point. The synchronous `DiagramRenderer` reads cached image results while
the controller schedules asynchronous rendering and notifies the host to
recompile. No Publisle compiler API change is needed.
