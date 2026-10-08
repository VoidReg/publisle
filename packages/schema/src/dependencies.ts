import { isPlainObject } from "./object.ts";
import { parseBlockType } from "./block-type.ts";
import { SchemaParseError } from "./error.ts";

/** Immutable references only. Locations/catalogs belong to host resolution policy. */
export interface ContractDependency {
  readonly type: `${string}:${string}`;
  readonly schemaVersion: number;
  readonly id: string;
  readonly digest: `sha256:${string}`;
}
export function parseContractDependencies(
  value: unknown,
): readonly ContractDependency[] {
  if (!Array.isArray(value) || value.length > 128)
    throw new SchemaParseError(
      "invalid-contract-dependencies",
      "Dependencies must be an array of at most 128 immutable pins.",
    );
  const used = new Set<string>();
  return value.map((entry: unknown) => {
    if (
      !isPlainObject(entry) ||
      Object.keys(entry).some(
        (key) => !["type", "schemaVersion", "id", "digest"].includes(key),
      )
    )
      throw new SchemaParseError(
        "invalid-contract-dependencies",
        "Invalid dependency record.",
      );
    if (typeof entry["type"] !== "string")
      throw new SchemaParseError(
        "invalid-contract-dependencies",
        "Dependency type must be a string.",
      );
    const type = parseBlockType(entry["type"]);
    const version = entry["schemaVersion"];
    const digest = entry["digest"];
    if (
      typeof version !== "number" ||
      !Number.isSafeInteger(version) ||
      version < 1 ||
      typeof digest !== "string" ||
      !/^sha256:[0-9a-f]{64}$/u.test(digest) ||
      entry["id"] !== `urn:publisle:contract:${digest}`
    )
      throw new SchemaParseError(
        "invalid-contract-dependencies",
        "A dependency requires an exact payload version and matching immutable identity/digest.",
      );
    const key = `${type}@${String(version)}`;
    if (used.has(key))
      throw new SchemaParseError(
        "invalid-contract-dependencies",
        `Duplicate dependency: ${key}`,
      );
    used.add(key);
    return {
      type,
      schemaVersion: version,
      id: `urn:publisle:contract:${digest}`,
      digest: digest as `sha256:${string}`,
    };
  });
}
