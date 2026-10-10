import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateInteractiveEnvelope } from "../src/index.ts";
import { interactiveSchematicDefinition } from "../../../blocks/technical/src/index.ts";

const fixtures = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url));

interface MigrationCase {
  name: string;
  type: string;
  from: number;
  to: number;
  input: unknown;
  expected: unknown;
}

describe("portable built-in migrations", () => {
  it("matches the shared migration fixtures exactly", async () => {
    const fixture = JSON.parse(
      await readFile(
        fixtures("../../contracts/fixtures/migrations.json"),
        "utf8",
      ),
    ) as { cases: MigrationCase[] };
    for (const migration of fixture.cases) {
      // The migration passes through non-objects untouched (case 5 asserts this).
      const output = migrateInteractiveEnvelope(
        structuredClone(migration.input) as never,
      );
      expect(output, migration.name).toEqual(migration.expected);
    }
  });

  it("registers exactly the schematic v1→2 migration on the definition", () => {
    expect(interactiveSchematicDefinition.schemaVersion).toBe(2);
    expect(
      interactiveSchematicDefinition.migrations?.map(
        (migration) => migration.from,
      ),
    ).toEqual([1]);
  });
});
