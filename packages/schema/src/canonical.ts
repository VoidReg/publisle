import {
  assertUnicode,
  DEFAULT_JSON_LIMITS,
  JsonBoundaryError,
} from "./strict-json.ts";

/** RFC 8785 JCS. Only JSON data properties are accepted; no hooks or coercion. */
export function canonicalizeJson(value: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  let bytes = 0;
  let encoder: TextEncoder | undefined;
  const emit = (text: string): string => {
    // Native encoding wins for large ASCII strings; avoid its buffer allocation
    // for the many small fragments emitted by declarations and document trees.
    bytes +=
      text.length >= 1024
        ? (encoder ??= new TextEncoder()).encode(text).byteLength
        : utf8ByteLength(text);
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

/** Emitted fragments contain valid Unicode; count UTF-8 without allocating a buffer. */
function utf8ByteLength(text: string): number {
  let bytes = text.length;
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (unit < 0x80) continue;
    if (unit < 0x800) bytes += 1;
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      // A valid surrogate pair occupies two UTF-16 units and four UTF-8 bytes.
      bytes += 2;
      index++;
    } else bytes += 2;
  }
  return bytes;
}
