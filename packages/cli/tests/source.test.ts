import { describe, expect, it } from "vitest";
import { createBlock, document, parseDocument } from "@publisle/schema";
import { coreBlockDefinitions, paragraph } from "@publisle/blocks-core";
import { createRegistry } from "@publisle/core";
import { fromMarkdown } from "@publisle/markdown";
import { processSource, type CliConfig } from "../src/index.ts";
import host from "./fixtures/host.ts";
import { noticeCodec } from "../../markdown/tests/fixtures/notice-codec.ts";

const input = document({
  blocks: [
    createBlock({
      type: "demo:notice",
      schemaVersion: 1,
      data: { text: "Legacy" },
    }),
  ],
});
const source = JSON.stringify(input);
const operation = {
  command: "upgrade",
  format: "json",
  sourceName: "article.json",
  config: host,
} as const;

describe("CLI source operations", () => {
  it("uses public preparation to migrate JSON without serializing prepared flags or plans", () => {
    const result = processSource(source, operation);
    expect(result.diagnostics).toEqual([]);
    const raw: unknown = JSON.parse(result.output ?? "null");
    const upgraded = parseDocument(raw);
    expect(upgraded.blocks[0]).toEqual({
      ...input.blocks[0],
      schemaVersion: 2,
      data: { message: "Legacy" },
    });
    expect(raw).not.toHaveProperty("cacheIdentity");
    expect(upgraded.blocks[0]).not.toHaveProperty("prepared");
    expect(processSource(result.output ?? "", operation).output).toBe(
      result.output,
    );
    expect(JSON.stringify(input)).toBe(source);
  });

  it("migrates native Markdown with host codec, preserving metadata and upgraded semantics", () => {
    const markdown =
      '---\ntitle: Test\n---\n\n:::notice{schemaVersion="1" message="Legacy"}\n:::\n';
    const result = processSource(markdown, {
      ...operation,
      format: "markdown",
    });
    expect(result.output).toContain('schemaVersion="2"');
    expect(result.diagnostics.some(({ level }) => level === "error")).toBe(
      false,
    );
    const imported = fromMarkdown(result.output ?? "", {
      codecs: host.markdown.codecs,
    });
    expect(imported.document?.metadata?.title).toBe("Test");
    expect(imported.document?.blocks[0]).toMatchObject({
      schemaVersion: 2,
      data: { message: "Legacy" },
    });
    expect(
      processSource(result.output ?? "", { ...operation, format: "markdown" })
        .output,
    ).toBe(result.output);
  });

  it("rejects unavailable plugins during validation but preserves arbitrary JSON payload/version/ID during upgrade", () => {
    const unknown = document({
      blocks: [
        createBlock({
          type: "host:unknown",
          schemaVersion: 7,
          data: {
            scene: { nodes: [1, { arbitrary: true }] },
            source: "scene.json",
          },
        }),
      ],
    });
    const text = JSON.stringify(unknown);
    expect(
      processSource(text, { ...operation, command: "validate", config: {} })
        .diagnostics,
    ).toContainEqual(
      expect.objectContaining({ level: "error", code: "unknown-block-type" }),
    );
    const result = processSource(text, { ...operation, config: {} });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ level: "warning", code: "unknown-block-type" }),
    );
    const raw: unknown = JSON.parse(result.output ?? "null");
    expect(parseDocument(raw)).toEqual(unknown);
  });

  it("preserves unsupported plugin data in generic archival Markdown", () => {
    const text =
      ':::publisle{type="host:unknown" schemaVersion="7" id="00000000-0000-4000-a000-000000000001"}\n```json\n{"arbitrary":[1,2,3]}\n```\n:::\n';
    const imported = fromMarkdown(text);
    expect(imported.document).toBeDefined();
    const result = processSource(text, {
      ...operation,
      format: "markdown",
      config: {},
    });
    expect(result.output).toBeDefined();
    expect(fromMarkdown(result.output ?? "").document).toEqual(
      imported.document,
    );
  });

  it("reports failed migrations and never produces partial upgraded output", () => {
    const failed = processSource(
      JSON.stringify({
        ...input,
        blocks: [{ ...input.blocks[0], data: { notText: true } }],
      }),
      operation,
    );
    expect(failed.output).toBeUndefined();
    expect(failed.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "migration-failed",
        sourceLocation: { source: "article.json", line: 1, column: 1 },
      }),
    );
  });

  it("rejects newer document and block versions", () => {
    const newerDocument = processSource(
      '{"schemaVersion":2,"blocks":[]}',
      operation,
    );
    expect(newerDocument.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unsupported-document-version" }),
    );
    const newerBlock = processSource(
      JSON.stringify({
        ...input,
        blocks: [{ ...input.blocks[0], schemaVersion: 99 }],
      }),
      operation,
    );
    expect(newerBlock.output).toBeUndefined();
    expect(newerBlock.diagnostics.some(({ level }) => level === "error")).toBe(
      true,
    );
  });

  it("does not silently discard extra source fields outside the portable envelope", () => {
    const result = processSource(
      JSON.stringify({ ...input, hostData: { important: true } }),
      operation,
    );
    expect(result.output).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unmodeled-source-fields" }),
    );
  });

  it("reports normalization changes at an unchanged version for preview review", () => {
    const result = processSource(
      JSON.stringify(
        document({
          blocks: [
            createBlock({
              type: "demo:notice",
              schemaVersion: 2,
              data: {
                message: "Kept",
                hostExtra: "discarded by registered parser",
              },
            }),
          ],
        }),
      ),
      operation,
    );
    expect(result.output).toBeDefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "block-data-normalized",
        level: "warning",
      }),
    );
  });

  it("refuses lossy host Markdown encoding rather than writing its output", () => {
    const lossy: CliConfig = {
      ...host,
      markdown: {
        codecs: [
          {
            ...noticeCodec,
            encode: () => ({
              type: "containerDirective",
              name: "notice",
              attributes: { message: "Dropped original" },
              children: [],
            }),
          },
        ],
      },
    };
    const result = processSource(':::notice{message="Important"}\n:::\n', {
      ...operation,
      format: "markdown",
      config: lossy,
    });
    expect(result.output).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "markdown-roundtrip-loss" }),
    );
  });

  it("honors explicit unknown-block policy during upgrade", () => {
    const result = processSource(source, {
      ...operation,
      config: {
        prepare: {
          registry: createRegistry(coreBlockDefinitions),
          unknownBlocks: "error",
        },
      },
    });
    expect(result.output).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unknown-block-type", level: "error" }),
    );
  });

  it("validates invalid registered payloads and reports actionable Markdown locations", () => {
    const bad = document({
      blocks: [
        createBlock({
          type: "publisle:heading",
          data: { level: 0, content: [] },
        }),
      ],
    });
    expect(
      processSource(JSON.stringify(bad), {
        ...operation,
        command: "validate",
        config: {},
      }).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: "invalid-block-data" }));
    const result = processSource(
      '\n\n:::notice{message="Legacy" schemaVersion="99"}\n:::\n',
      { ...operation, command: "validate", format: "markdown" },
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "error",
        sourceLocation: expect.objectContaining({
          source: "article.json",
          line: 3,
        }) as unknown,
      }),
    );
  });

  it("warns when native Markdown regeneration changes block identity", () => {
    const result = processSource("# Heading\n\nText", {
      ...operation,
      format: "markdown",
      config: {},
    });
    expect(result.output).toBeDefined();
    // Explicit IDs in archival blocks cannot be represented by native headings.
    const changed = processSource(
      ':::publisle{type="publisle:heading" schemaVersion="1" id="00000000-0000-4000-a000-000000000001"}\n```json\n{"level":1,"content":[{"type":"text","value":"Heading"}]}\n```\n:::\n',
      {
        ...operation,
        format: "markdown",
        config: {},
      },
    );
    expect(changed.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "markdown-block-ids-changed",
        level: "warning",
      }),
    );
  });

  it("validation does not serialize or change an input document", () => {
    const original = JSON.stringify(
      document({
        blocks: [paragraph({ content: [{ type: "text", value: "Hello" }] })],
      }),
    );
    const result = processSource(original, {
      ...operation,
      command: "validate",
      config: {},
    });
    expect(result).toEqual({ diagnostics: [] });
  });
});
