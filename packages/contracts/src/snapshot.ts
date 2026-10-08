import {
  canonicalizeJson,
  type CompositionProfile,
  type JsonObject,
  type JsonValue,
} from "@publisle/schema";
import { validateStructure, type StructuralValidation } from "./validate.ts";

export interface SnapshotTarget {
  readonly documentDigest: string;
  readonly contractDigest: string;
  readonly blockId: string;
}

/** Preparation-only schema export for an already validated composition profile. */
export function createSnapshotSchema(
  profile: CompositionProfile,
  target: SnapshotTarget,
): JsonObject {
  canonicalizeJson(profile);
  canonicalizeJson(target);
  if (
    !/^sha256:[a-f0-9]{64}$/u.test(target.documentDigest) ||
    !/^sha256:[a-f0-9]{64}$/u.test(target.contractDigest) ||
    !target.blockId ||
    target.blockId.length > 128
  )
    throw new Error("Invalid snapshot target or profile");
  const properties: Record<string, JsonValue> = Object.create(null) as Record<
    string,
    JsonValue
  >;
  for (const field of profile.fields.filter((field) => field.shareable)) {
    if (!field.writable) throw new Error("Readonly snapshot field");
    properties[field.id] = {
      type: field.type,
      ...(field.type === "integer"
        ? {
            minimum: Math.max(
              field.minimum ?? Number.MIN_SAFE_INTEGER,
              Number.MIN_SAFE_INTEGER,
            ),
            maximum: Math.min(
              field.maximum ?? Number.MAX_SAFE_INTEGER,
              Number.MAX_SAFE_INTEGER,
            ),
          }
        : {
            ...(field.minimum === undefined ? {} : { minimum: field.minimum }),
            ...(field.maximum === undefined ? {} : { maximum: field.maximum }),
          }),
      ...(field.type === "string"
        ? { maxLength: field.maxLength ?? 4096 }
        : {}),
      ...(field.values ? { enum: field.values } : {}),
    };
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    description:
      "Publisle beta snapshot: enforce a separate 16 KiB UTF-8 JSON limit; hosts own transport and strict JSON ingestion.",
    type: "object",
    properties: {
      profile: { const: "urn:publisle:snapshot:beta" },
      documentDigest: { const: target.documentDigest },
      contractDigest: { const: target.contractDigest },
      blockId: { const: target.blockId },
      state: {
        type: "object",
        properties,
        required: Object.keys(properties),
        additionalProperties: false,
      },
    },
    required: [
      "profile",
      "documentDigest",
      "contractDigest",
      "blockId",
      "state",
    ],
    additionalProperties: false,
  };
}

/** Offline backend validation. Byte limits are policy, not JSON Schema format assertions. */
export function validateSnapshot(
  value: unknown,
  schema: JsonObject,
): StructuralValidation {
  try {
    if (new TextEncoder().encode(canonicalizeJson(value)).byteLength > 16384)
      throw new Error("Snapshot exceeds 16 KiB");
  } catch (error) {
    return {
      valid: false,
      diagnostics: [
        {
          code: "invalid-data",
          pointer: "",
          message:
            error instanceof Error ? error.message : "Invalid snapshot JSON",
        },
      ],
    };
  }
  return validateStructure(value, schema);
}
