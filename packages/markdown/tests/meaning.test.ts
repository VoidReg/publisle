import { describe, expect, it } from "vitest";
import { createBlock, document } from "@publisle/schema";
import { getBlockSourceDigest } from "../../core/src/index.ts";
import { fromMarkdown, toMarkdown } from "../src/index.ts";
import fixture from "../../contracts/fixtures/meaning.json" with { type: "json" };

describe("interactive instance explanation exchange", () => {
  const paragraph = (value: string) => ({
    type: "paragraph",
    content: [{ type: "text", value }],
  });
  const block = createBlock({
    type: "host:wave",
    data: {
      activation: "visible",
      ...fixture.example.data,
      content: {
        ...fixture.example.data.content,
        instructions: [paragraph("Adjust the frequency.")],
        assumptions: [paragraph("Assume a periodic signal.")],
        fallback: [
          paragraph("An authored fallback in the shared content object."),
        ],
      },
    },
  });
  it("round-trips every shared rich slot and named preset association", () => {
    const exported = toMarkdown(document({ blocks: [block] }), {
      policy: "fallback",
    });
    expect(exported.diagnostics).toEqual([]);
    const imported = fromMarkdown(exported.markdown ?? "");
    expect(imported.diagnostics).toEqual([]);
    expect(imported.document?.blocks[0]).toEqual(block);
    expect(exported.markdown).toContain("publisle-presets");
    expect(exported.markdown).toContain("content-fallback");
  });
  it("retains authored prose under standard Markdown while diagnosing lost interaction", () => {
    const exported = toMarkdown(document({ blocks: [block] }), {
      policy: "standard",
    });
    expect(exported.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "interactive-behavior-lost",
    ]);
    for (const prose of [
      "Compare a wave",
      "Assume a periodic signal",
      "Restore the authored starting values",
      "authored fallback",
    ])
      expect(exported.markdown).toContain(prose);
  });
  it("reports sidecar loss explicitly until archival envelopes are implemented", () => {
    const readable = {
      sourceDigest: getBlockSourceDigest(block),
      provenance: { kind: "authored" as const },
      binding: "/content",
    };
    expect(
      toMarkdown(document({ blocks: [{ ...block, readable }] })).diagnostics,
    ).toContainEqual(
      expect.objectContaining({
        code: "readable-representation-not-exported",
        blockId: block.id,
      }),
    );
    expect(block).not.toHaveProperty("readable");
  });
  it("rejects malformed and duplicate-id preset associations at a strict JSON boundary", () => {
    const fence = "`".repeat(3);
    for (const json of [
      '[{"id":"x","id":"y"}]',
      '[{"id":"x"},{"id":"x"}]',
      '{"id":"not-an-array"}',
    ]) {
      const result = fromMarkdown(
        `:::interactive{type="host:wave"}\n${fence}publisle-presets\n${json}\n${fence}\n${fence}publisle-payload\n{}\n${fence}\n:::\n`,
      );
      expect(result.document).toBeUndefined();
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "invalid-interactive-directive",
          level: "error",
        }),
      );
    }
  });
});
