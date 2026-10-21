// The flagship playground document: one click demonstrates every capability
// of the website — metadata, colored LaTeX, labeled equations with
// cross-references, captioned figures and tables, diagrams and embeds with
// static fallbacks, an interactive FFT butterfly island, code, task lists,
// footnotes, and a bibliography. It must compile with the core registry
// without error-level diagnostics (enforced by sites/www/tests/examples.test.ts).
export interface PlaygroundExample {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly markdown: string;
}

const FFT_ISLAND = {
  activation: "interaction",
  content: {
    title: [{ type: "text", value: "Eight-point FFT butterfly" }],
    description: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            value:
              "The square-wave samples [1, 0, -1, 0, 1, 0, -1, 0] enter on the left and leave as a spectrum with energy only in bins 2 and 6. Each stage combines pairs of values with a twiddle factor.",
          },
        ],
      },
    ],
    instructions: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            value:
              "Select Step stage to apply one butterfly stage and watch the values combine, or Run all stages to jump to the spectrum. Reset returns to the bit-reversed input.",
          },
        ],
      },
    ],
  },
  fallback: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          value:
            "Eight samples [1, 0, -1, 0, 1, 0, -1, 0] transform into a spectrum with magnitude 4 in bins 2 and 6 and magnitude 0 elsewhere.",
        },
      ],
    },
  ],
  accessibility: { label: "Interactive eight-point FFT butterfly" },
  payload: { source: "/fft-butterfly.json" },
};

const FFT_BIBLIOGRAPHY = [
  {
    id: "cooley1965",
    type: "article",
    authors: ["Cooley, James W.", "Tukey, John W."],
    title: "An Algorithm for the Machine Calculation of Complex Fourier Series",
    issued: "1965",
    publisher: "Mathematics of Computation",
  },
  {
    id: "gauss1805",
    type: "article",
    authors: ["Gauss, Carl Friedrich"],
    title: "Nachlass: Theoria interpolationis methodo nova tractata",
    issued: "1866",
    publisher: "Werke, Band 3",
  },
];

const PAPER_BIBLIOGRAPHY = [
  {
    id: "fourier1822",
    type: "book",
    authors: ["Fourier, Joseph"],
    title: "Theorie analytique de la chaleur (Analytical Theory of Heat)",
    issued: "1822",
    publisher: "Firmin Didot Pere et Fils",
  },
  {
    id: "wilbraham1848",
    type: "article",
    authors: ["Wilbraham, Henry"],
    title: "On a certain periodic function",
    issued: "1848",
    publisher: "The Cambridge and Dublin Mathematical Journal",
  },
  {
    id: "gibbs1899",
    type: "article",
    authors: ["Gibbs, Josiah Willard"],
    title: "Fourier's series",
    issued: "1899",
    publisher: "Nature",
  },
];

const PAPER_ROWS = [
  [1, "1.273240", "0.189431"],
  [3, "1.188357", "0.066944"],
  [7, "1.180684", "0.028900"],
  [15, "1.179350", "0.013504"],
  [31, "1.179066", "0.006536"],
];

const FENCE = "```";

export const playgroundExamples: readonly PlaygroundExample[] = [
  {
    id: "fft",
    title: "Fourier & FFT",
    description:
      "One article, every capability: colored math, cross-references, figures, tables, diagrams, embeds, an interactive FFT butterfly, code, citations, and print fallbacks.",
    markdown: String.raw`---
documentType: tutorial
title: "The FFT: From Sums to Butterflies"
description: "A worked tour of the discrete Fourier transform and the Cooley-Tukey butterfly, exercising every Publisle block in one document."
language: en
authors:
  - name: Ada Example
    affiliation: Illustrative Signal Processing Laboratory
subjects:
  - Signal processing
  - Fourier analysis
  - Algorithms
license:
  name: Creative Commons Attribution 4.0 International
  identifier: CC-BY-4.0
  url: https://creativecommons.org/licenses/by/4.0/
extensions:
  demo:features: "colored LaTeX, labels and cross-references, figures, tables, mermaid diagrams, embeds, interactive islands, code, task lists, footnotes, and citations"
---

# The FFT: From Sums to Butterflies

A signal and its spectrum are the same data seen from two sides. The discrete Fourier transform (DFT) is the bookkeeping that converts one into the other, and the fast Fourier transform (FFT) is the classic divide-and-conquer arrangement that makes the conversion cheap: instead of $N^{2}$ multiply-adds, it needs about $N \log_{2} N$.

This article exercises **every block type the website supports** while developing the idea.

> The DFT is a change of basis. The FFT is just a clever order of the same arithmetic.

## What you can do here

- [ ] Follow a color-coded signal through the transform.
- [ ] Step through a butterfly network stage by stage below.
- [ ] Check the numbers against real code and citations.
- [x] Notice that the interactive part ships a static fallback for print.

:::callout{variant="info" title="One source, every reader"}
Everything on this page is one portable document. Print and no-JS readers get the fallbacks; browsers additionally get the live butterfly. Your edits save on this device, and Ctrl+K inserts more blocks.
:::

:::heading{label="sec:dft"}

## 1. The transform, color-coded

:::

The DFT of a length-$N$ signal is defined in Equation :ref[eq\:dft]:

:::equation{label="eq:dft"}

$$
X[k]=\sum_{n=0}^{N-1}\,\textcolor{RoyalBlue}{x[n]}\;e^{-2\pi ikn/N},\qquad k=0,1,\dots,N-1.
$$

:::

The $\textcolor{RoyalBlue}{\text{samples}}$ on the left are coordinates in the time basis; the $\textcolor{ForestGreen}{\text{spectrum}}$ on the right is the same information in the frequency basis. For the eight square-wave samples used throughout this article,

$$
\underbrace{[1,0,-1,0,1,0,-1,0]}_{\textcolor{RoyalBlue}{\text{signal}}}
\;\xrightarrow{\;\text{DFT}\;}\;
[0,0,\textcolor{ForestGreen}{4},0,0,0,\textcolor{ForestGreen}{4},0],
$$

so the periodicity shows up as exactly two nonzero bins: $|X[2]| = |X[6]| = 4$. Figure :ref[fig\:spectrum] plots those magnitudes.

::::figure{src="/fft-spectrum.svg" variant-dark="/fft-spectrum-dark.svg" alt="Bar chart of eight DFT magnitudes; only the bars at frequency bins 2 and 6 rise to 4" label="fig:spectrum"}
:::caption
The magnitude spectrum of the sampled square wave. Energy sits in bins 2 and 6 because the signal repeats every four samples.
:::
::::

:::heading{label="sec:butterfly"}

## 2. Halving the work with butterflies

:::

The FFT :cite[cooley1965] reuses half of every computation by splitting the sum into even and odd samples. One butterfly consumes two inputs and produces two outputs:

$$
\begin{aligned}
E &= a + \textcolor{ForestGreen}{W \cdot b} \\
O &= a - \textcolor{ForestGreen}{W \cdot b}
\end{aligned}
$$

Repeating the split $\log_{2} N$ times gives the butterfly network below; Table :ref[tab\:stages] lists what each stage costs.

::::diagram{engine="mermaid" alt="Sample indices enter bit-reversed, pass through three butterfly stages, and leave as the spectrum"}
${FENCE}mermaid
flowchart LR
  A["x 0..7 (bit-reversed)"] --> S1["Stage 1: size-2 butterflies"]
  S1 --> S2["Stage 2: size-4 butterflies"]
  S2 --> S3["Stage 3: size-8 butterflies"]
  S3 --> X["X 0..7 (spectrum)"]
${FENCE}
:::caption
Dataflow of a decimation-in-time FFT. Inputs are visited in bit-reversed order; outputs emerge in natural order.
:::
:::fallback
Samples in bit-reversed order pass through three butterfly stages of growing block size and leave as the spectrum in natural order.
:::
::::

::::table{headerRows="1" label="tab:stages"}
| Stage | Block size | Twiddle factors | Butterflies |
| ----- | ---------- | ---------------- | ----------- |
| 1     | 2          | $W_{2}^{0}$      | 4           |
| 2     | 4          | $W_{4}^{0},W_{4}^{1}$ | 4      |
| 3     | 8          | $W_{8}^{0},\dots,W_{8}^{3}$ | 4 |
:::caption
Three stages of four butterflies each transform eight samples — 12 complex multiply-adds instead of the 64 that the definition implies.
:::
::::

### Run it yourself

:::publisle{type="publisle:interactive-schematic" schemaVersion="2"}
${FENCE}json
${JSON.stringify(FFT_ISLAND, null, 2)}
${FENCE}
:::

:::callout{variant="warning" title="Print readers"}
The butterfly above is live in the browser. Its authored fallback paragraph is what PDF, print, and no-JS readers see, and the payload is validated data, not a script.
:::

:::heading{label="sec:verify"}

## 3. Verify it in code

:::

The article never asks you to trust it. Ten lines of Python reproduce the spectrum in Figure :ref[fig\:spectrum]:

${FENCE}python
import numpy as np

signal = np.array([1, 0, -1, 0, 1, 0, -1, 0])
print(np.fft.fft(signal).round(2))
# [ 0.+0.j  0.+0.j  4.+0.j  0.+0.j
#   0.+0.j  0.+0.j  4.+0.j  0.+0.j]
${FENCE}

The idea long predates computers: Gauss described the same splitting by hand half a century earlier :cite[gauss1805], though the butterfly network is the 1965 formulation.[^why-fast]

::::embed{provider="youtube" resource="spUNpyF58BY" title="But what is the Fourier Transform? A visual introduction"}
:::fallback
An external video introduction to the Fourier transform is embedded here on the website. Print readers can search for *3Blue1Brown, "But what is the Fourier Transform?"*.
:::
::::

[^why-fast]: The 1965 paper popularized the algorithm; the term "fast Fourier transform" is what stuck. The count is $N \log _{2} N$ butterflies versus $N^{2}$ direct evaluations.

## Summary

One document carried the math, the picture, the network diagram, the experiment, and the references — and every block above survives Markdown import, editing, and static compilation with its semantics intact.

:::bibliography
${FENCE}json
${JSON.stringify(FFT_BIBLIOGRAPHY, null, 2)}
${FENCE}
:::
`,
  },
  {
    id: "research-paper",
    title: "Research paper",
    description:
      "Journal-style manuscript with an abstract, keywords, labeled equations, a results table, citations, and a bibliography — the natural source for PDF export.",
    markdown: String.raw`---
documentType: research-paper
title: "Convergence of Fourier Partial Sums at Jump Discontinuities"
description: "An illustrative study of pointwise convergence, the Gibbs overshoot, and mean-square error for square-wave partial sums."
language: en
authors:
  - name: Ada Example
    affiliation: Illustrative Signal Processing Laboratory
  - name: Sam Sample
    affiliation: Example Institute of Engineering
subjects:
  - Fourier analysis
  - Convergence
  - Signal processing
---

:::heading{role="abstract"}

# Abstract

:::

This manuscript examines the pointwise behaviour of Fourier partial sums of a square wave. Away from the discontinuity, partial sums converge to the generating function; at the discontinuity, they overshoot by a fixed proportion that does not vanish as terms accumulate. Numerical evaluation for cutoffs of one to thirty-one terms shows the maximum rising towards the Wilbraham-Gibbs value $(2/\pi)\operatorname{Si}(\pi)\approx 1.1790$ while the normalized mean-square error decays from $0.189$ to $0.007$. The study is a publishing fixture: it verifies that abstracts, keywords, labeled equations, cross-references, a plotted figure, a results table, and structured references survive conversion into journal manuscripts, and it claims no new mathematics.

:::heading{label="sec:introduction"}

# Introduction

:::

Fourier's expansion of periodic functions into trigonometric series is the founding result of harmonic analysis :cite[fourier1822]. For a function with a jump discontinuity, however, the convergence of the partial sums is subtle: observers recorded an unexplained overshoot near the jump long before it was analyzed :cite[wilbraham1848], and the effect was later attributed to the series itself rather than to computational artifacts :cite[gibbs1899]. The same reference is cited again :cite[gibbs1899] to verify stable numbering under export.

A journal manuscript combines several kinds of information. Its abstract states the contribution, the body develops the model, and figures, tables, and references carry evidence that must survive conversion. This manuscript exercises that structure end to end; its numerical experiment is deliberately small so that export behaviour can be inspected independently of scientific novelty.[^fixture-note]

:::heading{label="sec:model"}

# Partial Sums and Pointwise Convergence

:::

Consider the unit square wave with $f(x)=1$ on $(0,\pi)$ and $f(x)=-1$ on $(-\pi,0)$. Its $K$-term partial sum retains the first $K$ nonzero odd harmonics, as defined in Equation :ref[eq\:partial]:

:::equation{label="eq:partial"}

$$
S_{K}(x)=\frac{4}{\pi}\sum_{j=0}^{K-1}\frac{\sin\bigl((2j+1)x\bigr)}{2j+1}.
$$

:::

Two quantitative facts frame the experiment. First, the overshoot does not disappear: at the points approaching the jump, the partial sums converge to the value stated in Equation :ref[eq\:overshoot]. Second, the energy of the residual decays to zero: Parseval's identity gives the normalized mean-square error in Equation :ref[eq\:energy].

:::equation{label="eq:overshoot"}

$$
\lim_{K\to\infty}\, S_{K}\!\left(\frac{\pi}{K+1}\right)=\frac{2}{\pi}\operatorname{Si}(\pi)\approx 1.1790 .
$$

:::

:::equation{label="eq:energy"}

$$
E_{K}=1-\frac{8}{\pi^{2}}\sum_{j=0}^{K-1}\frac{1}{(2j+1)^{2}} .
$$

:::

[^fixture-note]: All authors and institutions are illustrative. The sine integral $\operatorname{Si}(\pi)$ is evaluated numerically; the experiment is reproducible from the stated formulas alone.

:::heading{label="sec:results"}

# Illustrative Results

:::

Figure :ref[fig\:gibbs] shows the fifteen-term partial sum against the square wave. The curve tracks the function away from the jump and overshoots it near $x=\pi/16$, consistent with Equation :ref[eq\:overshoot].

::::figure{src="/gibbs-overshoot.svg" variant-dark="/gibbs-overshoot-dark.svg" alt="Line plot of a fifteen-term Fourier partial sum overshooting the square wave to about 1.179 near the jump at the origin" label="fig:gibbs"}
:::caption
The fifteen-term partial sum $S_{15}$ (solid) against the square wave (dashed). The maximum occurs near $x=\pi/16$ and approaches the Wilbraham-Gibbs value as terms accumulate.
:::
::::

Table :ref[tab\:overshoot] lists the measured maxima and mean-square errors. The maxima descend towards $1.1790$ while the errors in Equation :ref[eq\:energy] fall below one percent by fifteen terms.

::::table{headerRows="1" label="tab:overshoot"}
| Terms $K$ | Maximum of $S_{K}$ | Mean-square error $E_{K}$ |
| --------- | ------------------ | -------------------------- |
| 1         | ${PAPER_ROWS[0][1]} | ${PAPER_ROWS[0][2]} |
| 3         | ${PAPER_ROWS[1][1]} | ${PAPER_ROWS[1][2]} |
| 7         | ${PAPER_ROWS[2][1]} | ${PAPER_ROWS[2][2]} |
| 15        | ${PAPER_ROWS[3][1]} | ${PAPER_ROWS[3][2]} |
| 31        | ${PAPER_ROWS[4][1]} | ${PAPER_ROWS[4][2]} |
:::caption
Convergence of square-wave partial sums: the maximum approaches the Wilbraham-Gibbs value $(2/\pi)\operatorname{Si}(\pi)\approx 1.1790$ while the normalized mean-square error decays.
:::
::::

:::heading{label="sec:conclusion"}

# Conclusion

:::

The experiment reproduces the classical picture: pointwise convergence away from the jump, a persistent overshoot of roughly nine percent of the jump near it, and mean-square convergence throughout. The manuscript is a fixture for the export pipeline rather than a claim of new results; its abstract, keywords, labeled equations, cross-referenced figure and table, footnote, and structured references are the payload under test.

:::bibliography
${FENCE}json
${JSON.stringify(PAPER_BIBLIOGRAPHY, null, 2)}
${FENCE}
:::
`,
  },
];
