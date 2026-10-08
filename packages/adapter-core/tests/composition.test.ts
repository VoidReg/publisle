import { describe, expect, it } from "vitest";
import {
  parseComposition,
  validateSemantics,
  type JsonPrimitive,
  type SemanticDeclaration,
} from "@publisle/schema";
import {
  compileComposition,
  type CompositionCompilation,
} from "../src/composition.ts";
import fixture from "../../contracts/fixtures/composition.json" with { type: "json" };

interface Session {
  readonly authored: Readonly<Record<string, JsonPrimitive>>;
  read(): Readonly<Record<string, JsonPrimitive>>;
  views(): Readonly<Record<string, JsonPrimitive>>;
  action(id: string, value?: JsonPrimitive): void;
  preset(id: string): void;
  reset(): void;
  snapshot(): {
    readonly state: Readonly<Record<string, JsonPrimitive>>;
    readonly documentDigest: string;
    readonly contractDigest: string;
    readonly blockId: string;
  };
  restore(value: unknown): void;
}
interface Placement {
  session(id: string): Session;
  observe(
    id: string,
    callback: (
      views: Readonly<Record<string, JsonPrimitive>>,
    ) => void | Promise<void>,
  ): () => void;
  batch(
    commands: readonly {
      readonly block: string;
      readonly kind: string;
      readonly id: string;
      readonly value?: JsonPrimitive;
    }[],
  ): Promise<readonly { readonly block: string; readonly message: string }[]>;
  dispose(): void;
}
export function compositionFixture(): CompositionCompilation {
  return {
    documentDigest: `sha256:${"a".repeat(64)}`,
    instances: ["source", "target"].map((blockId) => ({
      blockId,
      contractDigest: `sha256:${"b".repeat(64)}`,
      data: structuredClone(fixture.data),
      semantics: structuredClone(fixture.semantics) as SemanticDeclaration,
    })),
    connections: [
      {
        from: { block: "source", port: "output" },
        to: { block: "target", port: "input" },
      },
    ],
  };
}
async function compiled(
  options = compositionFixture(),
): Promise<{ createPlacement(): Placement }> {
  const code = compileComposition(options);
  const module: unknown = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  return module as { createPlacement(): Placement };
}
describe("bounded composition lowering and session compatibility", () => {
  it("validates the data-only profile without changing authored data", () => {
    const source = JSON.stringify(fixture);
    expect(validateSemantics(fixture.semantics, fixture.data)).toEqual([]);
    expect(
      parseComposition(
        fixture.semantics.composition,
        fixture.data,
        fixture.semantics.entities,
      ).fields,
    ).toHaveLength(2);
    expect(JSON.stringify(fixture)).toBe(source);
  });
  it("rejects invalid presets, bindings, types, operations and relationship endpoints", () => {
    const mutate = (change: (copy: typeof fixture) => void) => {
      const copy = structuredClone(fixture);
      change(copy);
      expect(validateSemantics(copy.semantics, copy.data)[0]?.code).toBe(
        "invalid-semantics",
      );
    };
    mutate((copy) => {
      copy.semantics.composition.presets[0]!.values.value = 11;
    });
    mutate((copy) => {
      copy.semantics.composition.fields[0]!.binding = "/mode";
    });
    mutate((copy) => {
      copy.semantics.composition.operations[0]!.kind = "arbitrary-expression";
    });
    mutate((copy) => {
      copy.semantics.composition.relations[0]!.to = "missing";
    });
    mutate((copy) => {
      copy.semantics.composition.fields[0]!.type = "object";
    });
    mutate((copy) => {
      copy.semantics.composition.observations[0]!.assertion.tolerance = -1;
    });
    mutate((copy) => {
      copy.semantics.composition.profile = "unrecognized";
    });
  });
  it("lowers assignment, named presets, finite transitions and data views directly", async () => {
    const placement = (await compiled()).createPlacement();
    const session = placement.session("source");
    session.action("set", 4);
    expect(session.views()).toEqual({ display: 4 });
    session.action("start");
    expect(session.read()["mode"]).toBe("running");
    expect(() => session.action("start")).toThrow("Invalid transition");
    expect(() => session.action("set", 11)).toThrow();
    expect(session.read()["value"]).toBe(4);
    session.action("choose");
    expect(session.read()).toEqual({ value: 8, mode: "idle" });
    session.reset();
    expect(session.read()).toEqual(fixture.data);
    expect(Object.isFrozen(session.authored)).toBe(true);
    expect(fixture.data.value).toBe(1);
  });
  it("excludes transient state, restores atomically and rejects stale revisions", async () => {
    const session = (await compiled()).createPlacement().session("source");
    session.action("set", 3);
    session.action("start");
    const snapshot = session.snapshot();
    expect(snapshot.state).toEqual({ value: 3 });
    session.reset();
    session.restore(snapshot);
    expect(session.read()).toEqual({ value: 3, mode: "idle" });
    for (const revision of ["documentDigest", "contractDigest", "blockId"])
      expect(() =>
        session.restore({ ...snapshot, [revision]: "stale" }),
      ).toThrow("Incompatible");
    expect(() =>
      session.restore({ ...snapshot, state: { value: 20 } }),
    ).toThrow();
    expect(() =>
      session.restore({ ...snapshot, state: { value: 2, mode: "running" } }),
    ).toThrow();
    expect(() =>
      session.restore({ ...snapshot, state: { value: 2 }, service: {} }),
    ).toThrow();
    expect(session.read()["value"]).toBe(3);
    let getterRan = false;
    expect(() =>
      session.restore({
        ...snapshot,
        get state() {
          getterRan = true;
          return { value: 2 };
        },
      }),
    ).toThrow("accessors");
    expect(getterRan).toBe(false);
  });
  it("rejects snapshot byte overflow even when individual bounded fields are valid", async () => {
    const original = compositionFixture();
    const entities = Array.from({ length: 5 }, (_, index) => ({
      id: `text${String(index)}`,
      kind: "input" as const,
      name: "Text",
      origin: "declared-rule" as const,
      binding: `/text${String(index)}`,
    }));
    const fields = entities.map((entry) => ({
      id: entry.id,
      binding: entry.binding,
      type: "string" as const,
      writable: true,
      shareable: true,
      maxLength: 4096,
    }));
    const instance = original.instances[0]!;
    const options: CompositionCompilation = {
      ...original,
      connections: [],
      instances: [
        {
          ...instance,
          data: Object.fromEntries(entities.map((entry) => [entry.id, ""])),
          semantics: {
            entities,
            composition: {
              ...instance.semantics.composition!,
              fields,
              presets: [],
              operations: [],
              views: [],
              ports: [],
              relations: [],
              observations: [],
              abstractions: [],
            },
          },
        },
      ],
    };
    const session = (await compiled(options))
      .createPlacement()
      .session("source");
    const snapshot = session.snapshot();
    expect(() =>
      session.restore({
        ...snapshot,
        state: Object.fromEntries(
          entities.map((entry) => [entry.id, "x".repeat(4096)]),
        ),
      }),
    ).toThrow("16 KiB");
    expect(session.read()["text0"]).toBe("");
  });
  it("batches ordered commands and propagates authored presets once with placement isolation", async () => {
    const module = await compiled();
    const a = module.createPlacement();
    const b = module.createPlacement();
    const seen: JsonPrimitive[] = [];
    a.observe("target", (views) => {
      seen.push(views["display"]!);
    });
    expect(
      await a.batch([
        { block: "source", kind: "action", id: "set", value: 2 },
        { block: "source", kind: "preset", id: "high" },
      ]),
    ).toEqual([]);
    expect(a.session("target").read()["value"]).toBe(8);
    expect(seen).toEqual([8]);
    expect(b.session("target").read()["value"]).toBe(1);
    expect(
      await a.batch([{ block: "source", kind: "reset", id: "reset" }]),
    ).toEqual([]);
    expect(a.session("target").read()["value"]).toBe(1);
  });
  it("isolates invalid commands and asynchronous host failures without poisoning subsequent batches", async () => {
    const placement = (await compiled()).createPlacement();
    placement.observe("source", () => Promise.reject(new Error("host failed")));
    const seen: JsonPrimitive[] = [];
    placement.observe("target", (views) => {
      seen.push(views["display"]!);
    });
    const errors = await placement.batch([
      { block: "missing", kind: "preset", id: "high" },
      { block: "source", kind: "action", id: "set", value: 6 },
    ]);
    expect(errors).toHaveLength(2);
    expect(seen).toEqual([6]);
    await placement.batch([
      { block: "source", kind: "action", id: "set", value: 7 },
    ]);
    expect(seen).toEqual([6, 7]);
    placement.dispose();
    placement.dispose();
    await expect(placement.batch([])).rejects.toThrow("disposed");
    expect(() => placement.session("source")).toThrow("disposed");
  });
  it("rejects absent ports, mismatched types, duplicate IDs and unsupported cycles", () => {
    const options = compositionFixture();
    expect(() =>
      compileComposition({
        ...options,
        connections: [
          {
            from: { block: "absent", port: "output" },
            to: { block: "target", port: "input" },
          },
        ],
      }),
    ).toThrow("Missing");
    expect(() =>
      compileComposition({
        ...options,
        instances: [options.instances[0]!, options.instances[0]!],
      }),
    ).toThrow("duplicate");
    expect(() =>
      compileComposition({
        ...options,
        connections: [
          ...options.connections,
          {
            from: { block: "target", port: "output" },
            to: { block: "source", port: "input" },
          },
        ],
      }),
    ).toThrow("cycle");
    const target = options.instances[1]!;
    const typed: CompositionCompilation = {
      ...options,
      instances: [
        options.instances[0]!,
        {
          ...target,
          data: { ...fixture.data, value: 1 },
          semantics: {
            ...target.semantics,
            composition: {
              ...target.semantics.composition!,
              fields: target.semantics.composition!.fields.map((field) =>
                field.id === "value" ? { ...field, type: "integer" } : field,
              ),
            },
          },
        },
      ],
    };
    expect(() => compileComposition(typed)).toThrow("type mismatch");
  });
  it("emits only used direct operations, with no reader tooling or semantic graph", () => {
    const code = compileComposition(compositionFixture());
    expect(code).not.toMatch(
      /\b(?:eval|Function|import|Ajv|validateSemantics|parseComposition)\b/u,
    );
    expect(code).not.toContain("series-axis");
    expect(code).not.toContain("observations");
    expect(code).toContain('case "set"');
    expect(code).toContain('case "start"');
  });
  it("exchanges finite typed preset IDs and rejects incompatible cross-block presets", async () => {
    const original = compositionFixture();
    const instances = original.instances.map((instance) => ({
      ...instance,
      semantics: {
        ...instance.semantics,
        composition: {
          ...instance.semantics.composition!,
          presets: [
            ...instance.semantics.composition!.presets,
            { id: "idle", values: { value: 1, mode: "idle" } },
            { id: "running", values: { value: 8, mode: "running" } },
          ],
          ports: [
            { id: "selected", direction: "output" as const, field: "mode" },
            {
              id: "choose-preset",
              direction: "input" as const,
              field: "mode",
              presetSelection: true,
            },
          ],
        },
      },
    }));
    const options: CompositionCompilation = {
      ...original,
      instances,
      connections: [
        {
          from: { block: "source", port: "selected" },
          to: { block: "target", port: "choose-preset" },
        },
      ],
    };
    const placement = (await compiled(options)).createPlacement();
    expect(
      await placement.batch([{ block: "source", kind: "action", id: "start" }]),
    ).toEqual([]);
    expect(placement.session("target").read()).toEqual({
      value: 8,
      mode: "running",
    });
    const invalid = structuredClone(options);
    const target = invalid.instances[1]!;
    const composition = target.semantics.composition!;
    (composition.presets as { id: string; values: unknown }[]).splice(2, 1);
    expect(() => compileComposition(invalid)).toThrow("preset IDs");
  });
  it("isolates failed receiving bounds while propagating other branches deterministically", async () => {
    const original = compositionFixture();
    const narrow = {
      ...original.instances[1]!,
      blockId: "narrow",
      semantics: {
        ...original.instances[1]!.semantics,
        composition: {
          ...original.instances[1]!.semantics.composition!,
          presets: [],
          operations:
            original.instances[1]!.semantics.composition!.operations.filter(
              (entry) => entry.kind !== "preset",
            ),
          observations: [],
          relations: [],
          fields: original.instances[1]!.semantics.composition!.fields.map(
            (entry) =>
              entry.id === "value" ? { ...entry, maximum: 2 } : entry,
          ),
        },
      },
    };
    const options: CompositionCompilation = {
      ...original,
      instances: [...original.instances, narrow],
      connections: [
        ...original.connections,
        {
          from: { block: "source", port: "output" },
          to: { block: "narrow", port: "input" },
        },
      ],
    };
    const placement = (await compiled(options)).createPlacement();
    const errors = await placement.batch([
      { block: "source", kind: "action", id: "set", value: 6 },
    ]);
    expect(errors).toMatchObject([{ block: "narrow" }]);
    expect(placement.session("target").read()["value"]).toBe(6);
    expect(placement.session("narrow").read()["value"]).toBe(1);
  });
  it("recognizes all standard abstractions without requiring pixel-specific rendering", () => {
    const original = compositionFixture().instances[0]!;
    const kinds = [
      "parameter-control",
      "plot",
      "series",
      "table",
      "state-diagram",
      "image-annotation",
      "scene-entity",
      "narrative-action",
    ] as const;
    const entities = kinds.map((kind, index) => ({
      id: `entity${String(index)}`,
      kind:
        kind === "parameter-control"
          ? ("input" as const)
          : kind === "scene-entity"
            ? ("concept" as const)
            : kind === "narrative-action"
              ? ("action" as const)
              : ("view" as const),
      name: kind,
      origin: "declared-rule" as const,
      binding: "/value",
    }));
    const declaration = {
      entities,
      composition: {
        ...original.semantics.composition!,
        fields: [],
        presets: [],
        operations: [],
        views: [],
        ports: [],
        relations: [],
        observations: [],
        abstractions: kinds.map((kind, index) => ({
          entity: entities[index]!.id,
          kind,
        })),
      },
    };
    expect(validateSemantics(declaration, original.data)).toEqual([]);
  });
  it("bounds hung asynchronous observers and cancels disposed placement work", async () => {
    const placement = (await compiled()).createPlacement();
    placement.observe(
      "source",
      () =>
        new Promise<void>(() => {
          /* Deliberately hung host service. */
        }),
    );
    const errors = await placement.batch([
      { block: "source", kind: "action", id: "set", value: 2 },
    ]);
    expect(errors[0]?.message).toContain("timeout");
    expect(placement.session("target").read()["value"]).toBe(2);
    const waiting = placement.batch([
      { block: "source", kind: "action", id: "set", value: 3 },
    ]);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    placement.dispose();
    expect((await waiting)[0]?.message).toContain("disposed");
  });
});
