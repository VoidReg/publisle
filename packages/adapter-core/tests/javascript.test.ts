import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { javascriptValue } from "../src/javascript.ts";

describe("build-time JSON embedding", () => {
  it("preserves prototype-looking keys as JSON data and escapes script delimiters", () => {
    const source: unknown = JSON.parse(
      '{"__proto__":{"polluted":true},"nested":[{"__proto__":false}],"closing":"</script>"}',
    );
    const code = javascriptValue(source);
    expect(code).not.toContain("</script>");
    expect(code).toContain("/*#__PURE__*/JSON.parse");
    const decoded: unknown = runInNewContext(code);
    expect(JSON.stringify(decoded)).toBe(JSON.stringify(source));
  });
  it("keeps ordinary values as directly emitted literals and rejects missing JSON", () => {
    expect(javascriptValue({ value: 42 })).toBe('{"value":42}');
    expect(() => javascriptValue(undefined)).toThrow("non-JSON");
  });
});
