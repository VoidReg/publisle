import { describe, expect, it } from "vitest";
import { coreBlockDefinitions } from "../../../blocks/core/src/index.ts";
import type {
  HeadingData,
  ListData,
  FigureData,
} from "../../../blocks/core/src/index.ts";
import { interactiveSchematicDefinition } from "../../../blocks/technical/src/index.ts";
import { document, DOCUMENT_SCHEMA_VERSION } from "@publisle/schema";
import { PUBLICATION_FORMAT_VERSION } from "../../adapter-core/src/publication.ts";
import fixtures from "../fixtures/structural.json" with { type: "json" };
import {
  BETA_SCHEMAS,
  BETA_SCHEMA_DEPENDENCIES,
  validateStructure,
  type PortableJsonSchema,
} from "@publisle/contracts";

function check(value: unknown, schema: PortableJsonSchema) {
  return validateStructure(
    value,
    schema,
    BETA_SCHEMA_DEPENDENCIES.filter((entry) => entry !== schema),
  );
}
describe("shared structural fixtures", () => {
  for (const fixture of fixtures) {
    it(fixture.id, () => {
      const schema = BETA_SCHEMAS[fixture.schema as keyof typeof BETA_SCHEMAS];
      expect(schema).toBeDefined();
      const result = check(fixture.value, schema);
      expect(result.valid, JSON.stringify(result.diagnostics)).toBe(
        fixture.valid,
      );
      if (!fixture.valid)
        expect(result.diagnostics[0]?.code).toBe("invalid-data");
    });
  }
  it("covers every normalized built-in parser output", () => {
    for (const definition of [
      ...coreBlockDefinitions,
      interactiveSchematicDefinition,
    ]) {
      const name = definition.type.slice("publisle:".length);
      const sample = fixtures.find((fixture) => fixture.id === "valid-" + name);
      expect(sample, definition.type).toBeDefined();
      const parsed: unknown = definition.schema.parse(sample?.value);
      const schema = BETA_SCHEMAS[name as keyof typeof BETA_SCHEMAS];
      expect(check(parsed, schema), definition.type).toEqual({
        valid: true,
        diagnostics: [],
      });
    }
  });
  it("checks representative SDK-typed values against independent schemas", () => {
    const content = [{ type: "text", value: "Typed example" }] as const;
    const heading = { level: 2, content } satisfies HeadingData;
    const list = {
      ordered: false,
      items: [
        {
          type: "taskListItem",
          checked: true,
          children: [{ type: "paragraph", content }],
        },
      ],
    } satisfies ListData;
    const figure = {
      src: "./plot.svg",
      alt: "Plot",
      credit: content,
      original: { src: "./plot.csv", mediaType: "text/csv" },
    } satisfies FigureData;
    expect(check(heading, BETA_SCHEMAS.heading).valid).toBe(true);
    expect(check(list, BETA_SCHEMAS.list).valid).toBe(true);
    expect(check(figure, BETA_SCHEMAS.figure).valid).toBe(true);
  });
  it("does not insert defaults, coerce values, remove extras or mutate input", () => {
    const schema = {
      type: "object",
      properties: { x: { type: "integer", default: 4 } },
      additionalProperties: false,
    };
    const value = Object.freeze({});
    expect(validateStructure(value, schema).valid).toBe(true);
    expect(value).toEqual({});
    expect(validateStructure({ x: "4" }, schema).valid).toBe(false);
    expect(validateStructure({ extra: true }, schema).valid).toBe(false);
  });
  it("treats format as an annotation, not assertion", () => {
    expect(
      validateStructure("not-a-date", { type: "string", format: "date-time" })
        .valid,
    ).toBe(true);
    const result = validateStructure("x", {
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/format-assertion": true,
      },
      type: "string",
    });
    expect(result.diagnostics[0]?.code).toBe("unsupported-contract");
  });
  it("reports unknown keywords, regexes, dialects and references as unsupported", () => {
    for (const schema of [
      { unevaluatedProperties: false },
      { type: "string", pattern: "(a+)+$" },
      { $schema: "https://example.invalid/dialect" },
      { $ref: "https://example.invalid/not-supplied" },
    ]) {
      expect(validateStructure({}, schema).diagnostics[0]?.code).toBe(
        "unsupported-contract",
      );
    }
  });
  it("supports productive recursion but rejects zero-consumption cycles", () => {
    const schema: PortableJsonSchema = {
      $id: "urn:test:recursive",
      anyOf: [
        { type: "null" },
        { type: "array", items: { $ref: "urn:test:recursive" } },
      ],
    };
    expect(validateStructure([null, [null]], schema)).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(validateStructure(1, { $ref: "#" }).diagnostics[0]?.code).toBe(
      "unsupported-contract",
    );
  });
  it("resolves pointer refs to boolean definitions and honors them", () => {
    expect(
      validateStructure(null, {
        $defs: { allowed: true },
        $ref: "#/$defs/allowed",
      }).valid,
    ).toBe(true);
    expect(
      validateStructure(null, {
        $defs: { allowed: false },
        $ref: "#/$defs/allowed",
      }).valid,
    ).toBe(false);
  });
  it("rejects invalid schema keyword shapes and duplicate IDs", () => {
    expect(validateStructure({}, { required: 5 }).diagnostics[0]?.code).toBe(
      "invalid-contract",
    );
    const schema = { $id: "urn:test:same", type: "object" };
    expect(validateStructure({}, schema, [schema]).diagnostics[0]?.code).toBe(
      "unsupported-contract",
    );
  });
  it("rejects non-JSON input rather than ignoring undefined", () => {
    expect(validateStructure({ x: undefined }, true).diagnostics[0]?.code).toBe(
      "invalid-json",
    );
  });
  it("rejects trailing line breaks in full-match identifiers and timestamps", () => {
    const id = "00000000-0000-4000-a000-000000000001";
    for (const value of [
      { id: id + "\n", type: "host:unknown", schemaVersion: 1, data: null },
      { id, type: "host:unknown\n", schemaVersion: 1, data: null },
    ])
      expect(check(value, BETA_SCHEMAS["block-envelope"]).valid).toBe(false);
    expect(
      check({ publishedAt: "2026-10-08T10:00:00Z\n" }, BETA_SCHEMAS.metadata)
        .valid,
    ).toBe(false);
  });
  it("rejects relative IDs and excessive branching before compilation", () => {
    expect(
      validateStructure(null, { $id: "relative.json" }).diagnostics[0]?.code,
    ).toBe("unsupported-contract");
    expect(
      validateStructure(null, { anyOf: Array<boolean>(17).fill(true) })
        .diagnostics[0]?.code,
    ).toBe("unsupported-contract");
    expect(
      validateStructure(null, true, Array<boolean>(129).fill(true))
        .diagnostics[0]?.code,
    ).toBe("unsupported-contract");
  });
  it("keeps existing beta versions frozen", () => {
    expect(DOCUMENT_SCHEMA_VERSION).toBe(1);
    expect(PUBLICATION_FORMAT_VERSION).toBe(1);
    expect(document({ blocks: [] }).schemaVersion).toBe(1);
    expect(coreBlockDefinitions.map((entry) => entry.schemaVersion)).toEqual(
      Array<number>(coreBlockDefinitions.length).fill(1),
    );
    expect(interactiveSchematicDefinition.schemaVersion).toBe(2);
  });
});
