import { code, paragraph } from "../../blocks/core/src/index.ts";
import { interactiveSchematic } from "../../blocks/technical/src/index.ts";
import { createBlock, document } from "../../packages/schema/src/index.ts";

const sentence = (index: number) =>
  `Block ${String(index)} explains the same matched sentence.`;

export function staticArticle(count = 1000) {
  return document({
    metadata: { title: "Matched static article" },
    blocks: Array.from({ length: count }, (_, index) =>
      paragraph({ content: [{ type: "text", value: sentence(index) }] }),
    ),
  });
}

function island(index: number) {
  return interactiveSchematic({
    activation: "interaction",
    accessibility: { label: `Sample island ${String(index)}` },
    content: {
      title: [{ type: "text", value: `Sample island ${String(index)}` }],
      description: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              value: "A lightweight island with an authored explanation.",
            },
          ],
        },
      ],
      instructions: [
        {
          type: "paragraph",
          content: [{ type: "text", value: "Activate to mount the host." }],
        },
      ],
    },
    fallback: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            value: `Island ${String(index)} remains readable without JavaScript.`,
          },
        ],
      },
    ],
    payload: { source: `./island-${String(index)}.json` },
  });
}

export function islandArticle(count = 5) {
  return document({
    metadata: { title: "Matched island article" },
    blocks: [
      paragraph({
        content: [{ type: "text", value: "Five lightweight islands." }],
      }),
      ...Array.from({ length: count }, (_, index) => island(index)),
    ],
  });
}

export function repeatedArticle(count = 100) {
  return document({
    metadata: { title: "Repeated implementation" },
    blocks: Array.from({ length: count }, () => island(0)),
  });
}

export function datasetArticle(bytes = 100_000) {
  return document({
    metadata: { title: "Dataset-backed article" },
    blocks: [
      paragraph({
        content: [
          {
            type: "text",
            value: "The dataset is inline text, not a fetched file.",
          },
        ],
      }),
      code({ language: "text", value: "a".repeat(bytes) }),
    ],
  });
}

export function distinctArticle(count = 20) {
  return document({
    metadata: { title: "Distinct implementations" },
    blocks: Array.from({ length: count }, (_, index) =>
      createBlock({
        type: `bench:impl-${String(index)}`,
        data: {
          activation: "visible",
          accessibility: { label: `Implementation ${String(index)}` },
          content: {
            description: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    value: `Distinct host implementation ${String(index)}.`,
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
                  value: `Implementation ${String(index)} has a static explanation.`,
                },
              ],
            },
          ],
          payload: { n: index },
        },
      }),
    ),
  });
}

export function corpus(count = 10_000) {
  return Array.from({ length: count }, (_, index) =>
    document({
      blocks: [
        paragraph({ content: [{ type: "text", value: sentence(index) }] }),
      ],
    }),
  );
}

export interface ContractNode {
  readonly id: string;
  readonly digest: `sha256:${string}`;
  readonly dependencies: readonly number[];
}

/** In-memory identity graph. This does not compile JSON Schemas. */
export function contractGraph(count = 1000): ContractNode[] {
  return Array.from({ length: count }, (_, index) => {
    const digest = `sha256:${index.toString(16).padStart(64, "0")}` as const;
    return {
      id: `urn:publisle:contract:${digest}`,
      digest,
      dependencies: index === 0 ? [] : [0],
    };
  });
}

export function walkContractGraph(nodes: readonly ContractNode[]): number {
  let seen = 0;
  for (const node of nodes) {
    if (!/^sha256:[0-9a-f]{64}$/u.test(node.digest))
      throw new Error("Invalid contract digest");
    for (const dependency of node.dependencies) {
      const target = nodes[dependency];
      if (!target) throw new Error("Missing contract dependency");
    }
    seen += 1;
  }
  return seen;
}

export function matchedStaticHtml(count = 1000): string {
  const body = Array.from(
    { length: count },
    (_, index) => `<p>${sentence(index)}</p>`,
  ).join("");
  return `<div class="publisle-document">${body}</div>`;
}

/** Source text only. This workspace has no MDX compiler. */
export function matchedMdxSource(count = 1000): string {
  return Array.from(
    { length: count },
    (_, index) => `<p>${sentence(index)}</p>`,
  ).join("\n");
}
