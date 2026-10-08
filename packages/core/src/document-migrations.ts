import {
  SchemaParseError,
  parseDocument,
  type Block,
  type BlockType,
  type Document,
} from "@publisle/schema";
import type { DocumentMigration } from "./types.ts";

/** Internal target argument permits future-version fixtures without changing the v1 wire format. */
export function migrateDocument(
  source: Document<Block<BlockType, unknown>>,
  migrations: readonly DocumentMigration[],
  target: number,
): Document<Block<BlockType, unknown>> {
  if (!Number.isInteger(source.schemaVersion) || source.schemaVersion < 1) {
    throw new SchemaParseError(
      "unsupported-document-version",
      "Document schema version must be a positive integer.",
    );
  }
  if (source.schemaVersion > target) {
    throw new SchemaParseError(
      "unsupported-document-version",
      `Document schema version ${source.schemaVersion} is not supported.`,
    );
  }
  const steps = new Map<number, DocumentMigration>();
  for (const migration of migrations) {
    if (
      !Number.isInteger(migration.from) ||
      migration.from < 1 ||
      steps.has(migration.from)
    ) {
      throw new SchemaParseError(
        "document-migration-failed",
        `Invalid or duplicate document migration from ${migration.from}.`,
      );
    }
    steps.set(migration.from, migration);
  }
  let current = source;
  while (current.schemaVersion < target) {
    const step = steps.get(current.schemaVersion);
    if (!step)
      throw new SchemaParseError(
        "document-migration-failed",
        `No document migration from schema version ${current.schemaVersion}.`,
      );
    const nextVersion = current.schemaVersion + 1;
    try {
      const next = parseDocument(step.migrate(structuredClone(current)));
      if (next.schemaVersion !== nextVersion)
        throw new Error(
          `Document migration must produce schema version ${nextVersion}.`,
        );
      current = next;
    } catch (error) {
      throw new SchemaParseError(
        "document-migration-failed",
        `Document migration from schema version ${current.schemaVersion} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return current;
}
