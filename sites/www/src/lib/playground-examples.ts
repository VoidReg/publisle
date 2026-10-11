// Curated playground documents that showcase Publisle capabilities in one
// click. Every example must compile with the core registry without
// error-level diagnostics (enforced by sites/www/tests/examples.test.ts).
export interface PlaygroundExample {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly markdown: string;
}

const SCHEMATIC_DATA = {
  activation: "interaction",
  content: {
    title: [{ type: "text", value: "Clocked counter" }],
    description: [
      {
        type: "paragraph",
        content: [
          { type: "text", value: "Observe the output on each clock edge." },
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
              "Select Clock to advance it. Select Reset to return to zero.",
          },
        ],
      },
    ],
  },
  fallback: [
    {
      type: "paragraph",
      content: [{ type: "text", value: "The counter starts at zero." }],
    },
  ],
  accessibility: { label: "Interactive clocked counter" },
  payload: { source: "./counter.json" },
};

const BIB_ENTRIES = [
  {
    id: "shannon1949",
    type: "article",
    authors: ["Shannon, Claude E."],
    title: "Communication in the Presence of Noise",
    issued: "1949",
    publisher: "Proceedings of the IRE",
  },
];

const FENCE = "```";

export const playgroundExamples: readonly PlaygroundExample[] = [
  {
    id: "math-tour",
    title: "Math tour",
    description:
      "Inline and display math, fractions, matrices, and symbol palette output.",
    markdown: String.raw`# A tour of Publisle math

Inline math keeps its structure: Euler's identity $e^{i\pi} + 1 = 0$ sits inside
this sentence without breaking the paragraph flow.

## Display equations

$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$

## Matrices and symbols

A rotation by angle $\theta$ in the plane:

$$
R(\theta) = \begin{pmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{pmatrix}
$$

Every palette symbol inserts real LaTeX: $\alpha$, $\nabla f$,
$\int_0^1 x^2 \, dx$, and $\mathbb{R}^n$ all round-trip through the portable
document.
`,
  },
  {
    id: "interactive-schematic",
    title: "Interactive schematic",
    description:
      "A typed interactive island with activation policy and static fallback.",
    markdown: `# Interactive islands, with fallbacks

:::publisle{type="publisle:interactive-schematic" schemaVersion="1"}
\`\`\`json
${JSON.stringify(SCHEMATIC_DATA, null, 2)}
\`\`\`
:::

The compiled artifact ships a manifest for the island plus the authored static
fallback. Print, PDF, and no-JS readers receive the fallback text; hosts with
the block definition attach the live counter on the declared activation.
`,
  },
  {
    id: "figures-tables",
    title: "Figures and tables",
    description:
      "Captions, alternative text, and header rows as document data.",
    markdown: String.raw`# Figures and tables

:::figure{src="https://publisle.xyz/favicon.svg" alt="Publisle brand mark"}
::caption
Figures carry alternative text and captions as first-class document data.
:::
:::

## Tables keep header structure

:::table{headerRows="1"}
| Block | Preserves |
| --- | --- |
| Headings | Labels and reading order |
| Figures | Alternative text and captions |
| Tables | Header rows and captions |
:::
::caption
Table captions travel with the data model, not the styling.
:::
:::
`,
  },
  {
    id: "callouts-structure",
    title: "Callouts and structure",
    description: "Callout variants, quotes, lists, code, and dividers.",
    markdown: `# Structure and emphasis

:::callout{variant="info" title="Note"}
Callouts carry a variant, an optional title, and rich children.
:::

:::callout{variant="warning" title="Careful"}
The variant is document data; each host styles it accessibly.
:::

> Block quotes stay quotable, with **inline emphasis** intact.

- Lists keep their items
- And their order
- Even across edits

1. Ordered lists work too
2. With the same guarantees

\`\`\`ts
// Code samples keep their language hint.
export const answer = 42;
\`\`\`

---

A divider closes the tour.
`,
  },
  {
    id: "diagrams-embeds",
    title: "Diagrams and embeds",
    description:
      "Mermaid diagrams and external embeds, both with static fallbacks.",
    markdown: `# Diagrams and embeds

:::diagram{engine="mermaid" alt="Document flows to portable, then to static HTML"}
\`\`\`mermaid
graph TD
  A[Document] --> B[Portable]
  B --> C[Static HTML]
\`\`\`
::caption
Diagram source is portable; each host renders it with its own engine.
:::
::fallback
Document, Portable, and Static HTML, connected in order.
:::
:::

:::embed{provider="youtube" resource="dQw4w9WgXcQ" title="Embedded video"}
::fallback
The embed ships a static fallback for print and no-JS readers.
:::
:::
`,
  },
  {
    id: "bibliography",
    title: "Bibliography",
    description: "CSL JSON entries validated at import time.",
    markdown: `# Bibliography entries

:::bibliography
\`\`\`json
[
  {
    "id": "shannon1949",
    "type": "article",
    "authors": ["Shannon, Claude E."],
    "title": "Communication in the Presence of Noise",
    "issued": "1949",
    "publisher": "Proceedings of the IRE"
  }
]
\`\`\`
:::

Entries are CSL JSON, validated at import. The research profile resolves and
formats them for journal exports; core readers list them as authored.
`,
  },
  {
    id: "full-article",
    title: "Full demo article",
    description:
      "Everything at once: sections, math, island, figure, table, callouts, bibliography.",
    markdown: String.raw`# Measuring a Clocked Counter

:::callout{variant="info" title="Abstract"}
A miniature article that exercises every core block in one document:
structured sections, inline and display mathematics, an interactive island
with a static fallback, a captioned figure and table, and a bibliography.
:::

## Model

The counter advances on each clock edge, so its value after $n$ edges is

$$
c(n) = c(0) + n \pmod{2^{8}}
$$

with reset mapping $c(n) \mapsto 0$. The increments relate as
$\Delta c \propto \nabla t$, and the state space is $\mathbb{Z}/256\mathbb{Z}$.

## Interactive measurement

:::publisle{type="publisle:interactive-schematic" schemaVersion="1"}
${FENCE}json
${JSON.stringify(SCHEMATIC_DATA, null, 2)}
${FENCE}
:::

:::callout{variant="warning" title="Print readers"}
The island above renders as its authored fallback in print and PDF targets.
:::

## Recorded runs

:::table{headerRows="1"}
| Run | Edges | Final value |
| --- | --- | --- |
| Cold start | 0 | 0 |
| After burst | 5 | 5 |
| After reset | 3 | 3 |
:::
::caption
Three runs of the counter under the model of Section Model.
:::
:::

## Summary

The document round-trips: every block here survives Markdown import,
preparation, and static compilation with its semantics intact.

:::bibliography
${FENCE}json
${JSON.stringify(BIB_ENTRIES, null, 2)}
${FENCE}
:::
`,
  },
];
