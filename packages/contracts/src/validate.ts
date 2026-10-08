import { Ajv2020 } from "ajv/dist/2020.js";
import { isPlainObject, parseJson, type JsonObject } from "@publisle/schema";
import { canonicalizeJson } from "./canonical.ts";
import { PORTABLE_PATTERNS } from "./patterns.ts";

export type PortableJsonSchema = boolean | JsonObject;
export interface ContractDiagnostic {
  readonly code:
    | "invalid-contract"
    | "unsupported-contract"
    | "invalid-json"
    | "invalid-data";
  readonly message: string;
  readonly pointer: string;
}
export interface StructuralValidation {
  readonly valid: boolean;
  readonly diagnostics: readonly ContractDiagnostic[];
}

const draft = "https://json-schema.org/draft/2020-12/schema";
const keywords = new Set([
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "$vocabulary",
  "title",
  "description",
  "default",
  "examples",
  "$comment",
  "deprecated",
  "readOnly",
  "writeOnly",
  "type",
  "enum",
  "const",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minProperties",
  "maxProperties",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
]);
const vocabularies = new Set([
  "https://json-schema.org/draft/2020-12/vocab/core",
  "https://json-schema.org/draft/2020-12/vocab/applicator",
  "https://json-schema.org/draft/2020-12/vocab/validation",
  "https://json-schema.org/draft/2020-12/vocab/meta-data",
  "https://json-schema.org/draft/2020-12/vocab/format-annotation",
]);
const patterns = new Set<string>(Object.values(PORTABLE_PATTERNS));
const escape = (value: string) =>
  value.replaceAll("~", "~0").replaceAll("/", "~1");

/** Preparation-only, synchronous offline validation. This is not a plugin sandbox. */
export function validateStructure(
  value: unknown,
  schema: PortableJsonSchema,
  dependencies: readonly PortableJsonSchema[] = [],
): StructuralValidation {
  const diagnostics: ContractDiagnostic[] = [];
  const unsupported = (message: string, pointer: string) => {
    diagnostics.push({ code: "unsupported-contract", message, pointer });
  };
  if (dependencies.length > 128) {
    unsupported("Schema dependency count exceeds 128.", "");
    return { valid: false, diagnostics };
  }
  // Clone only validated JSON; schema inspection never invokes user accessors/hooks.
  let sources: ReturnType<typeof parseJson>[];
  let input: ReturnType<typeof parseJson>;
  let schemaBytes = 0;
  try {
    sources = [schema, ...dependencies].map((entry) => {
      const text = canonicalizeJson(entry);
      schemaBytes += new TextEncoder().encode(text).byteLength;
      if (schemaBytes > 8 * 1024 * 1024)
        throw new RangeError("Supplied schema set exceeds 8 MiB.");
      return parseJson(text);
    });
    input = parseJson(canonicalizeJson(value));
  } catch (error) {
    return {
      valid: false,
      diagnostics: [
        {
          code: "invalid-json",
          message:
            error instanceof Error ? error.message : "Invalid JSON data.",
          pointer: "",
        },
      ],
    };
  }
  const locations = new Map<
    string,
    {
      node: Record<string, unknown>;
      base: string;
      pointer: string;
      edges: string[];
    }
  >();
  const roots = new Map<string, PortableJsonSchema>();
  let count = 0;
  const inspect = (
    node: unknown,
    base: string,
    pointer: string,
    depth: number,
  ): void => {
    if (++count > 4096 || depth > 64) {
      unsupported("Schema complexity limit exceeded.", pointer);
      return;
    }
    if (typeof node === "boolean") {
      locations.set(base + "#" + pointer, {
        node: {},
        base,
        pointer,
        edges: [],
      });
      return;
    }
    if (!isPlainObject(node)) {
      diagnostics.push({
        code: "invalid-contract",
        message: "Schema must be an object or boolean.",
        pointer,
      });
      return;
    }
    const location = { node, base, pointer, edges: [] as string[] };
    locations.set(base + "#" + pointer, location);
    for (const key of Object.keys(node)) {
      if (!keywords.has(key))
        unsupported(
          `Unsupported schema keyword ${key}.`,
          pointer + "/" + escape(key),
        );
    }
    if (
      pointer &&
      (node["$id"] !== undefined ||
        node["$schema"] !== undefined ||
        node["$vocabulary"] !== undefined)
    ) {
      unsupported(
        "Dialect, vocabulary and ID declarations are root-only in this profile.",
        pointer,
      );
    }
    if (node["$schema"] !== undefined && node["$schema"] !== draft)
      unsupported("Unsupported JSON Schema dialect.", pointer);
    if (
      node["pattern"] !== undefined &&
      (typeof node["pattern"] !== "string" || !patterns.has(node["pattern"]))
    ) {
      unsupported(
        "Pattern is outside the reviewed portable pattern set.",
        pointer + "/pattern",
      );
    }
    if (isPlainObject(node["$vocabulary"])) {
      for (const [uri, required] of Object.entries(node["$vocabulary"])) {
        if (required === true && !vocabularies.has(uri))
          unsupported(`Unsupported required vocabulary ${uri}.`, pointer);
      }
    }
    for (const key of ["$defs", "properties"]) {
      const entries = node[key];
      if (isPlainObject(entries)) {
        for (const [name, child] of Object.entries(entries))
          inspect(
            child,
            base,
            pointer + "/" + key + "/" + escape(name),
            depth + 1,
          );
      }
    }
    for (const key of [
      "items",
      "additionalProperties",
      "not",
      "if",
      "then",
      "else",
    ]) {
      if (node[key] === undefined) continue;
      const childPointer = pointer + "/" + key;
      inspect(node[key], base, childPointer, depth + 1);
      if (["not", "if", "then", "else"].includes(key))
        location.edges.push(base + "#" + childPointer);
    }
    for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
      const entries = node[key];
      if (!Array.isArray(entries)) continue;
      if (entries.length > 16) {
        unsupported("Schema branch count exceeds 16.", pointer + "/" + key);
        continue;
      }
      entries.forEach((child: unknown, index: number) => {
        const childPointer = pointer + "/" + key + "/" + String(index);
        inspect(child, base, childPointer, depth + 1);
        if (key !== "prefixItems")
          location.edges.push(base + "#" + childPointer);
      });
    }
  };
  sources.forEach((source, index) => {
    if (typeof source !== "boolean" && !isPlainObject(source)) {
      diagnostics.push({
        code: "invalid-contract",
        message: "Schema must be an object or boolean.",
        pointer: "",
      });
      return;
    }
    const id = typeof source === "boolean" ? undefined : source["$id"];
    if (typeof id === "string" && !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(id)) {
      unsupported("Schema IDs must be absolute resource identifiers.", "");
      return;
    }
    const base =
      typeof id === "string"
        ? id
        : `urn:publisle:anonymous-schema:${String(index)}`;
    if (roots.has(base) || base.includes("#")) {
      unsupported("Duplicate schema ID or ID containing a fragment.", "");
      return;
    }
    roots.set(base, source);
    inspect(source, base, "", 0);
  });
  for (const location of locations.values()) {
    const ref = location.node["$ref"];
    if (ref === undefined) continue;
    if (typeof ref !== "string") {
      diagnostics.push({
        code: "invalid-contract",
        message: "$ref must be a string.",
        pointer: location.pointer,
      });
      continue;
    }
    const separator = ref.indexOf("#");
    const base =
      separator === 0
        ? location.base
        : separator < 0
          ? ref
          : ref.slice(0, separator);
    let pointer: string;
    try {
      pointer =
        separator < 0 ? "" : decodeURIComponent(ref.slice(separator + 1));
    } catch {
      unsupported("Malformed reference fragment.", location.pointer);
      continue;
    }
    const target = base + "#" + pointer;
    if (!locations.has(target)) {
      unsupported(
        "Reference is not in the supplied verified schema set.",
        location.pointer + "/$ref",
      );
    } else {
      location.edges.push(target);
    }
  }
  // Recursion is allowed only after descending into a child instance. A ref/allOf
  // cycle evaluating the same value forever is not a productive recursive schema.
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (key: string, depth: number): void => {
    if (active.has(key) || depth > 128) {
      unsupported(
        "Non-productive reference cycle or excessive evaluation depth.",
        locations.get(key)?.pointer ?? "",
      );
      return;
    }
    if (visited.has(key)) return;
    active.add(key);
    for (const edge of locations.get(key)?.edges ?? []) visit(edge, depth + 1);
    active.delete(key);
    visited.add(key);
  };
  for (const key of locations.keys()) visit(key, 0);
  if (diagnostics.length) return { valid: false, diagnostics };
  try {
    const ajv = new Ajv2020({
      strict: false,
      strictNumbers: true,
      allErrors: false,
      validateFormats: false,
      useDefaults: false,
      coerceTypes: false,
      removeAdditional: false,
      ownProperties: true,
    });
    for (const dependency of sources.slice(1)) {
      if (typeof dependency === "boolean" || isPlainObject(dependency))
        ajv.addSchema(dependency);
    }
    const root = sources[0];
    if (typeof root !== "boolean" && !isPlainObject(root))
      throw new Error("Invalid root schema.");
    const validate = ajv.compile(root);
    if (validate(input)) return { valid: true, diagnostics: [] };
    return {
      valid: false,
      diagnostics: (validate.errors ?? []).map((error) => ({
        code: "invalid-data",
        message: error.message ?? "Schema validation failed.",
        pointer: error.instancePath,
      })),
    };
  } catch (error) {
    return {
      valid: false,
      diagnostics: [
        {
          code: "invalid-contract",
          message: error instanceof Error ? error.message : "Invalid schema.",
          pointer: "",
        },
      ],
    };
  }
}
