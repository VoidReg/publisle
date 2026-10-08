import { describe, expect, it, vi } from "vitest";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { createBlock, type Document } from "@publisle/schema";
import {
  createRegistry,
  prepare,
  type DocumentMigration,
} from "../src/index.ts";

// Only this test module targets a hypothetical v3 envelope; production remains v1.
vi.mock("@publisle/schema", async (original) => ({
  ...(await original<typeof import("@publisle/schema")>()),
  DOCUMENT_SCHEMA_VERSION: 3,
}));

const registry = createRegistry(coreBlockDefinitions);
const source = (): Document => ({
  schemaVersion: 1,
  metadata: { title: "Original" },
  blocks: [
    createBlock({
      type: "publisle:paragraph",
      data: { content: [{ type: "text", value: "Body" }] },
    }),
  ],
});
const migrations: readonly DocumentMigration[] = [
  {
    from: 1,
    migrate(doc) {
      if (doc.metadata) doc.metadata.title = "Migrated";
      return { ...doc, schemaVersion: 2 };
    },
  },
  {
    from: 2,
    migrate(doc) {
      return { ...doc, schemaVersion: 3 };
    },
  },
];

describe("ordered document-envelope migrations", () => {
  it("runs before block validation, records the current version, and preserves the persisted source", () => {
    const doc = source();
    doc.blocks[0] = createBlock({
      type: "publisle:heading",
      data: { level: 99, content: [] },
    });
    const original = structuredClone(doc);
    const steps = [
      migrations[0]!,
      {
        from: 2,
        migrate(snapshot: Parameters<DocumentMigration["migrate"]>[0]) {
          snapshot.blocks[0]!.data = {
            level: 1,
            content: [{ type: "text", value: "Fixed before validation" }],
          };
          return { ...snapshot, schemaVersion: 3 };
        },
      },
    ];
    const result = prepare(doc, { registry, documentMigrations: steps });
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toMatchObject({
      schemaVersion: 3,
      metadata: { title: "Migrated" },
      blocks: [{ id: doc.blocks[0]!.id, data: { level: 1 } }],
    });
    expect(doc).toEqual(original);
    expect(
      prepare(doc, { registry, documentMigrations: steps }).document
        ?.cacheIdentity,
    ).toBe(result.document?.cacheIdentity);
  });

  it("does not invoke migrations when the envelope is current", () => {
    const migrate = vi.fn(() => {
      throw new Error("Should not run");
    });
    expect(
      prepare(
        { ...source(), schemaVersion: 3 },
        { registry, documentMigrations: [{ from: 1, migrate }] },
      ).document,
    ).toBeDefined();
    expect(migrate).not.toHaveBeenCalled();
  });

  it("reports a missing step at the original document location", () => {
    const result = prepare(source(), {
      registry,
      documentMigrations: [migrations[0]!],
      sourceMap: {
        document: { source: "old.json", line: 1, column: 1, offset: 0 },
        blocks: {},
      },
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "document-migration-failed",
        sourceLocation: { source: "old.json", line: 1, column: 1, offset: 0 },
      }),
    ]);
    expect(result.diagnostics[0]?.message).toContain("version 2");
  });

  it.each([0, -1, 1.5, 4])(
    "rejects invalid or unsupported document version %s",
    (schemaVersion) => {
      const result = prepare({ ...source(), schemaVersion }, { registry });
      expect(result.document).toBeUndefined();
      expect(result.diagnostics[0]?.code).toBe("unsupported-document-version");
    },
  );

  it.each([
    {
      name: "throw",
      migrate: () => {
        throw new Error("Broken migration");
      },
    },
    {
      name: "bad envelope",
      migrate: () => ({ schemaVersion: 2, blocks: "not an array" }),
    },
    {
      name: "wrong version",
      migrate: (doc: Parameters<DocumentMigration["migrate"]>[0]) => doc,
    },
  ])("reports $name as a document migration failure", ({ migrate }) => {
    const result = prepare(source(), {
      registry,
      documentMigrations: [{ from: 1, migrate }],
    });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe("document-migration-failed");
  });

  it("rejects duplicate document migration registrations", () => {
    expect(
      prepare(source(), {
        registry,
        documentMigrations: [migrations[0]!, migrations[0]!],
      }).diagnostics[0]?.code,
    ).toBe("document-migration-failed");
  });
});
