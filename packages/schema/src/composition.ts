import { canonicalizeJson } from "./canonical.ts";
import { parseJson, assertUnicode } from "./strict-json.ts";
import { isPlainObject } from "./object.ts";
import { resolvePointer } from "./traversal.ts";
import type { JsonPrimitive } from "./json.ts";

export const COMPOSITION_PROFILE = "urn:publisle:composition:beta";
export type StateType = "number" | "integer" | "string" | "boolean";
export interface StateField {
  readonly id: string;
  readonly binding: string;
  readonly type: StateType;
  readonly writable: boolean;
  readonly shareable: boolean;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly maxLength?: number;
  readonly values?: readonly JsonPrimitive[];
}
export interface AuthoredPreset {
  readonly id: string;
  readonly values: Readonly<Record<string, JsonPrimitive>>;
}
export type BoundedOperation =
  | { readonly id: string; readonly kind: "assign"; readonly field: string }
  | { readonly id: string; readonly kind: "preset"; readonly preset: string }
  | {
      readonly id: string;
      readonly kind: "transition";
      readonly field: string;
      readonly from: JsonPrimitive;
      readonly to: JsonPrimitive;
    };
export interface CompositionProfile {
  readonly profile: typeof COMPOSITION_PROFILE;
  readonly fields: readonly StateField[];
  readonly presets: readonly AuthoredPreset[];
  readonly operations: readonly BoundedOperation[];
  readonly views: readonly { readonly id: string; readonly field: string }[];
  readonly abstractions: readonly {
    readonly entity: string;
    readonly kind:
      | "parameter-control"
      | "plot"
      | "series"
      | "table"
      | "state-diagram"
      | "image-annotation"
      | "scene-entity"
      | "narrative-action";
  }[];
  readonly relations: readonly {
    readonly id: string;
    readonly kind:
      | "dependency"
      | "containment"
      | "series-axis"
      | "action-state"
      | "narrative-preset";
    readonly from: string;
    readonly to: string;
  }[];
  readonly ports: readonly {
    readonly id: string;
    readonly direction: "input" | "output";
    readonly field: string;
    readonly presetSelection?: boolean;
  }[];
  readonly observations: readonly {
    readonly id: string;
    readonly preset: string;
    readonly output: string;
    readonly explanation: string;
    readonly assertion?: {
      readonly expected: JsonPrimitive;
      readonly tolerance: number;
      readonly provenance: {
        readonly producer: string;
        readonly evidence: string;
      };
    };
  }[];
}

function fail(message: string): never {
  throw new Error(`Invalid composition: ${message}`);
}
function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    return fail("unsupported object or property");
  return value;
}
function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || value.length > 128)
    return fail("expected array of at most 128 items");
  return value as unknown[];
}
function id(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !/^[A-Za-z][A-Za-z0-9_:.-]*$/u.test(value)
  )
    return fail("invalid stable ID");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 4096)
    return fail("invalid text");
  return value;
}
function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) fail("duplicate ID");
}

export function matchesStateField(
  field: StateField,
  value: unknown,
): value is JsonPrimitive {
  if (
    field.type === "integer"
      ? typeof value !== "number" || !Number.isSafeInteger(value)
      : typeof value !== field.type
  )
    return false;
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) ||
      (field.minimum !== undefined && value < field.minimum) ||
      (field.maximum !== undefined && value > field.maximum))
  )
    return false;
  if (typeof value === "string") {
    const limit = field.maxLength ?? 4096;
    if (value.length > limit * 2 || Array.from(value).length > limit)
      return false;
    try {
      assertUnicode(value);
    } catch {
      return false;
    }
  }
  return !field.values || field.values.includes(value as JsonPrimitive);
}

/** Preparation-only, closed and bounded. Unknown profiles are errors, not executable extensions. */
export function parseComposition(
  value: unknown,
  data: unknown,
  entities: readonly {
    readonly id: string;
    readonly kind: string;
    readonly binding?: string;
  }[],
): CompositionProfile {
  // Reject getters, non-JSON values and oversized declarations before inspecting them.
  const source = canonicalizeJson(value);
  canonicalizeJson(data);
  if (new TextEncoder().encode(source).byteLength > 64 * 1024)
    fail("profile exceeds 64 KiB");
  const root = object(parseJson(source), [
    "profile",
    "fields",
    "presets",
    "operations",
    "views",
    "abstractions",
    "relations",
    "ports",
    "observations",
  ]);
  if (root["profile"] !== COMPOSITION_PROFILE)
    fail("unsupported behavior profile");
  const entityMap = new Map(entities.map((entity) => [entity.id, entity.kind]));
  const entity = (value: unknown, kinds?: readonly string[]): string => {
    const key = id(value);
    const kind = entityMap.get(key);
    if (!kind || (kinds && !kinds.includes(kind)))
      fail(`missing or incompatible semantic entity ${key}`);
    return key;
  };
  const fields = list(root["fields"]).map((entry): StateField => {
    const item = object(entry, [
      "id",
      "binding",
      "type",
      "writable",
      "shareable",
      "minimum",
      "maximum",
      "maxLength",
      "values",
    ]);
    const key = entity(item["id"], ["input", "state", "output"]);
    if (
      !["number", "integer", "string", "boolean"].includes(
        String(item["type"]),
      ) ||
      typeof item["writable"] !== "boolean" ||
      typeof item["shareable"] !== "boolean" ||
      (item["shareable"] && !item["writable"]) ||
      typeof item["binding"] !== "string"
    )
      fail("invalid state field");
    for (const bound of ["minimum", "maximum"])
      if (
        item[bound] !== undefined &&
        (typeof item[bound] !== "number" ||
          !Number.isFinite(item[bound]) ||
          !["number", "integer"].includes(String(item["type"])))
      )
        fail("invalid numeric bound");
    if (
      typeof item["minimum"] === "number" &&
      typeof item["maximum"] === "number" &&
      item["minimum"] > item["maximum"]
    )
      fail("reversed bounds");
    if (
      item["maxLength"] !== undefined &&
      (item["type"] !== "string" ||
        typeof item["maxLength"] !== "number" ||
        !Number.isSafeInteger(item["maxLength"]) ||
        item["maxLength"] < 1 ||
        item["maxLength"] > 4096)
    )
      fail("invalid string bound");
    if (item["values"] !== undefined && list(item["values"]).length === 0)
      fail("empty enum");
    const field = { ...item, id: key } as unknown as StateField;
    if (entities.find((entry) => entry.id === key)?.binding !== field.binding)
      fail("state binding differs from semantic entity");
    const { values: allowedValues, ...withoutEnum } = field;
    if (
      allowedValues?.some(
        (candidate) => !matchesStateField(withoutEnum, candidate),
      )
    )
      fail("invalid enum value");
    const bound = resolvePointer(data, field.binding);
    if (!bound.found || !matchesStateField(field, bound.value))
      fail(`invalid initial binding ${key}`);
    return field;
  });
  unique(fields.map((field) => field.id));
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const field = (value: unknown, writable = false): StateField => {
    const found = fieldMap.get(id(value));
    if (!found || (writable && !found.writable))
      return fail("missing or readonly field");
    return found;
  };
  const presets = list(root["presets"]).map((entry): AuthoredPreset => {
    const item = object(entry, ["id", "values"]);
    const values = object(
      item["values"],
      fields.map((entry) => entry.id),
    );
    if (Object.keys(values).length === 0) fail("empty preset");
    for (const [key, candidate] of Object.entries(values))
      if (!matchesStateField(field(key, true), candidate))
        fail("invalid preset value");
    return {
      id: id(item["id"]),
      values: values as Readonly<Record<string, JsonPrimitive>>,
    };
  });
  unique(presets.map((preset) => preset.id));
  const preset = (value: unknown): string => {
    const key = id(value);
    if (!presets.some((entry) => entry.id === key)) fail("missing preset");
    return key;
  };
  const operations = list(root["operations"]).map((entry): BoundedOperation => {
    const item = object(entry, ["id", "kind", "field", "preset", "from", "to"]);
    const key = entity(item["id"], ["action"]);
    if (item["kind"] === "preset") {
      object(item, ["id", "kind", "preset"]);
      return { id: key, kind: "preset", preset: preset(item["preset"]) };
    }
    const target = field(item["field"], true);
    if (item["kind"] === "assign") {
      object(item, ["id", "kind", "field"]);
      return { id: key, kind: "assign", field: target.id };
    }
    if (item["kind"] !== "transition") return fail("unsupported operation");
    object(item, ["id", "kind", "field", "from", "to"]);
    if (
      !target.values ||
      !matchesStateField(target, item["from"]) ||
      !matchesStateField(target, item["to"])
    )
      fail("transition requires finite declared states");
    return {
      id: key,
      kind: "transition",
      field: target.id,
      from: item["from"],
      to: item["to"],
    };
  });
  unique(operations.map((entry) => entry.id));
  const views = list(root["views"]).map((entry) => {
    const item = object(entry, ["id", "field"]);
    return {
      id: entity(item["id"], ["view", "output"]),
      field: field(item["field"]).id,
    };
  });
  unique(views.map((entry) => entry.id));
  const abstractionKinds: Record<string, readonly string[]> = {
    "parameter-control": ["input"],
    plot: ["view"],
    series: ["view", "output"],
    table: ["view"],
    "state-diagram": ["view"],
    "image-annotation": ["view"],
    "scene-entity": ["concept", "view"],
    "narrative-action": ["action"],
  };
  const abstractions = list(root["abstractions"]).map((entry) => {
    const item = object(entry, ["entity", "kind"]);
    if (
      typeof item["kind"] !== "string" ||
      !Object.hasOwn(abstractionKinds, item["kind"])
    )
      fail("unsupported abstraction");
    return {
      entity: entity(item["entity"], abstractionKinds[item["kind"]]),
      kind: item["kind"],
    };
  });
  unique(abstractions.map((entry) => entry.entity));
  const relations = list(root["relations"]).map((entry) => {
    const item = object(entry, ["id", "kind", "from", "to"]);
    const kind = item["kind"];
    if (
      ![
        "dependency",
        "containment",
        "series-axis",
        "action-state",
        "narrative-preset",
      ].includes(String(kind))
    )
      fail("unsupported relation");
    const from = entity(
      item["from"],
      kind === "action-state" || kind === "narrative-preset"
        ? ["action"]
        : kind === "series-axis"
          ? ["view", "output"]
          : undefined,
    );
    const to =
      kind === "narrative-preset"
        ? preset(item["to"])
        : entity(
            item["to"],
            kind === "action-state"
              ? ["state"]
              : kind === "series-axis"
                ? ["quantity", "view"]
                : undefined,
          );
    return { id: id(item["id"]), kind, from, to };
  });
  unique(relations.map((entry) => entry.id));
  const ports = list(root["ports"]).map((entry) => {
    const item = object(entry, ["id", "direction", "field", "presetSelection"]);
    if (!["input", "output"].includes(String(item["direction"])))
      fail("invalid port direction");
    const target = field(item["field"], item["direction"] === "input");
    if (item["presetSelection"] !== undefined) {
      if (
        item["presetSelection"] !== true ||
        item["direction"] !== "input" ||
        target.type !== "string" ||
        !target.values ||
        target.values.some(
          (value) =>
            typeof value !== "string" ||
            !presets.some((entry) => entry.id === value),
        )
      )
        fail("preset port requires a finite enum of declared preset IDs");
    }
    return {
      id: id(item["id"]),
      direction: item["direction"],
      field: target.id,
      ...(item["presetSelection"] === true ? { presetSelection: true } : {}),
    };
  });
  unique(ports.map((entry) => entry.id));
  const observations = list(root["observations"]).map((entry) => {
    const item = object(entry, [
      "id",
      "preset",
      "output",
      "explanation",
      "assertion",
    ]);
    const output = entity(item["output"], ["output", "view"]);
    if (item["assertion"] !== undefined) {
      const assertion = object(item["assertion"], [
        "expected",
        "tolerance",
        "provenance",
      ]);
      if (
        typeof assertion["tolerance"] !== "number" ||
        !Number.isFinite(assertion["tolerance"]) ||
        assertion["tolerance"] < 0
      )
        fail("invalid tolerance");
      const target = views.find((view) => view.id === output)?.field ?? output;
      if (!matchesStateField(field(target), assertion["expected"]))
        fail("invalid expected output");
      const provenance = object(assertion["provenance"], [
        "producer",
        "evidence",
      ]);
      text(provenance["producer"]);
      text(provenance["evidence"]);
    }
    return {
      ...item,
      id: id(item["id"]),
      preset: preset(item["preset"]),
      output,
      explanation: text(item["explanation"]),
    };
  });
  unique(observations.map((entry) => entry.id));
  return {
    profile: COMPOSITION_PROFILE,
    fields,
    presets,
    operations,
    views,
    abstractions,
    relations,
    ports,
    observations,
  } as unknown as CompositionProfile;
}
