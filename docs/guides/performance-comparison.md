# Measured publishing performance

Publisle separates document preparation, publication, and reader delivery. This comparison measures those stages explicitly against MDX, Docusaurus, VitePress, and Pandoc, using the same source content and retaining the observations behind the homepage numbers.

## What is compared

The corpus contains a mixed prose/code/list/link article, 1,000 paragraphs, and a separate math-heavy document with twenty displayed equations. Each compiler runs in a separate Node process, with five excluded warmups and thirty recorded observations. The harness records median, nearest-rank p95, peak process RSS, output size, and source SHA-256.

| Tool       | Document operation                                      | Reading configuration       |
| ---------- | ------------------------------------------------------- | --------------------------- |
| Publisle   | Markdown import, schema preparation, static publication | Minimal static HTML host    |
| MDX        | Compile, evaluate, React static serialization           | Minimal static HTML host    |
| Pandoc     | Fresh process producing HTML                            | Minimal static HTML host    |
| VitePress  | Its Markdown renderer producing HTML                    | Default documentation theme |
| Docusaurus | Its Markdown processor producing a JavaScript module    | Default documentation theme |

Docusaurus's document operation ends at a module, not rendered HTML. Full production site builds are measured separately. Their default documentation themes include navigation, styling, and framework code; those features are absent from the minimal static hosts. These are explicit configurations, not interchangeable products or a universal ranking.

Math uses KaTeX for Publisle and the MDX-based tools, MathJax for VitePress, and MathML for Pandoc. These representations have different output sizes. The math fixture's source and output are retained so correctness can be inspected alongside timing.

## Reader and installation footprint

Chromium opens each production site in a fresh browser, then the harness records the HTML, CSS, and JavaScript actually requested for the article. Gzip sizes use level 6. No interactive content is present in this static fixture. Publisle, static MDX, and Pandoc all deliver zero publication JavaScript in this configuration. The interactive landing-page demonstration has its own client code and is not the zero-JavaScript benchmark fixture.

Installed sizes count each resolved runtime dependency once by real filesystem path, excluding nested `node_modules` from each package's own size. Publisle uses the published Core CLI installation; MDX includes React and its server renderer; documentation frameworks include their default theme dependencies. Pandoc's standalone executable is reported as a binary size, not an npm installation. These sizes exclude Node itself, downloaded caches, and optional PDF tooling. They describe the pinned versions in the report.

## Reproduce

Install the comparison tools outside the workspace, with Node.js 24:

```sh
cd /tmp
npm install --prefix /tmp/publisle-ecosystem --ignore-scripts \
  @mdx-js/mdx@3.1.1 @docusaurus/core@3.10.2 \
  @docusaurus/preset-classic@3.10.2 vitepress@1.6.4 \
  react@19.3.1 react-dom@19.3.1 remark-math@6.0.0 \
  rehype-katex@7.0.1 markdown-it-mathjax3@4.3.2
npm install --prefix /tmp/publisle-footprint --ignore-scripts @publisle/cli@0.2.0
```

From the repository root, place the official Pandoc 3.12.1 Linux executable at `.local/benchmark-bin/pandoc`, then run:

```sh
node tools/benchmarks/ecosystem.mjs
node tools/benchmarks/publish-comparison.mjs .local/ecosystem
```

The first command retains the source documents, generated outputs, raw observations, production sites, and dependency lock in `.local/ecosystem/`. Run benchmarks sequentially without competing builds. `BENCH_RUNTIME`, `BENCH_PUBLISLE_RUNTIME`, `BENCH_OUTPUT`, and `PANDOC` override local paths. `BENCH_SAMPLES` and `BENCH_WARMUPS` support diagnostic runs; only a complete run with at least thirty samples and five warmups may update the published comparison.

The [raw report](../assets/performance/ecosystem.json) records the environment, exact dependency versions, and compiler-source checksums recorded when publishing the observations. Keep compiler sources unchanged between measurement and publication. The [dependency lock](../assets/performance/ecosystem-lock.json) records registry integrities. Homepage values are generated from that report, not entered manually. Peak RSS is measured per compiler process; Pandoc's child-process RSS and full-site-build RSS are reported separately where available.

## PDF compilation

Hosted PDF work has a separate budget: the API, Docker runtime, and compiler share half a CPU and 512 MiB, with swap disabled. Cache hits and queue wait are separate from uncached compilation. Timings distinguish preparation, image retrieval, source generation, LaTeX execution, and container overhead. Figures in the controlled benchmark use local fixture bytes through the normal validated download path, excluding network variability. The FFT diagnostic adds an illustrative author required for journal export; the Arabic diagnostic substitutes a supported SVG figure for its repository-only PDF figure. These adapted inputs are identical across backends and identified by source hashes.

```sh
PDF_QA_BENCHMARK=true PDF_BENCH_CASES=research \
  PDF_QA_ARTIFACTS="$PWD/.local/pdf-benchmark" \
  node deploy/vps/budget-check.mjs
```

This creates an isolated temporary rootless Docker daemon and resource slice; it does not change the running service. The benchmark records every sample, worker image identity, CPU throttling counters, and aggregate memory observations. Use `PDF_QA_IMAGE` to select a candidate worker image. The existing result cache is disabled for these measurements. Latencies belong to the recorded immutable worker images; final deployment resource verification is retained separately in the report.

A native-engine feasibility study uses the neutral research article projection, translates it into Typst source through Pandoc, and invokes Typst 0.15.1 in the same resource slice. Set `PDF_BENCH_NATIVE=true` to reproduce it after installing the official Typst executable at `.local/benchmark-bin/typst`. Its output is a generic article port; it does not establish publisher-class fidelity or PDF/UA-2 equivalence. A faster result alone does not authorize changing the journal export backend. The prototype currently omits keyword and affiliation metadata and does not preserve all reference navigation; its projection loss list does not cover those adapter limitations.

<!-- pdf-results -->

The Research-paper sample is the principal latency workload: five warmups and thirty uncached observations per backend on 13th Gen Intel(R) Core(TM) i7-13620H. These are local controlled measurements, not live VPS latency. Successful diagnostic fixtures have five observations each; their p95 is the maximum and is not a latency-budget calibration. The previous worker fails the FFT diagnostic; the candidate passes all three. The native study rejects the FFT fixture because its TeX-to-Typst bridge cannot convert the colored math. Raw observations and worker identities are in the [PDF report](../assets/performance/pdf.json).

| Backend                                  | Median  | p95     |
| ---------------------------------------- | ------- | ------- |
| Previous LaTeX worker                    | 17.46 s | 18.17 s |
| Optimized LaTeX worker                   | 16.40 s | 17.33 s |
| Native generic-article feasibility study | 1.66 s  | 2.03 s  |

The five-second p95 target was not met by the existing LaTeX path within the fixed budget. The native study changes typography and template implementation, and is not a production replacement or evidence of publisher/PDF-UA equivalence.

<!-- /pdf-results -->
