import { describe, expect, it } from "vitest";
import {
  createBlock,
  document,
  canonicalizeJson,
  type JsonValue,
} from "@publisle/schema";
import { fromMarkdown, toMarkdown } from "../src/index.ts";
const source = () =>
  document({
    extensions: { "example:future": { unknown: [1, null, true] } },
    blocks: [
      createBlock({
        type: "unknown:scene",
        schemaVersion: 7,
        data: {
          source: "```\n:::future\n~~~\n::::",
          opaque: [null, 1, true],
          nested: { unrecognized: "preserved" },
        },
      }),
    ],
  });
describe("archival Markdown exchange grammar", () => {
  it("preserves complete identity and unknown payload/extension fields", () => {
    const input = source();
    const exported = toMarkdown(input, { policy: "archival" });
    expect(exported.diagnostics).toEqual([]);
    const imported = fromMarkdown(exported.markdown ?? "", {
      sourceName: "archive.md",
    });
    expect(imported.document).toEqual(input);
    expect(imported.sourceMap?.blocks[input.blocks[0]?.id ?? ""]?.source).toBe(
      "archive.md",
    );
    expect(
      toMarkdown(imported.document!, { policy: "archival" }).markdown,
    ).toBe(exported.markdown);
  });
  it.each(
    (
      [
        null,
        false,
        12.5,
        "literal **bold**",
        [1, null, "x"],
        { unknown: { future: true } },
      ] satisfies JsonValue[]
    ).map((payload) => [payload] as const),
  )("retains any JSON payload: %j", (payload) => {
    const input = document({
      blocks: [createBlock({ type: "unknown:json", data: payload })],
    });
    expect(
      fromMarkdown(toMarkdown(input, { policy: "archival" }).markdown ?? "")
        .document,
    ).toEqual(input);
  });
  it("preserves readable provenance and immutable pins without regenerating IDs", () => {
    const input = source();
    const digest = `sha256:${"a".repeat(64)}` as const;
    input.dependencies = [
      {
        type: "unknown:scene",
        schemaVersion: 7,
        id: `urn:publisle:contract:${digest}`,
        digest,
      },
    ];
    input.blocks[0]!.readable = {
      sourceDigest: digest,
      provenance: { kind: "authored" },
      content: {
        description: [
          {
            type: "paragraph",
            content: [{ type: "text", value: "Reading alternative" }],
          },
        ],
      },
    };
    expect(
      fromMarkdown(toMarkdown(input, { policy: "archival" }).markdown ?? "")
        .document,
    ).toEqual(input);
    expect(
      toMarkdown(input, { policy: "standard" }).diagnostics.some(
        (item) => item.code === "document-envelope-not-exported",
      ),
    ).toBe(true);
  });
  it("accepts CRLF, blank whitespace and alternate exact JSON fence markers", () => {
    const input = source();
    const markdown = (toMarkdown(input, { policy: "archival" }).markdown ?? "")
      .replace(/^~~~(publisle-[a-z]+)?$/gmu, "````$1")
      .replaceAll("\n", "\r\n");
    expect(fromMarkdown("\r\n " + "\r\n" + markdown).document).toEqual(input);
  });
  it.each([
    "::::publisle-document\n~~~publisle-manifest\n{}\n",
    "::::publisle-document\n~~~publisle-manifest\n[]\n~~~\n::::",
    '::::publisle-document\n~~~publisle-manifest\n{"schemaVersion":1,"blocks":[]}\n~~~\n::::',
  ])(
    "rejects malformed archival envelopes without falling back to ordinary Markdown",
    (input) => {
      const result = fromMarkdown(input);
      expect(result.document).toBeUndefined();
      expect(result.diagnostics[0]?.level).toBe("error");
    },
  );
  it("rejects trailing/nested directives and unsupported envelope fields instead of silently losing data", () => {
    const input = source();
    const markdown = toMarkdown(input, { policy: "archival" }).markdown ?? "";
    expect(
      fromMarkdown(markdown + ":::unknown\nbody\n:::\n").document,
    ).toBeUndefined();
    const unsupported = { ...input, futureEnvelope: { meaning: true } };
    expect(
      toMarkdown(unsupported, { policy: "archival" }).markdown,
    ).toBeUndefined();
    expect(canonicalizeJson(input)).not.toContain("futureEnvelope");
  });
});
