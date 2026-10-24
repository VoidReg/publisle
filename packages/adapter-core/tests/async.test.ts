import { expect, it, vi } from "vitest";
import { paragraph, math, coreBlockDefinitions } from "@publisle/blocks-core";
import { createRegistry, prepare } from "@publisle/core";
import { document } from "@publisle/schema";
const loaded = vi.hoisted(() => vi.fn());
vi.mock("katex", async (original) => {
  loaded();
  return original();
});
import { compilePublicationAsync } from "../src/async.ts";
it("defers KaTeX until a document needs math and keeps text rendering intact", async () => {
  const registry = createRegistry(coreBlockDefinitions);
  const text = prepare(
    document({
      blocks: [
        paragraph({ content: [{ type: "text", value: "Plain prose" }] }),
      ],
    }),
    { registry },
  ).document!;
  expect((await compilePublicationAsync(text)).html).toContain("Plain prose");
  expect(loaded).not.toHaveBeenCalled();
  const expression = prepare(
    document({ blocks: [math({ value: "x+1", display: true })] }),
    { registry },
  ).document!;
  expect((await compilePublicationAsync(expression)).html).toContain("katex");
  expect(loaded).toHaveBeenCalledTimes(1);
  await compilePublicationAsync(expression);
  expect(loaded).toHaveBeenCalledTimes(1);
});
