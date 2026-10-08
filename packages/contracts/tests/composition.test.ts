import { beforeAll, describe, expect, it } from "vitest";
import { defineSchemaBlock } from "../../block-sdk/src/index.ts";
import { createRegistry } from "../../core/src/index.ts";
import { parseDocument, type SemanticDeclaration } from "@publisle/schema";
import {
  BETA_SCHEMAS,
  BETA_SCHEMA_DEPENDENCIES,
  lockDocument,
  exportSemanticDocument,
  validateStructure,
  validateBlockContract,
  createSnapshotSchema,
  validateSnapshot,
} from "../src/index.ts";
import fixture from "../fixtures/composition.json" with { type: "json" };
import counter from "../fixtures/portable-counter.json" with { type: "json" };

describe("sealed bounded composition declarations", () => {
  let locked: Awaited<ReturnType<typeof lockDocument>>;
  beforeAll(async () => {
    const definition = defineSchemaBlock({
      type: "example:bounded-control",
      schemaVersion: 1,
      semantics: fixture.semantics as SemanticDeclaration,
      contract: {
        ...counter,
        dataSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          $id: "urn:example:bounded-control",
          type: "object",
          properties: { value: { type: "number" }, mode: { type: "string" } },
          required: ["value", "mode"],
          additionalProperties: false,
        },
        documentation: {
          ...counter.documentation,
          validExamples: [{ input: fixture.data, output: fixture.data }],
          invalidExamples: [{ input: null, diagnostic: "invalid-data" }],
        },
      },
    });
    locked = await lockDocument(
      parseDocument({
        schemaVersion: 1,
        blocks: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            type: definition.type,
            schemaVersion: 1,
            data: fixture.data,
          },
        ],
      }),
      createRegistry([definition]),
    );
  }, 30_000);
  it("publishes closed wire shapes and rejects unsupported executable additions", () => {
    expect(
      validateStructure(
        fixture.semantics,
        BETA_SCHEMAS.semantics,
        BETA_SCHEMA_DEPENDENCIES.filter(
          (schema) => schema !== BETA_SCHEMAS.semantics,
        ),
      ).valid,
    ).toBe(true);
    expect(
      validateStructure(
        {
          ...fixture.semantics,
          composition: {
            ...fixture.semantics.composition,
            evaluate: "arbitrary source",
          },
        },
        BETA_SCHEMAS.semantics,
        BETA_SCHEMA_DEPENDENCIES.filter(
          (schema) => schema !== BETA_SCHEMAS.semantics,
        ),
      ).valid,
    ).toBe(false);
  });
  it("exports independent snapshot schemas with exact revisions and only shareable writable fields", () => {
    const target = {
      documentDigest: `sha256:${"a".repeat(64)}`,
      contractDigest: `sha256:${"b".repeat(64)}`,
      blockId: "example",
    };
    const schema = createSnapshotSchema(
      fixture.semantics.composition as NonNullable<
        SemanticDeclaration["composition"]
      >,
      target,
    );
    const snapshot = {
      profile: "urn:publisle:snapshot:beta",
      ...target,
      state: { value: 3 },
    };
    expect(validateSnapshot(snapshot, schema).valid).toBe(true);
    expect(
      validateSnapshot({ ...snapshot, state: { value: 11 } }, schema).valid,
    ).toBe(false);
    expect(
      validateSnapshot(
        { ...snapshot, state: { value: 3, mode: "running" } },
        schema,
      ).valid,
    ).toBe(false);
    expect(
      validateSnapshot(
        { ...snapshot, contractDigest: `sha256:${"c".repeat(64)}` },
        schema,
      ).valid,
    ).toBe(false);
    expect(
      validateSnapshot({ ...snapshot, extra: "x".repeat(16384) }, schema)
        .diagnostics[0]?.message,
    ).toContain("16 KiB");
  });
  it("seals the behavior profile and retains provenance without claiming observations were verified", async () => {
    const entry = locked.bundle.contracts[0];
    if (!entry) throw new Error("Missing fixture contract");
    await expect(validateBlockContract(entry)).resolves.toBeDefined();
    const output = await exportSemanticDocument(locked.document, {
      bundle: locked.bundle,
      offline: true,
    });
    expect(output["blocks"]).toMatchObject([
      {
        composition: {
          status: "declared-rule",
          verification: "not-executed",
          sourceBlockId: "00000000-0000-4000-8000-000000000001",
          declaration: {
            presets: fixture.semantics.composition.presets,
            observations: fixture.semantics.composition.observations,
          },
        },
      },
    ]);
    const changed = structuredClone(entry);
    if (changed.contract.semantics?.composition?.presets[0])
      (
        changed.contract.semantics.composition.presets[0].values as Record<
          string,
          number
        >
      )["value"] = 9;
    await expect(validateBlockContract(changed)).rejects.toThrow();
  });
});
