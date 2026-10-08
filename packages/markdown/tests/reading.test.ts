import { describe, expect, it } from "vitest";
import { parseDocument } from "@publisle/schema";
import { toReadingMarkdown } from "../src/index.ts";
import { getBlockSourceDigest } from "../../core/src/index.ts";
import { fromMarkdown as parseMarkdown } from "mdast-util-from-markdown";

const source = () =>
  parseDocument({
    schemaVersion: 1,
    blocks: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        type: "publisle:paragraph",
        schemaVersion: 1,
        data: {
          content: [
            {
              type: "strong",
              children: [{ type: "text", value: "Actual bold prose" }],
            },
          ],
        },
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        type: "custom:scene",
        schemaVersion: 1,
        data: {
          payload: { privateBulk: Array.from({ length: 2000 }, (_, i) => i) },
          content: {
            purpose: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    value:
                      "Authored scene purpose, not an invented computation.",
                  },
                ],
              },
            ],
          },
        },
      },
    ],
  });

describe("reading Markdown projection", () => {
  it("keeps Markdown syntax and authored prose, with exact source links instead of payload dumps", () => {
    const document = source();
    const before = JSON.stringify(document);
    const result = toReadingMarkdown(document);
    expect(result.markdown).toContain("**Actual bold prose**");
    expect(result.markdown).toContain("Authored scene purpose");
    expect(result.markdown).toContain("/blocks/1");
    const links = parseMarkdown(result.markdown ?? "")
      .children.flatMap((node) =>
        node.type === "paragraph" ? node.children : [],
      )
      .filter((node) => node.type === "link")
      .map((node) => node.url);
    expect(links).toHaveLength(2);
    expect(links[1]).toMatch(
      /^urn:publisle:source:sha256:[0-9a-f]{64}#\/blocks\/1$/u,
    );
    expect(result.markdown).toContain("not a round trip");
    expect(result.markdown).not.toContain("privateBulk");
    expect(result.markdown).not.toContain("publisle-envelope");
    expect(JSON.stringify(document)).toBe(before);
  });

  it("reports missing and stale explanations instead of presenting them as current authored facts", () => {
    const document = source();
    const block = document.blocks[1];
    if (!block) throw new Error("Missing fixture");
    block.readable = {
      sourceDigest: "sha256:" + "0".repeat(64),
      provenance: { kind: "authored" },
      content: {
        purpose: [
          {
            type: "paragraph",
            content: [{ type: "text", value: "STALE_SENTINEL" }],
          },
        ],
      },
    };
    const stale = toReadingMarkdown(document);
    expect(stale.markdown).not.toContain("STALE_SENTINEL");
    expect(stale.diagnostics).toMatchObject([
      { code: "unresolved-reading-explanation" },
    ]);
    block.readable = {
      ...block.readable,
      sourceDigest: getBlockSourceDigest(block),
      provenance: {
        kind: "generated",
        generator: "unverified-generator",
        version: "beta",
        source: "host",
      },
    };
    expect(toReadingMarkdown(document).markdown).toContain(
      "not independently verified",
    );
  });
});
