import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isPlainObject,
  parseDocument,
  parseJson,
  type JsonValue,
} from "@publisle/schema";
import { defineSchemaBlock } from "../../block-sdk/src/index.ts";
import { createRegistry } from "../../core/src/index.ts";
import { coreBlockDefinitions } from "../../../blocks/core/src/index.ts";
import { interactiveSchematicDefinition } from "../../../blocks/technical/src/index.ts";
import {
  BETA_SCHEMAS,
  BETA_SCHEMA_DEPENDENCIES,
  PORTABLE_PATTERNS,
  digestJson,
  exportRegistryContracts,
  lockDocument,
  validateStructure,
  type PortableJsonSchema,
} from "@publisle/contracts";
import canonical from "../fixtures/canonical.json" with { type: "json" };
import structural from "../fixtures/structural.json" with { type: "json" };
import source from "../fixtures/portable-counter.json" with { type: "json" };

function python(input: unknown): JsonValue {
  // The consumer has no subprocess/network authority and never imports TS code.
  const result = execFileSync(
    process.env["PUBLISLE_PYTHON"] ?? "python3",
    [
      "-B",
      fileURLToPath(
        new URL("../../../tools/python/conformance.py", import.meta.url),
      ),
    ],
    {
      input: JSON.stringify(input),
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30_000,
    },
  );
  return parseJson(result);
}

describe("independent offline Python conformance", () => {
  it("validates locked documents and exact transitive pins without a plugin or migration", async () => {
    const base = defineSchemaBlock({
      type: "example:base",
      schemaVersion: 1,
      contract: source,
    });
    const wrapper = defineSchemaBlock({
      type: "example:wrapper",
      schemaVersion: 1,
      contract: {
        ...source,
        dependencies: [{ type: base.type, schemaVersion: 1 }],
      },
    });
    const document = {
      schemaVersion: 1,
      blocks: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          type: wrapper.type,
          schemaVersion: 1,
          data: { count: 3 },
        },
      ],
    };
    const locked = await lockDocument(
      parseDocument(document),
      createRegistry([base, wrapper]),
    );
    const request = {
      operation: "document",
      document: locked.document,
      bundle: locked.bundle,
      schema: BETA_SCHEMAS.document,
      dependencies: BETA_SCHEMA_DEPENDENCIES.filter(
        (schema) => schema !== BETA_SCHEMAS.document,
      ),
    };
    expect(python(request)).toMatchObject({
      valid: true,
      sourceDigest: await digestJson(locked.document),
      document: locked.document,
    });
    expect(
      python({
        ...request,
        document: {
          ...locked.document,
          blocks: document.blocks.map((block) => ({
            ...block,
            schemaVersion: 2,
          })),
        },
      }),
    ).toMatchObject({
      valid: false,
      diagnostics: [{ code: "missing-offline-contract" }],
    });
    expect(
      python({
        operation: "bundle",
        bundle: {
          ...locked.bundle,
          contracts: locked.bundle.contracts.filter(
            (entry) => entry.contract.identity.type !== base.type,
          ),
        },
      }),
    ).toMatchObject({
      valid: false,
      diagnostics: [{ code: "missing-offline-contract" }],
    });
  }, 30_000);
  it("agrees across deterministic binary64 bit-pattern edge samples", async () => {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const values: number[] = [];
    for (const center of [
      0n,
      1n,
      0x3eb0c6f7a0b5ed8dn,
      0x4340000000000000n,
      0x4415af1d78b58c40n,
      0x444b1ae4d6e2ef50n,
      0x7fefffffffffffffn,
    ]) {
      for (const offset of [-1n, 0n, 1n]) {
        view.setBigUint64(0, BigInt.asUintN(64, center + offset));
        const value = view.getFloat64(0);
        if (Number.isFinite(value)) values.push(value, -value);
      }
    }
    let bits = 0x123456789abcdef0n;
    for (let index = 0; index < 1024; index++) {
      bits = BigInt.asUintN(
        64,
        bits * 6364136223846793005n + 1442695040888963407n,
      );
      view.setBigUint64(0, bits);
      const value = view.getFloat64(0);
      if (Number.isFinite(value)) values.push(value);
    }
    expect(
      python({
        operation: "digest",
        texts: values.map((value) => JSON.stringify(value)),
      }),
    ).toEqual(await Promise.all(values.map((value) => digestJson(value))));
  });
  it("agrees on all shared JCS binary64/Unicode digest fixtures", () => {
    expect(
      python({
        operation: "digest",
        texts: canonical.map((case_) => case_.text),
      }),
    ).toEqual(canonical.map((case_) => case_.digest));
  });

  it("agrees on every shared built-in structural fixture", () => {
    const cases = structural.map((case_) => {
      const schema = BETA_SCHEMAS[case_.schema as keyof typeof BETA_SCHEMAS];
      return {
        value: case_.value,
        schema,
        dependencies: BETA_SCHEMA_DEPENDENCIES.filter((v) => v !== schema),
      };
    });
    const classify = (result: ReturnType<typeof validateStructure>) => ({
      valid: result.valid,
      code: result.diagnostics[0]?.code ?? null,
    });
    const expected = cases.map((case_) =>
      classify(
        validateStructure(case_.value, case_.schema, case_.dependencies),
      ),
    );
    const actual = python({ operation: "structure", cases });
    expect(Array.isArray(actual)).toBe(true);
    if (!Array.isArray(actual)) throw new Error("Expected classifications");
    expect(
      actual.map((value: unknown) => {
        if (!isPlainObject(value)) throw new Error("Invalid Python result");
        const diagnostics = value["diagnostics"];
        const first: unknown = Array.isArray(diagnostics)
          ? diagnostics[0]
          : undefined;
        return {
          valid: value["valid"],
          code: isPlainObject(first) ? first["code"] : null,
        };
      }),
    ).toEqual(expected);
  }, 30_000);

  it("agrees on invalid/unsupported schema classifications and finite regexes", () => {
    const schemas: PortableJsonSchema[] = [
      { required: 5 },
      { type: "unsupported" },
      { maximum: true },
      { enum: [true, true] },
      { unevaluatedProperties: false },
      { pattern: "(a+)+$" },
      { $ref: "https://example.invalid/never-fetched" },
      { $id: "relative.json" },
      { $ref: "#" },
      { $ref: "#/%GG" },
      {
        $vocabulary: {
          "https://json-schema.org/draft/2020-12/vocab/format-assertion": true,
        },
      },
      { anyOf: Array<boolean>(17).fill(true) },
      ...Object.values(PORTABLE_PATTERNS).map((pattern) => ({
        type: "string",
        pattern,
      })),
    ];
    const cases = schemas.map((schema) => ({ value: "example\n", schema }));
    const actual = python({ operation: "structure", cases });
    expect(Array.isArray(actual)).toBe(true);
    if (!Array.isArray(actual)) throw new Error("Expected classifications");
    actual.forEach((result, index) => {
      const expected = validateStructure(
        cases[index]?.value,
        schemas[index] ?? false,
      );
      expect(result).toMatchObject({ valid: expected.valid });
      if (!expected.valid)
        expect(result).toMatchObject({
          diagnostics: [{ code: expected.diagnostics[0]?.code }],
        });
    });
  });

  it("verifies the complete built-in closure and reports opaque hooks without executing them", async () => {
    const bundle = await exportRegistryContracts(
      createRegistry([
        ...coreBlockDefinitions,
        interactiveSchematicDefinition,
        defineSchemaBlock({
          type: "example:counter",
          schemaVersion: 1,
          contract: source,
        }),
      ]),
    );
    const result = python({ operation: "bundle", bundle });
    expect(result).toMatchObject({
      valid: true,
      roles: ["structural-validator"],
    });
    expect(JSON.stringify(result)).toContain("migration:1");
    expect(JSON.stringify(result)).toContain('"executable":"unsupported"');
    const tampered = {
      ...bundle,
      contracts: bundle.contracts.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              contract: {
                ...entry.contract,
                source: {
                  ...entry.contract.source,
                  documentation: {
                    ...entry.contract.source.documentation,
                    purpose: "tampered",
                  },
                },
              },
            }
          : entry,
      ),
    };
    expect(python({ operation: "bundle", bundle: tampered })).toMatchObject({
      valid: false,
      diagnostics: [{ code: "contract-integrity-mismatch" }],
    });
    expect(
      python({ operation: "bundle", bundle: { ...bundle, lock: {} } }),
    ).toMatchObject({
      valid: false,
      diagnostics: [{ code: "contract-lock-mismatch" }],
    });
  }, 30_000);
});
