import {
  isPlainObject,
  resolvePointer,
  validateSemantics,
  type SemanticDiagnostic,
} from "@publisle/schema";
import {
  validateStructure,
  type ContractDiagnostic,
  type PortableJsonSchema,
} from "./validate.ts";

/** Offline verification against both actual data and explicitly declared schema locations. */
export function validateSemanticBindings(
  semantics: unknown,
  data: unknown,
  schema: PortableJsonSchema,
  dependencies: readonly PortableJsonSchema[] = [],
): {
  readonly valid: boolean;
  readonly diagnostics: readonly (SemanticDiagnostic | ContractDiagnostic)[];
} {
  const structure = validateStructure(data, schema, dependencies);
  if (!structure.valid) return structure;
  const diagnostics: (SemanticDiagnostic | ContractDiagnostic)[] = [
    ...validateSemantics(semantics, data),
  ];
  if (diagnostics.length) return { valid: false, diagnostics };
  if (!isPlainObject(semantics) || !Array.isArray(semantics["entities"]))
    return { valid: false, diagnostics };
  const schemas = new Map<string, PortableJsonSchema>();
  for (const candidate of [schema, ...dependencies])
    if (isPlainObject(candidate) && typeof candidate["$id"] === "string")
      schemas.set(candidate["$id"], candidate);
  let steps = 0;
  const declared = (
    candidate: unknown,
    root: unknown,
    tokens: readonly string[],
    depth: number,
  ): boolean => {
    if (++steps > 100_000 || depth > 128)
      throw new Error("Semantic binding schema traversal limit exceeded.");
    if (candidate === false) return false;
    if (tokens.length === 0) return true;
    if (!isPlainObject(candidate)) return false;
    const ref = candidate["$ref"];
    if (typeof ref === "string") {
      const separator = ref.indexOf("#");
      const id = separator < 0 ? ref : ref.slice(0, separator);
      const pointer =
        separator < 0 ? "" : decodeURIComponent(ref.slice(separator + 1));
      const target = id ? schemas.get(id) : root;
      if (target !== undefined) {
        const result = resolvePointer(target, pointer);
        if (result.found && declared(result.value, target, tokens, depth + 1))
          return true;
      }
    }
    const [key, ...rest] = tokens;
    const properties = candidate["properties"];
    if (
      isPlainObject(properties) &&
      key !== undefined &&
      Object.hasOwn(properties, key) &&
      declared(properties[key], root, rest, depth + 1)
    )
      return true;
    if (key !== undefined && /^(0|[1-9][0-9]*)$/u.test(key)) {
      const prefix = candidate["prefixItems"];
      const item: unknown =
        Array.isArray(prefix) && Number(key) < prefix.length
          ? prefix[Number(key)]
          : candidate["items"];
      if (item !== undefined && declared(item, root, rest, depth + 1))
        return true;
    }
    if (
      isPlainObject(candidate["additionalProperties"]) &&
      declared(candidate["additionalProperties"], root, rest, depth + 1)
    )
      return true;
    for (const keyword of ["allOf", "anyOf", "oneOf"]) {
      const branches = candidate[keyword];
      if (
        Array.isArray(branches) &&
        branches.some((branch: unknown) =>
          declared(branch, root, tokens, depth + 1),
        )
      )
        return true;
    }
    for (const keyword of ["then", "else"])
      if (
        candidate[keyword] !== undefined &&
        declared(candidate[keyword], root, tokens, depth + 1)
      )
        return true;
    return false;
  };
  for (const [index, entity] of (
    semantics["entities"] as unknown[]
  ).entries()) {
    if (!isPlainObject(entity) || typeof entity["binding"] !== "string")
      continue;
    try {
      const binding = entity["binding"];
      resolvePointer(data, binding); // Syntax check before splitting, including escapes/index rules.
      const tokens =
        binding === ""
          ? []
          : binding
              .slice(1)
              .split("/")
              .map((token) =>
                token.replaceAll("~1", "/").replaceAll("~0", "~"),
              );
      if (!declared(schema, schema, tokens, 0))
        diagnostics.push({
          code: "unresolved-semantic-binding",
          pointer: `/entities/${String(index)}/binding`,
          message: `Binding ${binding} is not declared by the structural contract.`,
        });
    } catch (error) {
      diagnostics.push({
        code: "unresolved-semantic-binding",
        pointer: `/entities/${String(index)}/binding`,
        message:
          error instanceof Error ? error.message : "Could not verify binding.",
      });
      if (steps > 100_000) break;
    }
  }
  return { valid: diagnostics.length === 0, diagnostics };
}
