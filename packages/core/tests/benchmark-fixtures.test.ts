import { describe, expect, it } from "vitest";
import {
  contractGraph,
  corpus,
  datasetArticle,
  distinctArticle,
  islandArticle,
  matchedMdxSource,
  matchedStaticHtml,
  repeatedArticle,
  staticArticle,
  walkContractGraph,
} from "../../../tools/benchmarks/fixtures.ts";

describe("matched baseline fixtures", () => {
  it("builds the agreed workload sizes", () => {
    expect(staticArticle().blocks).toHaveLength(1000);
    expect(islandArticle().blocks).toHaveLength(6);
    expect(repeatedArticle().blocks).toHaveLength(100);
    expect(distinctArticle().blocks).toHaveLength(20);
    expect(
      new Set(distinctArticle().blocks.map((block) => block.type)).size,
    ).toBe(20);
    expect(
      new Set(repeatedArticle().blocks.map((block) => block.type)).size,
    ).toBe(1);
    const dataset = datasetArticle().blocks[1]?.data as { value: string };
    expect(dataset.value).toHaveLength(100_000);
    expect(corpus()).toHaveLength(10_000);
    expect(walkContractGraph(contractGraph())).toBe(1000);
  });

  it("keeps the static HTML and MDX source on the same sentences", () => {
    const sentence = "Block 0 explains the same matched sentence.";
    expect(matchedStaticHtml()).toContain(`<p>${sentence}</p>`);
    expect(matchedMdxSource().split("\n")).toHaveLength(1000);
    expect(matchedMdxSource()).toContain(sentence);
  });
});
