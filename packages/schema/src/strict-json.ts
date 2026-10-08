import type { JsonValue } from "./json.ts";

export type JsonBoundaryCode =
  | "invalid-json"
  | "duplicate-json-member"
  | "invalid-json-unicode"
  | "invalid-json-number"
  | "json-limit-exceeded";

export class JsonBoundaryError extends Error {
  readonly code: JsonBoundaryCode;
  readonly offset: number;
  constructor(code: JsonBoundaryCode, message: string, offset: number) {
    super(`${message} (offset ${String(offset)}).`);
    this.name = "JsonBoundaryError";
    this.code = code;
    this.offset = offset;
  }
}

export interface JsonBoundaryLimits {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

export const DEFAULT_JSON_LIMITS = Object.freeze({
  maxBytes: 2 * 1024 * 1024,
  maxDepth: 128,
  maxNodes: 100_000,
});

/** Reject lone UTF-16 surrogates without normalizing valid Unicode. */
export function assertUnicode(value: string, offset = 0): void {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index++;
        continue;
      }
    } else if (unit < 0xdc00 || unit > 0xdfff) {
      continue;
    }
    throw new JsonBoundaryError(
      "invalid-json-unicode",
      "JSON strings must contain valid Unicode",
      offset + index,
    );
  }
}

/** Strict text/UTF-8 boundary: duplicates are checked before constructing objects. */
export function parseJson(
  input: string | Uint8Array,
  limits: JsonBoundaryLimits = {},
): JsonValue {
  const bounds = { ...DEFAULT_JSON_LIMITS, ...limits };
  for (const limit of Object.values(bounds)) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError("JSON limits must be positive safe integers.");
    }
  }
  // Check UTF-16 length before allocating an encoded copy of oversized text.
  if (input.length > bounds.maxBytes) {
    throw new JsonBoundaryError(
      "json-limit-exceeded",
      "JSON exceeds byte limit",
      0,
    );
  }
  let source: string;
  if (typeof input === "string") {
    assertUnicode(input);
    if (new TextEncoder().encode(input).byteLength > bounds.maxBytes) {
      throw new JsonBoundaryError(
        "json-limit-exceeded",
        "JSON exceeds byte limit",
        0,
      );
    }
    source = input;
  } else {
    try {
      source = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(input);
    } catch {
      throw new JsonBoundaryError("invalid-json-unicode", "Invalid UTF-8", 0);
    }
  }
  let position = 0;
  let nodes = 0;
  const fail = (message: string): never => {
    throw new JsonBoundaryError("invalid-json", message, position);
  };
  const whitespace = () => {
    while (/[\x20\t\r\n]/u.test(source[position] ?? "")) position++;
  };
  const string = (): string => {
    const start = position++;
    while (position < source.length) {
      const char = source[position++];
      if (char === "\\") {
        position++;
      } else if (char === '"') {
        let result: unknown;
        try {
          result = JSON.parse(source.slice(start, position));
        } catch {
          return fail("Malformed JSON string");
        }
        if (typeof result !== "string") return fail("Expected JSON string");
        try {
          assertUnicode(result);
        } catch {
          throw new JsonBoundaryError(
            "invalid-json-unicode",
            "JSON string contains an invalid Unicode sequence",
            start,
          );
        }
        return result;
      }
    }
    return fail("Unterminated JSON string");
  };
  const numberPattern = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  const read = (depth: number): JsonValue => {
    if (depth > bounds.maxDepth || ++nodes > bounds.maxNodes) {
      throw new JsonBoundaryError(
        "json-limit-exceeded",
        "JSON exceeds structural limit",
        position,
      );
    }
    whitespace();
    const char = source[position];
    if (char === '"') return string();
    if (char === "{") {
      position++;
      whitespace();
      const members = new Set<string>();
      const result: Record<string, JsonValue> = {};
      if (source[position] === "}") {
        position++;
        return result;
      }
      for (;;) {
        whitespace();
        if (source[position] !== '"')
          return fail("Expected object member name");
        const keyOffset = position;
        const key = string();
        if (members.has(key)) {
          throw new JsonBoundaryError(
            "duplicate-json-member",
            "Duplicate object member",
            keyOffset,
          );
        }
        members.add(key);
        whitespace();
        if (source[position++] !== ":") return fail("Expected colon");
        const value = read(depth + 1);
        // defineProperty preserves __proto__ as data, not a prototype setter.
        Object.defineProperty(result, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
        whitespace();
        const separator = source[position++];
        if (separator === "}") return result;
        if (separator !== ",") return fail("Expected comma or closing brace");
      }
    }
    if (char === "[") {
      position++;
      whitespace();
      const result: JsonValue[] = [];
      if (source[position] === "]") {
        position++;
        return result;
      }
      for (;;) {
        result.push(read(depth + 1));
        whitespace();
        const separator = source[position++];
        if (separator === "]") return result;
        if (separator !== ",") return fail("Expected comma or closing bracket");
      }
    }
    for (const [token, value] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (source.startsWith(token, position)) {
        position += token.length;
        return value;
      }
    }
    numberPattern.lastIndex = position;
    const match = numberPattern.exec(source);
    if (!match) return fail("Expected JSON value");
    const value = Number(match[0]);
    if (!Number.isFinite(value)) {
      throw new JsonBoundaryError(
        "invalid-json-number",
        "JSON number exceeds binary64 domain",
        position,
      );
    }
    position = numberPattern.lastIndex;
    return value;
  };
  const result = read(0);
  whitespace();
  if (position !== source.length) fail("Unexpected trailing input");
  return result;
}
