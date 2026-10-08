import { describe, expect, it, vi } from "vitest";
import { createRegistry, prepare } from "@publisle/core";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { createBlock, document } from "@publisle/schema";
import {
  fromMarkdown,
  toMarkdown,
  formatMarkdown,
  type MarkdownBlockCodec,
} from "../src/index.ts";
import { noticeCodec, noticeDefinition } from "./fixtures/notice-codec.ts";

const registry = createRegistry([noticeDefinition, ...coreBlockDefinitions]);
const codecs = [noticeCodec];
const fence = "`".repeat(3);
const interactive = (attributes = "", type = "demo:scene") =>
  `:::interactive{type="${type}" ${attributes}}\n${fence}publisle-payload\n{"value":42}\n${fence}\n:::\n`;

describe("native Markdown codecs and version resolution", () => {
  it("imports a v2-only authored plugin without invoking migrations or validation", () => {
    const definition = {
      ...noticeDefinition,
      migrations: [],
      schema: {
        parse: vi.fn(
          noticeDefinition.schema.parse.bind(noticeDefinition.schema),
        ),
      },
    };
    const currentRegistry = createRegistry([definition]);
    const imported = fromMarkdown(':::notice{message="Hello"}\n:::\n', {
      codecs,
      resolveSchemaVersion: (type) => currentRegistry.get(type)?.schemaVersion,
    });
    expect(imported.diagnostics).toEqual([]);
    expect(imported.document!.blocks[0]).toMatchObject({
      type: noticeCodec.type,
      schemaVersion: 2,
      data: { message: "Hello" },
    });
    expect(definition.schema.parse).not.toHaveBeenCalled();
    const prepared = prepare(imported.document!, { registry: currentRegistry });
    expect(prepared.diagnostics).toEqual([]);
    expect(prepared.document).toBeDefined();
    expect(definition.schema.parse).toHaveBeenCalledTimes(1);
  });

  it("uses host current versions before codec versions, and skips lookup for explicit versions", () => {
    const lookup = vi.fn(() => 3);
    const current = fromMarkdown(':::notice{message="Hello"}\n:::\n', {
      codecs,
      resolveSchemaVersion: lookup,
    });
    expect(current.document!.blocks[0]?.schemaVersion).toBe(3);
    expect(lookup).toHaveBeenCalledExactlyOnceWith(noticeCodec.type);
    lookup.mockClear();
    const explicit = fromMarkdown(
      ':::notice{message="Old" schemaVersion="1"}\n:::\n',
      { codecs, resolveSchemaVersion: lookup },
    );
    expect(explicit.document!.blocks[0]?.schemaVersion).toBe(1);
    expect(lookup).not.toHaveBeenCalled();
    expect(
      fromMarkdown(':::notice{message="Hello"}\n:::\n', { codecs }).document!
        .blocks[0]?.schemaVersion,
    ).toBe(2);
  });

  it("preserves explicit v1 data and migrates only during preparation", () => {
    const imported = fromMarkdown(
      ':::notice{message="Old" schemaVersion="1"}\n:::\n',
      { codecs },
    );
    const original = structuredClone(imported.document);
    expect(imported.document!.blocks[0]?.data).toEqual({ text: "Old" });
    const prepared = prepare(imported.document!, { registry });
    expect(prepared.document!.blocks[0]).toMatchObject({
      schemaVersion: 2,
      data: { message: "Old" },
    });
    expect(imported.document).toEqual(original);
    const exported = toMarkdown(imported.document!, { codecs });
    expect(exported.markdown).toContain('schemaVersion="1"');
    expect(
      fromMarkdown(exported.markdown!, { codecs }).document!.blocks[0]?.data,
    ).toEqual({ text: "Old" });
  });

  it("preserves explicit newer native versions and lets prepare reject unsupported versions", () => {
    const imported = fromMarkdown(
      ':::notice{message="Future" schemaVersion="9"}\n:::\n',
      { codecs },
    );
    expect(imported.diagnostics).toEqual([]);
    expect(imported.document!.blocks[0]?.schemaVersion).toBe(9);
    expect(prepare(imported.document!, { registry }).diagnostics[0]?.code).toBe(
      "unsupported-block-version",
    );
  });

  it("keeps generic archival versions and payloads independent of codecs/current-version lookup", () => {
    const block = createBlock({
      type: noticeCodec.type,
      schemaVersion: 1,
      data: { text: "Old", extra: [null, false, 12] },
    });
    const exported = toMarkdown(document({ blocks: [block] }));
    const decode = vi.fn(noticeCodec.decode.bind(noticeCodec));
    const lookup = vi.fn(() => 9);
    const imported = fromMarkdown(exported.markdown!, {
      codecs: [{ ...noticeCodec, decode }],
      resolveSchemaVersion: lookup,
    });
    expect(imported.diagnostics).toEqual([]);
    expect(imported.document!.blocks[0]).toMatchObject({
      schemaVersion: 1,
      data: block.data,
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
  });

  it.each(["strict", "warn", "fallback"] as const)(
    "round-trips a native custom block under %s and formats idempotently",
    (policy) => {
      const imported = fromMarkdown(
        ':::notice{message="**Literal** & quoted"}\n:::\n',
        { codecs },
      );
      const exported = toMarkdown(imported.document!, { codecs, policy });
      expect(exported.diagnostics).toEqual([]);
      expect(exported.markdown).toContain('schemaVersion="2"');
      const roundtrip = fromMarkdown(exported.markdown!, { codecs });
      expect(roundtrip.document!.blocks[0]).toMatchObject({
        type: noticeCodec.type,
        schemaVersion: 2,
        data: imported.document!.blocks[0]!.data,
      });
      expect(
        formatMarkdown(exported.markdown!, { codecs, policy }).markdown,
      ).toBe(exported.markdown);
    },
  );

  it("supports deliberate standard Markdown output with a semantic-loss warning", () => {
    const imported = fromMarkdown(':::notice{message="Hello"}\n:::\n', {
      codecs,
    });
    const result = toMarkdown(imported.document!, {
      codecs,
      policy: "standard",
    });
    expect(result.markdown).toBe("Notice: Hello\n");
    expect(result.diagnostics[0]?.code).toBe("extension-semantics-lost");
  });

  it.each(["strict", "warn", "fallback", "standard"] as const)(
    "handles thrown codec errors under %s without dropping payloads",
    (policy) => {
      const input = document({
        blocks: [
          createBlock({
            type: noticeCodec.type,
            schemaVersion: 2,
            data: { message: "Retain me", extra: [1, false] },
          }),
        ],
      });
      const badCodec = {
        ...noticeCodec,
        encode() {
          throw new Error("Encoder failed");
        },
      };
      const result = toMarkdown(input, { codecs: [badCodec], policy });
      expect(result.diagnostics[0]).toMatchObject({
        code: "markdown-codec-failed",
        level: policy === "strict" ? "error" : "warning",
        blockId: input.blocks[0]!.id,
      });
      if (policy === "strict") expect(result.markdown).toBeUndefined();
      else
        expect(
          fromMarkdown(result.markdown!).document!.blocks[0]?.data,
        ).toEqual(input.blocks[0]!.data);
    },
  );

  it.each(["strict", "warn", "fallback"] as const)(
    "handles codec opt-out under %s",
    (policy) => {
      const block = createBlock({
        type: noticeCodec.type,
        schemaVersion: 2,
        data: { other: "Retain me" },
      });
      const result = toMarkdown(document({ blocks: [block] }), {
        codecs,
        policy,
      });
      expect(result.diagnostics[0]?.code).toBe("unsupported-markdown-block");
      if (policy === "strict") expect(result.markdown).toBeUndefined();
      else
        expect(
          fromMarkdown(result.markdown!).document!.blocks[0]?.data,
        ).toEqual(block.data);
    },
  );

  it("reports failed decoding at original source locations", () => {
    const result = fromMarkdown("# Heading\n\n:::notice\n:::\n", {
      codecs,
      sourceName: "article.md",
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({
      code: "markdown-codec-failed",
      sourceLocation: { source: "article.md", line: 3, column: 1, offset: 11 },
    });
  });

  it("rejects non-JSON decoder data and malformed encoder nodes safely", () => {
    expect(
      fromMarkdown(":::notice\n:::\n", {
        codecs: [{ ...noticeCodec, decode: () => new Date() }],
      }).diagnostics[0]?.code,
    ).toBe("markdown-codec-failed");
    const input = document({
      blocks: [
        createBlock({
          type: noticeCodec.type,
          schemaVersion: 2,
          data: { message: "Hello" },
        }),
      ],
    });
    const badCodec = {
      ...noticeCodec,
      encode: () =>
        ({
          type: "containerDirective",
          name: "different",
          children: [],
        }) as const,
    } as unknown as MarkdownBlockCodec;
    expect(
      toMarkdown(input, { codecs: [badCodec], policy: "strict" }).diagnostics[0]
        ?.code,
    ).toBe("markdown-codec-failed");
    const result = toMarkdown(input, {
      codecs: [
        {
          ...noticeCodec,
          encode: (block) => noticeCodec.encode(block, { policy: "fallback" }),
        },
      ],
      policy: "standard",
    });
    expect(result.diagnostics[0]?.code).toBe("markdown-codec-failed");
  });

  it("preserves native raw source and generic plugin payloads when codecs are absent", () => {
    const source = ':::notice{message="Hello" schemaVersion="2"}\n:::\n';
    expect(fromMarkdown(source).document!.blocks[0]?.data).toEqual({
      value: source.trimEnd(),
      inline: false,
    });
    expect(
      prepare(fromMarkdown(source).document!, { registry }).document,
    ).toBeDefined();
    const block = createBlock({
      type: noticeCodec.type,
      schemaVersion: 2,
      data: { message: "Hello" },
    });
    expect(
      fromMarkdown(toMarkdown(document({ blocks: [block] })).markdown!)
        .document!.blocks[0]?.data,
    ).toEqual(block.data);
  });

  it("uses the current version for unversioned interactive extensions and preserves unknown payloads", () => {
    const resolved = fromMarkdown(interactive(), {
      resolveSchemaVersion: () => 2,
    });
    expect(resolved.diagnostics).toEqual([]);
    expect(resolved.document!.blocks[0]?.schemaVersion).toBe(2);
    const unknown = fromMarkdown(interactive());
    expect(unknown.document!.blocks[0]?.schemaVersion).toBe(1);
    expect(unknown.document!.blocks[0]?.data).toEqual({
      activation: "visible",
      payload: { value: 42 },
    });
    expect(unknown.diagnostics[0]?.code).toBe("unresolved-markdown-version");
    expect(
      fromMarkdown(interactive('schemaVersion="7"'), {
        resolveSchemaVersion: () => 2,
      }).document!.blocks[0]?.schemaVersion,
    ).toBe(7);
    expect(
      fromMarkdown(interactive("", "publisle:interactive-schematic")).document!
        .blocks[0]?.schemaVersion,
    ).toBe(2);
  });

  it.each(["0", "-1", "1.5", "bad"])(
    "rejects invalid explicit native versions %s",
    (schemaVersion) => {
      const result = fromMarkdown(
        `:::notice{message="Hello" schemaVersion="${schemaVersion}"}\n:::\n`,
        { codecs },
      );
      expect(result.document).toBeUndefined();
      expect(result.diagnostics[0]?.sourceLocation?.line).toBe(1);
    },
  );

  it("rejects invalid current-version lookup results without running the codec", () => {
    const decode = vi.fn(noticeCodec.decode.bind(noticeCodec));
    const result = fromMarkdown(':::notice{message="Hello"}\n:::\n', {
      codecs: [{ ...noticeCodec, decode }],
      resolveSchemaVersion: () => 0,
    });
    expect(result.document).toBeUndefined();
    expect(decode).not.toHaveBeenCalled();
  });

  it.each(
    [
      [noticeCodec, noticeCodec],
      [noticeCodec, { ...noticeCodec, type: "demo:other" as const }],
      [{ ...noticeCodec, directive: "figure" }],
      [{ ...noticeCodec, schemaVersion: 0 }],
    ].map((codecs) => ({ codecs })),
  )("rejects duplicate/invalid/reserved registrations", ({ codecs }) => {
    expect(fromMarkdown("# Heading", { codecs }).diagnostics[0]?.code).toBe(
      "invalid-markdown-codecs",
    );
    expect(
      toMarkdown(document({ blocks: [] }), { codecs }).diagnostics[0]?.code,
    ).toBe("invalid-markdown-codecs");
  });

  it("does not allow export codecs to mutate the source document", () => {
    const input = document({
      blocks: [
        createBlock({
          type: noticeCodec.type,
          schemaVersion: 2,
          data: { message: "Hello" },
        }),
      ],
    });
    const original = structuredClone(input);
    const codec = {
      ...noticeCodec,
      encode(block: Parameters<MarkdownBlockCodec["encode"]>[0]) {
        (block.data as { message: string }).message = "Changed";
        return noticeCodec.encode(block, {});
      },
    };
    toMarkdown(input, { codecs: [codec] });
    expect(input).toEqual(original);
  });
});
