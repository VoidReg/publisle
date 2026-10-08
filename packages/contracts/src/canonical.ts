import {
  assertUnicode,
  DEFAULT_JSON_LIMITS,
  JsonBoundaryError,
} from "@publisle/schema";

/** RFC 8785 JCS. Only JSON data properties are accepted; no hooks or coercion. */
export function canonicalizeJson(value: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  let bytes = 0;
  const encoder = new TextEncoder();
  const emit = (text: string): string => {
    bytes += encoder.encode(text).byteLength;
    if (bytes > DEFAULT_JSON_LIMITS.maxBytes) {
      throw new JsonBoundaryError(
        "json-limit-exceeded",
        "Canonical JSON exceeds byte limit",
        0,
      );
    }
    return text;
  };
  const fail = (): never => {
    throw new JsonBoundaryError(
      "invalid-json",
      "Canonicalization requires plain JSON data without cycles, holes or hooks",
      0,
    );
  };
  const visit = (entry: unknown, depth: number): string => {
    if (
      ++nodes > DEFAULT_JSON_LIMITS.maxNodes ||
      depth > DEFAULT_JSON_LIMITS.maxDepth
    ) {
      throw new JsonBoundaryError(
        "json-limit-exceeded",
        "Canonical JSON exceeds structural limit",
        0,
      );
    }
    if (entry === null || typeof entry === "boolean")
      return emit(String(entry));
    if (typeof entry === "string") {
      if (entry.length > DEFAULT_JSON_LIMITS.maxBytes) {
        throw new JsonBoundaryError(
          "json-limit-exceeded",
          "JSON string exceeds byte limit",
          0,
        );
      }
      assertUnicode(entry);
      return emit(JSON.stringify(entry));
    }
    if (typeof entry === "number") {
      if (!Number.isFinite(entry)) {
        throw new JsonBoundaryError(
          "invalid-json-number",
          "Non-finite JSON number",
          0,
        );
      }
      return emit(JSON.stringify(entry));
    }
    if (typeof entry !== "object" || ancestors.has(entry)) return fail();
    const prototype: unknown = Object.getPrototypeOf(entry);
    if (
      !Array.isArray(entry) &&
      prototype !== Object.prototype &&
      prototype !== null
    )
      return fail();
    if (Object.getOwnPropertySymbols(entry).length) return fail();
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(entry) && key === "length") continue;
      if (!descriptor.enumerable || !("value" in descriptor)) return fail();
    }
    ancestors.add(entry);
    let result: string;
    if (Array.isArray(entry)) {
      if (
        entry.length > DEFAULT_JSON_LIMITS.maxNodes ||
        Object.keys(descriptors).length !== entry.length + 1
      )
        return fail();
      const items: string[] = [];
      for (let index = 0; index < entry.length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) return fail();
        items.push(
          (index === 0 ? "" : emit(",")) + visit(descriptor.value, depth + 1),
        );
      }
      result = emit("[") + items.join("") + emit("]");
    } else {
      const keys = Object.keys(descriptors).sort(); // UTF-16 code-unit order, not locale/code points.
      const members = keys.map((key, index) => {
        if (key.length > DEFAULT_JSON_LIMITS.maxBytes) {
          throw new JsonBoundaryError(
            "json-limit-exceeded",
            "JSON key exceeds byte limit",
            0,
          );
        }
        assertUnicode(key);
        return (
          (index === 0 ? "" : emit(",")) +
          emit(JSON.stringify(key)) +
          emit(":") +
          visit(descriptors[key]?.value, depth + 1)
        );
      });
      result = emit("{") + members.join("") + emit("}");
    }
    ancestors.delete(entry);
    if (bytes > DEFAULT_JSON_LIMITS.maxBytes) {
      throw new JsonBoundaryError(
        "json-limit-exceeded",
        "Canonical JSON exceeds byte limit",
        0,
      );
    }
    return result;
  };
  return visit(value, 0);
}

/** Exact UTF-8 JCS preimage; no fields are implicitly excluded. */
export async function digestJson(value: unknown): Promise<`sha256:${string}`> {
  const bytes = new TextEncoder().encode(canonicalizeJson(value));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
