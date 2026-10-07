import { describe, expect, it } from "vitest";

import {
  createBlock,
  DOCUMENT_SCHEMA_VERSION,
  document,
  parseDocument,
  parseIsoDateTime,
  SchemaParseError,
} from "../src/index.ts";

function expectSchemaError(run: () => unknown, code: string): void {
  try {
    run();
    expect.unreachable("expected SchemaParseError");
  } catch (error) {
    expect(error).toBeInstanceOf(SchemaParseError);
    expect(error).toMatchObject({ code });
  }
}

describe("document", () => {
  it("sets the envelope schema version and copies blocks", () => {
    const heading = createBlock({
      type: "publisle:heading",
      data: { level: 1, text: "Digital Timing" },
    });
    const article = document({
      metadata: { title: "Digital Timing" },
      blocks: [heading],
    });

    expect(article.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
    expect(article.metadata).toEqual({ title: "Digital Timing" });
    expect(article.blocks).toEqual([heading]);
  });

  it("omits metadata when the author does not pass it", () => {
    const article = document({
      blocks: [],
    });

    expect(article).toEqual({
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      blocks: [],
    });
    expect("metadata" in article).toBe(false);
  });
});

describe("parseDocument", () => {
  it("round-trips a built document through JSON", () => {
    const article = document({
      metadata: {
        title: "Digital Timing",
        publishedAt: parseIsoDateTime("2026-09-20T00:00:00Z"),
      },
      blocks: [
        createBlock({
          type: "publisle:heading",
          data: { level: 1, text: "Digital Timing" },
        }),
      ],
    });

    const parsed = parseDocument(JSON.parse(JSON.stringify(article)));

    expect(parsed.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
    expect(parsed.metadata?.title).toBe("Digital Timing");
    expect(parsed.metadata?.publishedAt).toBe("2026-09-20T00:00:00Z");
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0]?.type).toBe("publisle:heading");
  });

  it("rejects a document without blocks", () => {
    expectSchemaError(
      () => parseDocument({ schemaVersion: 1 }),
      "invalid-document",
    );
  });

  it("rejects invalid publication dates", () => {
    expectSchemaError(
      () =>
        parseDocument({
          schemaVersion: 1,
          metadata: { publishedAt: "yesterday" },
          blocks: [],
        }),
      "invalid-iso-date-time",
    );
  });
});
