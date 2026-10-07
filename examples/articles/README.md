# Mathematical feature article

Open either playground and choose **Load Fourier article** to load the complete
article and resolve its local assets. This replaces the current editor document,
just like importing Markdown. Use the normal export controls to save it.

`fourier-series.md` is also a standalone source document. Keep
`fourier-square-wave.svg` and `fourier-clock.json` alongside it when publishing
with another host, and register the example scene and schematic implementations
if you want their interactive versions.

The article covers orthogonal projection, Fourier coefficients, square waves,
convergence, Gibbs oscillations, Parseval's identity, and a reproducible Python
experiment. It exercises all native block types and inline node types, heading
levels 1–6, nested publication slots, metadata, colored LaTeX, labeled equations,
tables and figures, footnotes, citations, and cross-references.

Diagram sources demonstrate Mermaid, Graphviz, WaveDrom, PlantUML, and a custom
engine ID. The default playground uses their textual/source fallbacks; supplying
actual engine renderers remains a host responsibility. The Three.js illustration
is a geometric projection scene. The schematic island is only a manual counter,
not a Fourier simulator. The optional YouTube embed is an external resource.

The SVG is an original plot of the square-wave partial sums with 1, 3, and 15 odd
harmonics, sampled at 1001 equally spaced points across one period. The article's
license covers this original material; linked videos and course resources retain
their own rights.
