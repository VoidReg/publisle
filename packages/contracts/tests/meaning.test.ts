import { describe, expect, it } from "vitest";
import {
  validateSemantics,
  traverseDeclared,
  RICH_TRAVERSAL_RULES,
  INTERACTIVE_TRAVERSAL,
  parseInteractiveEnvelope,
  parseReadable,
  parseBlock,
} from "@publisle/schema";
import {
  BETA_SCHEMAS,
  BETA_SCHEMA_DEPENDENCIES,
  validateStructure,
  validateSemanticBindings,
  digestJson,
  PORTABLE_PATTERNS,
} from "@publisle/contracts";
import { getBlockSourceDigest } from "../../core/src/index.ts";
import fixture from "../fixtures/meaning.json" with { type: "json" };
import traversalFixtures from "../fixtures/traversal.json" with { type: "json" };

const check = (value: unknown, schema: keyof typeof BETA_SCHEMAS) =>
  validateStructure(
    value,
    BETA_SCHEMAS[schema],
    BETA_SCHEMA_DEPENDENCIES.filter((entry) => entry !== BETA_SCHEMAS[schema]),
  );
describe("renderer-independent meaning fixtures", () => {
  for (const sample of traversalFixtures)
    it(`shared traversal: ${sample.id}`, () => {
      const declaration =
        sample.declaration as unknown as import("@publisle/schema").TraversalDeclaration;
      const snapshot = JSON.stringify(sample.data);
      if (!sample.valid)
        expect(() => traverseDeclared(sample.data, declaration)).toThrow();
      else {
        const visits = traverseDeclared(sample.data, declaration);
        if ("pointers" in sample)
          expect(visits.map((visit) => visit.pointer)).toEqual(sample.pointers);
        if ("unresolved" in sample) expect(visits[0]?.kind).toBe("unresolved");
      }
      expect(JSON.stringify(sample.data)).toBe(snapshot);
    });
  it("rejects false value-type/default claims and unsafe programmatic declarations", () => {
    const entity = {
      id: "x",
      kind: "input",
      name: "X",
      origin: "declared-rule",
      binding: "/x",
      valueType: "number",
    };
    expect(
      validateSemantics({ entities: [entity] }, { x: "not a number" }),
    ).toContainEqual(
      expect.objectContaining({
        code: "invalid-semantics",
        pointer: "/entities/0/binding",
      }),
    );
    expect(
      validateSemantics(
        { entities: [{ ...entity, default: "not a number" }] },
        { x: 1 },
      ),
    ).toContainEqual(
      expect.objectContaining({ pointer: "/entities/0/default" }),
    );
    expect(
      validateSemantics({ entities: [{ ...entity, id: "x\n" }] }, { x: 1 })[0]
        ?.code,
    ).toBe("invalid-semantics");
    let calls = 0;
    const accessor = Object.defineProperty({}, "entities", {
      enumerable: true,
      get() {
        calls++;
        return [entity];
      },
    });
    expect(
      validateSemanticBindings(accessor, { x: 1 }, { type: "object" }).valid,
    ).toBe(false);
    const data = Object.defineProperty({}, "x", {
      enumerable: true,
      get() {
        calls++;
        return 1;
      },
    });
    expect(validateSemantics({ entities: [entity] }, data)[0]?.code).toBe(
      "invalid-semantics",
    );
    expect(calls).toBe(0);
  });
  it("resolves percent-encoded schema fragments consistently with structural validation", () => {
    const semantics = {
      entities: [
        {
          id: "y",
          kind: "output",
          name: "Y",
          origin: "authored",
          binding: "/x/y",
        },
      ],
    };
    const schema = {
      type: "object",
      properties: { x: { $ref: "#/$defs/a%20b" } },
      $defs: {
        "a b": { type: "object", properties: { y: { type: "number" } } },
      },
    };
    expect(
      validateSemanticBindings(semantics, { x: { y: 1 } }, schema).valid,
    ).toBe(true);
  });
  for (const sample of fixture.cases)
    it(sample.id, () => {
      const diagnostics = validateSemantics(sample.semantics, sample.data);
      expect(diagnostics.length === 0).toBe(sample.valid);
      if ("code" in sample)
        expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
          sample.code,
        );
    });
  it("exposes all unfamiliar inputs, outputs and actions from JSON alone", () => {
    const { data, semantics, structure } = fixture.example;
    expect(check(semantics, "semantics")).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(
      validateSemanticBindings(
        semantics,
        data,
        structure,
        BETA_SCHEMA_DEPENDENCIES,
      ),
    ).toEqual({ valid: true, diagnostics: [] });
    expect(
      semantics.entities
        .filter((entity) => ["input", "output", "action"].includes(entity.kind))
        .map((entity) => entity.id),
    ).toEqual(["frequency", "amplitude", "spectrum", "reset"]);
    expect(
      semantics.entities.find((entity) => entity.id === "spectrum")?.origin,
    ).toBe("calculated-result");
  });
  it("requires a contract-declared location, not just an incidental instance field", () => {
    const semantics = {
      entities: [
        {
          id: "x",
          kind: "input",
          name: "X",
          origin: "authored",
          binding: "/x",
        },
      ],
    };
    expect(
      validateSemanticBindings(
        semantics,
        { x: 1 },
        { type: "object", additionalProperties: true },
      ).diagnostics,
    ).toContainEqual(
      expect.objectContaining({
        code: "unresolved-semantic-binding",
        pointer: "/entities/0/binding",
      }),
    );
    expect(
      validateSemanticBindings(
        semantics,
        { x: 1 },
        { type: "object", properties: { x: { type: "number" } } },
      ).valid,
    ).toBe(true);
  });
  it("resolves local schema refs, escaped keys and array items without querying", () => {
    const semantics = {
      entities: [
        {
          id: "x",
          kind: "output",
          name: "X",
          origin: "authored",
          binding: "/a~1b/0/~0x",
        },
      ],
    };
    const schema = {
      type: "object",
      properties: { "a/b": { type: "array", items: { $ref: "#/$defs/item" } } },
      $defs: {
        item: { type: "object", properties: { "~x": { type: "number" } } },
      },
    };
    expect(
      validateSemanticBindings(semantics, { "a/b": [{ "~x": 1 }] }, schema)
        .valid,
    ).toBe(true);
  });
  it("keeps shared explanation slots and named associations portable", () => {
    const envelope = {
      activation: "visible",
      ...fixture.example.data,
      fallback: [
        {
          type: "paragraph",
          content: [{ type: "text", value: "Authored fallback" }],
        },
      ],
    };
    expect(parseInteractiveEnvelope(envelope, (value) => value)).toEqual(
      envelope,
    );
    expect(check(envelope, "interactive-envelope").valid).toBe(true);
    expect(check(INTERACTIVE_TRAVERSAL, "traversal").valid).toBe(true);
    expect(
      traverseDeclared(envelope, INTERACTIVE_TRAVERSAL).map(
        (visit) => visit.pointer,
      ),
    ).toContain("/content/purpose/0");
    expect(
      check(
        { root: { items: { ref: "inline" } }, rules: RICH_TRAVERSAL_RULES },
        "traversal",
      ).valid,
    ).toBe(true);
  });
  it("agrees on source digest preimages and validates readable provenance", async () => {
    const block = parseBlock({
      id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      type: "example:wave",
      schemaVersion: 1,
      data: fixture.example.data,
    });
    const sourceDigest = getBlockSourceDigest(block);
    expect(sourceDigest).toBe(await digestJson(block));
    const readable = {
      sourceDigest,
      provenance: { kind: "authored" },
      binding: "/content",
    };
    expect(check(readable, "readable").valid).toBe(true);
    expect(parseReadable(readable)).toEqual(readable);
    expect(
      getBlockSourceDigest({ ...block, readable: parseReadable(readable) }),
    ).toBe(sourceDigest);
    for (const value of [
      { ...readable, content: {} },
      { ...readable, sourceDigest: sourceDigest + "\n" },
      { ...readable, provenance: { kind: "generated" } },
    ]) {
      expect(check(value, "readable").valid).toBe(false);
      expect(() => parseReadable(value)).toThrow();
    }
    const generated = {
      sourceDigest,
      content: {},
      provenance: {
        kind: "generated",
        generator: "host:projection",
        version: "beta",
        source: "source.json",
      },
    };
    expect(check(generated, "readable").valid).toBe(true);
    expect(parseReadable(generated)).toEqual(generated);
    expect(
      new RegExp(PORTABLE_PATTERNS.sha256Digest, "u").test(sourceDigest + "\n"),
    ).toBe(false);
    expect(check({ ...block, readable }, "block").valid).toBe(true);
  });
});
