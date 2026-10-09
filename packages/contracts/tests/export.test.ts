import { describe, expect, it } from "vitest";
import {
  SchemaParseError,
  canonicalizeJson,
  type ContractSource,
  type JsonValue,
} from "@publisle/schema";
import { createRegistry } from "../../core/src/index.ts";
import { defineSchemaBlock } from "../../block-sdk/src/index.ts";
import {
  coreBlockDefinitions,
  paragraphDefinition,
  headingDefinition,
} from "../../../blocks/core/src/index.ts";
import { interactiveSchematicDefinition } from "../../../blocks/technical/src/index.ts";
import source from "../fixtures/portable-counter.json" with { type: "json" };
import {
  BETA_SCHEMAS,
  collectSchemaClosure,
  createContractBundle,
  createContractLock,
  digestJson,
  exportBlockContract,
  exportDocumentContracts,
  exportRegistryContracts,
  inspectPortability,
  validateBlockContract,
  validateContractBundle,
  validateStructure,
  type ExportedContract,
} from "@publisle/contracts";

const counter = () =>
  defineSchemaBlock({
    type: "example:counter",
    schemaVersion: 1,
    contract: source,
  });
const registry = () =>
  createRegistry([...coreBlockDefinitions, interactiveSchematicDefinition]);
async function reseal(input: ExportedContract): Promise<ExportedContract> {
  const digest = await digestJson(input.contract);
  return { ...input, digest, id: `urn:publisle:contract:${digest}` };
}

describe("portable definition bridge and offline contract exports", () => {
  it("exports every built-in/reference definition with checked canonical examples", async () => {
    const bundle = await exportRegistryContracts(registry());
    expect(bundle.contracts).toHaveLength(16);
    expect(bundle.roots).toHaveLength(16);
    expect(
      await validateContractBundle(JSON.parse(canonicalizeJson(bundle))),
    ).toEqual(bundle);
    const technical = bundle.contracts.find(
      (entry) =>
        entry.contract.identity.type === "publisle:interactive-schematic",
    );
    expect(technical?.contract.identity.schemaVersion).toBe(2);
    for (const name of ["parse", "resources", "island", "migration:1"])
      expect(typeof technical?.contract.portability.executable[name]).toBe(
        "string",
      );
  }, 30000);

  it("generates a strict structural parser and exports schema-first capabilities honestly", async () => {
    const definition = counter();
    const value = Object.freeze({ count: 3 });
    expect(definition.schema.parse(value)).toEqual(value);
    expect(definition.schema.parse(value)).not.toBe(value);
    expect(() => definition.schema.parse({ count: "3" })).toThrow();
    expect(() => definition.schema.parse({ count: 3, extra: true })).toThrow();
    const contract = await exportBlockContract(definition);
    expect(contract.contract.portability).toMatchObject({
      structural: true,
      descriptive: true,
      declarative: false,
      implementationBound: false,
    });
    expect(await validateBlockContract(contract)).toEqual(contract);
  });

  it("generates conservative types for literal simple schemas", () => {
    const definition = defineSchemaBlock({
      type: "example:typed-counter",
      schemaVersion: 1,
      contract: {
        ...source,
        dataSchema: {
          type: "object",
          properties: { count: { type: "integer" }, label: { type: "string" } },
          required: ["count"],
          additionalProperties: false,
        },
      },
    });
    const value = definition.schema.parse({ count: 1 });
    const count: number = value.count;
    const label: string | undefined = value.label;
    expect(count).toBe(1);
    expect(label).toBeUndefined();
    // @ts-expect-error Generated integer values are numbers, never strings.
    const wrong: string = value.count;
    expect(wrong).toBe(1);
  });

  it("never treats an arbitrary callback as a schema-first parser", async () => {
    await expect(
      exportBlockContract({
        ...counter(),
        schema: { parse: (value) => value },
      }),
    ).rejects.toThrow("generated structural parser");
  });

  it("does not load/access renderers during inspection or export", async () => {
    const definition = {
      ...counter(),
      get renderer(): never {
        throw new Error("Renderer must not load");
      },
    };
    expect(inspectPortability(definition).structural).toBe(true);
    await expect(exportBlockContract(definition)).resolves.toHaveProperty(
      "digest",
    );
  });

  it("rejects opaque definitions instead of inventing a contract", async () => {
    const opaque = {
      type: "example:opaque" as const,
      schemaVersion: 1,
      schema: { parse: () => ({}) },
    };
    expect(inspectPortability(opaque)).toMatchObject({
      structural: false,
      descriptive: false,
      implementationBound: true,
    });
    await expect(exportBlockContract(opaque)).rejects.toThrow(
      "cannot be reverse-engineered",
    );
  });

  it("checks parser output parity and negative diagnostics", async () => {
    const definition = counter();
    const contract: ContractSource = {
      ...definition.contract,
      mode: "verified-adapter",
    };
    await expect(
      exportBlockContract({
        ...definition,
        contract,
        schema: { parse: () => ({ count: 99 }) },
      }),
    ).rejects.toThrow("differs from declared example");
    await expect(
      exportBlockContract({
        ...definition,
        contract,
        schema: {
          parse: (value) => {
            if (value === source.documentation.invalidExamples[0]?.input)
              throw new SchemaParseError("wrong-code", "wrong");
            return value;
          },
        },
      }),
    ).rejects.toThrow("declared diagnostic");
  });

  it("excludes unused definitions and schemas from document exports", async () => {
    const bundle = await exportDocumentContracts(
      { blocks: [{ type: "publisle:paragraph", schemaVersion: 1 }] },
      registry(),
    );
    expect(bundle.contracts).toHaveLength(1);
    const contract = bundle.contracts[0];
    if (!contract) throw new Error("Missing exported contract.");
    const ids = contract.contract.schemas.map((entry) =>
      typeof entry === "object" ? entry["$id"] : "",
    );
    expect(ids).toContain("urn:publisle:schema:rich-content");
    expect(ids).not.toContain("urn:publisle:schema:heading");
    expect(contract.contract.source.schemaDependencies).toHaveLength(1);
    expect(await validateContractBundle(bundle)).toEqual(bundle);
  });

  it("exports transitive block dependencies and validates their exact identities offline", async () => {
    const base = counter();
    const root = {
      ...base,
      type: "example:root" as const,
      contract: {
        ...base.contract,
        dependencies: [{ type: base.type, schemaVersion: 1 }],
      },
    };
    const bundle = await exportDocumentContracts(
      { blocks: [{ type: root.type, schemaVersion: 1 }] },
      createRegistry([root, base, paragraphDefinition]),
    );
    expect(bundle.contracts).toHaveLength(2);
    expect(bundle.roots).toHaveLength(1);
    await expect(validateContractBundle(bundle)).resolves.toEqual(bundle);
    await expect(exportBlockContract(root)).rejects.toThrow("registry export");
    await expect(
      createContractBundle(
        bundle.contracts.filter(
          (entry) => entry.contract.identity.type === root.type,
        ),
        bundle.roots,
      ),
    ).rejects.toThrow("Missing offline contract");
  });

  it("deduplicates contract roots across many instances without a false 128-contract limit", async () => {
    const definition = counter();
    const bundle = await exportDocumentContracts(
      {
        blocks: Array.from({ length: 300 }, () => ({
          type: definition.type,
          schemaVersion: 1,
        })),
      },
      createRegistry([definition]),
    );
    expect(bundle.contracts).toHaveLength(1);
    expect(bundle.roots).toHaveLength(1);
    const root = bundle.roots[0];
    if (!root) throw new Error("Missing root.");
    expect(
      await createContractLock(
        bundle.contracts,
        Array.from({ length: 300 }, () => root),
      ),
    ).toEqual(bundle.lock);
  });

  it("rejects schema-first coercion examples, loose envelopes and substituted data schemas even when resealed", async () => {
    const entry = await exportBlockContract(counter());
    const loose = await reseal({
      ...entry,
      contract: { ...entry.contract, envelopeSchema: true },
    });
    await expect(validateBlockContract(loose)).rejects.toThrow(
      "exact declared identity",
    );
    const replaced = await reseal({
      ...entry,
      contract: {
        ...entry.contract,
        schemas: entry.contract.schemas.map((schema) =>
          typeof schema === "object" &&
          schema["$id"] === "urn:publisle:contract-data"
            ? { $id: "urn:publisle:contract-data", type: "object" }
            : schema,
        ),
      },
    });
    await expect(validateBlockContract(replaced)).rejects.toThrow(
      "differs from the declared source",
    );
    const coercion = await reseal({
      ...entry,
      contract: {
        ...entry.contract,
        source: {
          ...entry.contract.source,
          documentation: {
            ...entry.contract.source.documentation,
            validExamples: [{ input: { count: "3" }, output: { count: 3 } }],
          },
        },
      },
    });
    await expect(validateBlockContract(coercion)).rejects.toThrow("read-only");
  });

  it("does not fetch supplied HTTP schema IDs", async () => {
    const definition = counter();
    const dependency = {
      $id: "https://contracts.invalid/counter",
      ...source.dataSchema,
    };
    const exported = await exportBlockContract({
      ...definition,
      contract: {
        ...definition.contract,
        mode: "verified-adapter",
        dataSchema: { $ref: dependency.$id },
        schemaDependencies: [dependency],
      },
    });
    expect(exported.contract.source.schemaDependencies).toEqual([dependency]);
    await expect(
      validateBlockContract(JSON.parse(canonicalizeJson(exported))),
    ).resolves.toEqual(exported);
  });

  it("requires exact source versions and does not run migrations", async () => {
    await expect(
      exportDocumentContracts(
        {
          blocks: [
            { type: "publisle:interactive-schematic", schemaVersion: 1 },
          ],
        },
        registry(),
      ),
    ).rejects.toThrow("does not migrate source");
    await expect(
      exportDocumentContracts(
        { blocks: [{ type: "missing:block", schemaVersion: 1 }] },
        registry(),
      ),
    ).rejects.toThrow("Missing exact definition");
  });

  it("rejects cycles and missing block dependencies", async () => {
    const base = counter();
    const cycle = {
      ...base,
      contract: {
        ...base.contract,
        dependencies: [{ type: base.type, schemaVersion: 1 }],
      },
    };
    await expect(
      exportRegistryContracts(createRegistry([cycle])),
    ).rejects.toThrow("Cyclic");
    const missing = {
      ...base,
      contract: {
        ...base.contract,
        dependencies: [{ type: "missing:block" as const, schemaVersion: 1 }],
      },
    };
    await expect(
      exportRegistryContracts(createRegistry([missing])),
    ).rejects.toThrow("Missing exact");
  });

  it("resolves refs offline and rejects conflicts, missing resources and invalid pointers", async () => {
    expect(
      collectSchemaClosure(
        [BETA_SCHEMAS.paragraph],
        [BETA_SCHEMAS["rich-content"], BETA_SCHEMAS.heading],
      ),
    ).toEqual([BETA_SCHEMAS["rich-content"]]);
    expect(() => collectSchemaClosure([BETA_SCHEMAS.paragraph], [])).toThrow(
      "Missing offline schema",
    );
    expect(() =>
      collectSchemaClosure(
        [BETA_SCHEMAS.paragraph],
        [
          BETA_SCHEMAS["rich-content"],
          { $id: "urn:publisle:schema:rich-content", type: "number" },
        ],
      ),
    ).toThrow("Conflicting");
    const definition = counter();
    await expect(
      exportBlockContract({
        ...definition,
        contract: {
          ...definition.contract,
          mode: "verified-adapter",
          dataSchema: { $ref: "urn:missing#/$defs/a" },
        },
      }),
    ).rejects.toThrow("Missing offline");
    await expect(
      exportBlockContract({
        ...definition,
        contract: {
          ...definition.contract,
          mode: "verified-adapter",
          dataSchema: { $ref: "#/$defs/missing" },
        },
      }),
    ).rejects.toThrow("Reference");
  });

  it("does not interpret annotation values as schema dependencies", () => {
    expect(
      collectSchemaClosure(
        [{ type: "string", examples: [{ $ref: "urn:not-a-schema" }] }],
        [],
      ),
    ).toEqual([]);
  });

  it("digest-pins all bytes with no implicit exclusions and detects tampering", async () => {
    const entry = await exportBlockContract(counter());
    expect(entry.digest).toBe(await digestJson(entry.contract));
    await expect(
      validateBlockContract({
        ...entry,
        contract: { ...entry.contract, defaults: { count: 99 } },
      }),
    ).rejects.toThrow("integrity");
    const bundle = await createContractBundle([entry], [entry.id]);
    await expect(
      validateContractBundle({
        ...bundle,
        lock: { ...bundle.lock, schemas: [] },
      }),
    ).rejects.toThrow("lock mismatch");
    await expect(
      validateBlockContract({ ...entry, id: "urn:repinned" }),
    ).rejects.toThrow("integrity");
  });

  it("rejects broken internal schemas even when the body is resealed", async () => {
    const entry = await exportBlockContract(counter());
    const broken = await reseal({
      ...entry,
      contract: { ...entry.contract, schemas: [] },
    });
    await expect(validateBlockContract(broken)).rejects.toThrow();
    const unsupported = await reseal({
      ...entry,
      contract: { ...entry.contract, envelopeSchema: { $dynamicRef: "#x" } },
    });
    await expect(validateBlockContract(unsupported)).rejects.toThrow();
  });

  it("rejects inconsistent capability claims, missing opaque checks and invalid examples", async () => {
    const entry = await exportBlockContract(paragraphDefinition);
    const unbound = await reseal({
      ...entry,
      contract: {
        ...entry.contract,
        portability: {
          ...entry.contract.portability,
          implementationBound: false,
        },
      },
    });
    await expect(validateBlockContract(unbound)).rejects.toThrow(
      "Contradictory",
    );
    const omitted = await reseal({
      ...entry,
      contract: {
        ...entry.contract,
        portability: {
          ...entry.contract.portability,
          executable: { fake: "bound" },
        },
      },
    });
    await expect(validateBlockContract(omitted)).rejects.toThrow("omitted");
    const badExample = await reseal({
      ...entry,
      contract: {
        ...entry.contract,
        source: {
          ...entry.contract.source,
          documentation: {
            ...entry.contract.source.documentation,
            validExamples: [{ input: null, output: null }],
          },
        },
      },
    });
    await expect(validateBlockContract(badExample)).rejects.toThrow(
      "example violates",
    );
  });

  it("rejects unused/duplicate offline contracts and mismatched dependency pins", async () => {
    const entry = await exportBlockContract(counter());
    const unused = await exportBlockContract(headingDefinition);
    await expect(
      createContractLock([entry, unused], [entry.id]),
    ).rejects.toThrow("unused");
    await expect(
      createContractLock([entry, entry], [entry.id]),
    ).rejects.toThrow("Duplicate");
    const bad = await reseal({
      ...entry,
      contract: { ...entry.contract, dependencies: [unused.id] },
    });
    await expect(createContractLock([bad, unused], [bad.id])).rejects.toThrow(
      "identity mismatch",
    );
  });

  it("records normalization/refinements/migrations rather than dropping executable behavior", async () => {
    const definition = counter();
    const host = {
      ...definition,
      normalize: (value: JsonValue) => value,
      migrations: [{ from: 1, migrate: (value: JsonValue) => value }],
      contract: {
        ...definition.contract,
        behavior: {
          ...source.behavior,
          executable: {
            refinement: "Host authorization check is not portable.",
          },
        },
      },
    };
    for (const name of ["refinement", "normalize", "migration:1"])
      expect(typeof inspectPortability(host).executable[name]).toBe("string");
    await expect(exportBlockContract(host)).resolves.toHaveProperty(
      "contract.portability.implementationBound",
      true,
    );
  });

  it("validates exported envelopes including exact block type and version", async () => {
    const entry = await exportBlockContract(counter());
    const sample = {
      id: "00000000-0000-4000-8000-000000000001",
      type: "example:counter",
      schemaVersion: 1,
      data: { count: 3 },
    };
    expect(
      validateStructure(
        sample,
        entry.contract.envelopeSchema,
        entry.contract.schemas,
      ).valid,
    ).toBe(true);
    expect(
      validateStructure(
        { ...sample, type: "example:wrong" },
        entry.contract.envelopeSchema,
        entry.contract.schemas,
      ).valid,
    ).toBe(false);
    expect(
      validateStructure(
        { ...sample, schemaVersion: 2 },
        entry.contract.envelopeSchema,
        entry.contract.schemas,
      ).valid,
    ).toBe(false);
  });

  it("makes contract metadata changes part of registry identity without version bumps", () => {
    const definition = counter();
    const changed = {
      ...definition,
      contract: {
        ...definition.contract,
        provenance: { publisher: "Another publisher", license: "MIT" },
      },
    };
    expect(createRegistry([definition]).version).not.toBe(
      createRegistry([changed]).version,
    );
    expect(changed.schemaVersion).toBe(1);
  });
});
