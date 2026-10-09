import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseJson, JsonBoundaryError } from "@publisle/schema";
import cases from "../fixtures/canonical.json" with { type: "json" };
import invalid from "../fixtures/invalid-json.json" with { type: "json" };
import { canonicalizeJson, digestJson } from "@publisle/contracts";

describe("shared JSON/JCS fixtures", () => {
  for (const fixture of cases) {
    it(fixture.id, async () => {
      const value = parseJson(fixture.text);
      expect(canonicalizeJson(value)).toBe(fixture.canonical);
      expect(await digestJson(value)).toBe(fixture.digest);
      expect(fixture.digest).toBe(
        `sha256:${createHash("sha256").update(fixture.canonical, "utf8").digest("hex")}`,
      );
      expect(parseJson(new TextEncoder().encode(fixture.text))).toEqual(value);
    });
  }
  for (const fixture of invalid) {
    it(`rejects ${fixture.id}`, () => {
      const input = fixture.bytes
        ? new Uint8Array(fixture.bytes)
        : fixture.text;
      expect(() => parseJson(input)).toThrow(
        expect.objectContaining({ code: fixture.code }),
      );
    });
  }
  it("uses data properties for prototype-sensitive names", () => {
    const value = parseJson('{"__proto__":{"polluted":true},"constructor":1}');
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.hasOwn(value as object, "__proto__")).toBe(true);
    expect(canonicalizeJson(value)).toBe(
      '{"__proto__":{"polluted":true},"constructor":1}',
    );
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
  it("bounds bytes, depth and values and rejects invalid limit configuration", () => {
    expect(() => parseJson('"€"', { maxBytes: 4 })).toThrow(
      expect.objectContaining({ code: "json-limit-exceeded" }),
    );
    expect(() => parseJson("[[[0]]]", { maxDepth: 2 })).toThrow(
      JsonBoundaryError,
    );
    expect(() => parseJson("[1,2]", { maxNodes: 2 })).toThrow(
      JsonBoundaryError,
    );
    expect(parseJson("[1]", { maxNodes: 2, maxDepth: 1 })).toEqual([1]);
    expect(() => parseJson("null", { maxDepth: 0 })).toThrow(RangeError);
  });
  it("rejects non-JSON programmatic values without invoking hooks", () => {
    let calls = 0;
    const accessor = Object.defineProperty({}, "x", {
      enumerable: true,
      get() {
        calls++;
        return 1;
      },
    });
    const hook = {
      toJSON() {
        calls++;
        return {};
      },
    };
    const cycle: Record<string, unknown> = {};
    cycle["self"] = cycle;
    const extra = [1];
    Object.defineProperty(extra, "extra", { enumerable: true, value: 2 });
    for (const value of [
      undefined,
      Infinity,
      NaN,
      1n,
      () => 1,
      Symbol("x"),
      new Date(),
      accessor,
      hook,
      cycle,
      [undefined],
      new Array(2),
      extra,
      { [Symbol("x")]: 1 },
    ]) {
      expect(() => canonicalizeJson(value)).toThrow(JsonBoundaryError);
    }
    expect(calls).toBe(0);
  });
  it("accepts shared acyclic values and null-prototype data objects", () => {
    const child = { x: 1 };
    expect(canonicalizeJson([child, child])).toBe('[{"x":1},{"x":1}]');
    const value: unknown = Object.assign(Object.create(null), { x: 1 });
    expect(canonicalizeJson(value)).toBe('{"x":1}');
  });
  it("preserves absent/null and does not guess self-referential exclusions", async () => {
    expect(await digestJson({})).not.toBe(await digestJson({ x: null }));
    expect(await digestJson({ id: "x", digest: "a" })).not.toBe(
      await digestJson({ id: "x", digest: "b" }),
    );
  });
  it("enforces the exact UTF-8 output boundary for ASCII, BMP and astral text", () => {
    const limit = 2 * 1024 * 1024;
    for (const fragment of ["a", "é", "€", "🌍", "\\", "\n", '"']) {
      const width =
        new TextEncoder().encode(JSON.stringify(fragment)).length - 2;
      const count = Math.floor((limit - 2) / width);
      const value = fragment.repeat(count) + "a".repeat((limit - 2) % width);
      const canonical = canonicalizeJson(value);
      expect(new TextEncoder().encode(canonical).length).toBe(limit);
      expect(canonical).toBe(JSON.stringify(value));
      expect(() => canonicalizeJson(value + "a")).toThrow(
        expect.objectContaining({ code: "json-limit-exceeded" }),
      );
    }
  });

  it("counts multibyte keys and nested punctuation in the byte limit", () => {
    const key = "é€🌍";
    const overhead = new TextEncoder().encode(
      JSON.stringify({ [key]: [""] }),
    ).length;
    const value = "a".repeat(2 * 1024 * 1024 - overhead);
    expect(canonicalizeJson({ [key]: [value] })).toBe(
      JSON.stringify({ [key]: [value] }),
    );
    expect(() => canonicalizeJson({ [key]: [value + "a"] })).toThrow(
      expect.objectContaining({ code: "json-limit-exceeded" }),
    );
  });

  it("rejects programmatic lone surrogates and excessive output", () => {
    expect(() => canonicalizeJson({ "\ud800": 1 })).toThrow(JsonBoundaryError);
    expect(() => canonicalizeJson("x".repeat(2 * 1024 * 1024))).toThrow(
      JsonBoundaryError,
    );
    let value: unknown = null;
    for (let index = 0; index < 130; index++) value = [value];
    expect(() => canonicalizeJson(value)).toThrow(JsonBoundaryError);
  });
});
