import { isJsonValue, type JsonValue } from "./json.ts";
import { canonicalizeJson } from "./canonical.ts";
import { isPlainObject } from "./object.ts";
import { resolvePointer, TraversalError } from "./traversal.ts";
import { parseComposition, type CompositionProfile } from "./composition.ts";

export type SemanticKind =
  | "concept"
  | "quantity"
  | "input"
  | "output"
  | "action"
  | "state"
  | "view"
  | "assumption"
  | "evidence"
  | "relation";
export interface SemanticEntity {
  readonly id: string;
  readonly kind: SemanticKind;
  readonly name: string;
  readonly description?: string;
  readonly origin: "authored" | "declared-rule" | "calculated-result";
  /** Fixed location in normalized block.data, not a wildcard or UI selector. */
  readonly binding?: string;
  readonly references?: readonly string[];
  readonly unit?: string;
  readonly dimension?: string;
  readonly domain?: JsonValue;
  readonly default?: JsonValue;
  readonly initial?: JsonValue;
  readonly reset?: string;
  readonly transient?: boolean;
  readonly role?: string;
  readonly interpretation?: string;
  readonly valueType?:
    "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
  readonly effects?: readonly string[];
  readonly inputs?: readonly string[];
  readonly results?: readonly string[];
  readonly source?: string;
  /** Describes portability, never promises execution or scientific equivalence. */
  readonly implementation?: {
    readonly status: "declarative" | "implementation-bound";
    readonly identity?: string;
    readonly limitation?: string;
  };
}
export interface SemanticDeclaration {
  readonly entities: readonly SemanticEntity[];
  readonly composition?: CompositionProfile;
}
export interface SemanticDiagnostic {
  readonly code:
    | "invalid-semantics"
    | "duplicate-semantic-id"
    | "unresolved-semantic-reference"
    | "unresolved-semantic-binding";
  readonly pointer: string;
  readonly message: string;
}
const kinds: readonly string[] = [
  "concept",
  "quantity",
  "input",
  "output",
  "action",
  "state",
  "view",
  "assumption",
  "evidence",
  "relation",
];
const keys = new Set([
  "id",
  "kind",
  "name",
  "description",
  "origin",
  "binding",
  "references",
  "unit",
  "dimension",
  "domain",
  "default",
  "initial",
  "reset",
  "transient",
  "role",
  "interpretation",
  "implementation",
  "valueType",
  "effects",
  "inputs",
  "results",
  "source",
]);

function matchesType(value: unknown, type: unknown): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  if (type === "integer")
    return typeof value === "number" && Number.isInteger(value);
  return typeof value === type;
}

/** Data-only validation; no callbacks, querying, simulation or schema evaluation. */
export function validateSemantics(
  value: unknown,
  data: unknown,
): readonly SemanticDiagnostic[] {
  const diagnostics: SemanticDiagnostic[] = [];
  try {
    canonicalizeJson(value);
    canonicalizeJson(data);
  } catch (error) {
    return [
      {
        code: "invalid-semantics",
        pointer: "",
        message:
          error instanceof Error
            ? error.message
            : "Semantics must be bounded JSON data.",
      },
    ];
  }
  const add = (
    code: SemanticDiagnostic["code"],
    pointer: string,
    message: string,
  ): void => {
    diagnostics.push({ code, pointer, message });
  };
  if (
    !isPlainObject(value) ||
    !Array.isArray(value["entities"]) ||
    Object.keys(value).some(
      (key) => key !== "entities" && key !== "composition",
    ) ||
    value["entities"].length > 4096
  ) {
    add(
      "invalid-semantics",
      "",
      "Expected a bounded semantic entities declaration.",
    );
    return diagnostics;
  }
  const entities: unknown[] = value["entities"];
  const ids = new Set<string>();
  for (const [index, entity] of entities.entries()) {
    const pointer = `/entities/${String(index)}`;
    if (
      !isPlainObject(entity) ||
      typeof entity["id"] !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_:.-]*$(?![\s\S])/u.test(entity["id"]) ||
      typeof entity["name"] !== "string" ||
      !entity["name"].trim() ||
      typeof entity["kind"] !== "string" ||
      !kinds.includes(entity["kind"]) ||
      !["authored", "declared-rule", "calculated-result"].includes(
        String(entity["origin"]),
      ) ||
      Object.keys(entity).some((key) => !keys.has(key))
    ) {
      add(
        "invalid-semantics",
        pointer,
        "Entity requires a stable id, kind, name and explicit origin; unknown fields are unsupported.",
      );
      continue;
    }
    if (ids.has(entity["id"]))
      add(
        "duplicate-semantic-id",
        `${pointer}/id`,
        `Duplicate semantic id ${entity["id"]}.`,
      );
    ids.add(entity["id"]);
    for (const key of [
      "description",
      "unit",
      "dimension",
      "reset",
      "role",
      "interpretation",
      "source",
    ]) {
      if (entity[key] !== undefined && typeof entity[key] !== "string")
        add(
          "invalid-semantics",
          `${pointer}/${key}`,
          `${key} must be a string.`,
        );
    }
    if (
      entity["valueType"] !== undefined &&
      ![
        "string",
        "number",
        "integer",
        "boolean",
        "object",
        "array",
        "null",
      ].includes(
        typeof entity["valueType"] === "string" ? entity["valueType"] : "",
      )
    )
      add("invalid-semantics", `${pointer}/valueType`, "Unknown value type.");
    if (
      entity["transient"] !== undefined &&
      typeof entity["transient"] !== "boolean"
    )
      add(
        "invalid-semantics",
        `${pointer}/transient`,
        "transient must be boolean.",
      );
    for (const key of ["domain", "default", "initial"]) {
      if (entity[key] !== undefined && !isJsonValue(entity[key]))
        add(
          "invalid-semantics",
          `${pointer}/${key}`,
          `${key} must be JSON data.`,
        );
      if (
        key !== "domain" &&
        entity[key] !== undefined &&
        entity["valueType"] !== undefined &&
        !matchesType(entity[key], entity["valueType"])
      )
        add(
          "invalid-semantics",
          `${pointer}/${key}`,
          `${key} does not match the declared value type.`,
        );
    }
    const implementation = entity["implementation"];
    if (
      implementation !== undefined &&
      (!isPlainObject(implementation) ||
        !["declarative", "implementation-bound"].includes(
          String(implementation["status"]),
        ) ||
        Object.keys(implementation).some(
          (key) => !["status", "identity", "limitation"].includes(key),
        ) ||
        ["identity", "limitation"].some(
          (key) =>
            implementation[key] !== undefined &&
            typeof implementation[key] !== "string",
        ) ||
        (implementation["status"] === "implementation-bound" &&
          (typeof implementation["limitation"] !== "string" ||
            !implementation["limitation"].trim())))
    )
      add(
        "invalid-semantics",
        `${pointer}/implementation`,
        "Implementation-bound behavior must declare its limitation.",
      );
    const binding = entity["binding"];
    if (
      binding === undefined &&
      ["input", "output", "state", "view"].includes(entity["kind"]) &&
      (!isPlainObject(implementation) ||
        implementation["status"] !== "implementation-bound")
    )
      add(
        "unresolved-semantic-binding",
        `${pointer}/binding`,
        "A structural binding or an explicit implementation-bound limitation is required.",
      );
    if (binding !== undefined) {
      try {
        const location =
          typeof binding === "string"
            ? resolvePointer(data, binding)
            : { found: false };
        if (!location.found)
          add(
            "unresolved-semantic-binding",
            `${pointer}/binding`,
            `Binding ${typeof binding === "string" ? binding : "(non-string)"} does not exist in this instance.`,
          );
        else if (
          entity["valueType"] !== undefined &&
          !matchesType(location.value, entity["valueType"])
        )
          add(
            "invalid-semantics",
            `${pointer}/binding`,
            "Bound value does not match its declared semantic value type.",
          );
      } catch (error) {
        if (!(error instanceof TraversalError)) throw error;
        add("unresolved-semantic-binding", `${pointer}/binding`, error.message);
      }
    }
  }
  for (const [index, entity] of entities.entries()) {
    if (!isPlainObject(entity)) continue;
    for (const key of ["references", "effects", "inputs", "results"]) {
      const refs = entity[key];
      if (refs !== undefined) {
        if (
          !Array.isArray(refs) ||
          refs.length > 4096 ||
          refs.some((ref: unknown) => typeof ref !== "string")
        )
          add(
            "invalid-semantics",
            `/entities/${String(index)}/${key}`,
            `${key} must be a bounded array of semantic ids.`,
          );
        else
          for (const [refIndex, ref] of (refs as string[]).entries())
            if (!ids.has(ref))
              add(
                "unresolved-semantic-reference",
                `/entities/${String(index)}/${key}/${String(refIndex)}`,
                `Semantic id ${ref} does not exist.`,
              );
      }
    }
    if (typeof entity["reset"] === "string" && !ids.has(entity["reset"]))
      add(
        "unresolved-semantic-reference",
        `/entities/${String(index)}/reset`,
        `Reset action ${entity["reset"]} does not exist.`,
      );
    else if (
      typeof entity["reset"] === "string" &&
      !entities.some(
        (candidate) =>
          isPlainObject(candidate) &&
          candidate["id"] === entity["reset"] &&
          candidate["kind"] === "action",
      )
    )
      add(
        "invalid-semantics",
        `/entities/${String(index)}/reset`,
        "Reset must reference an action.",
      );
  }
  if (diagnostics.length === 0 && value["composition"] !== undefined) {
    try {
      parseComposition(
        value["composition"],
        data,
        entities as SemanticEntity[],
      );
    } catch (error) {
      add(
        "invalid-semantics",
        "/composition",
        error instanceof Error ? error.message : "Invalid composition",
      );
    }
  }
  return diagnostics;
}
