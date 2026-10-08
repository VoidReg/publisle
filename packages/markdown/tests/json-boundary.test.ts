import { describe, expect, it } from "vitest";
import { fromMarkdown } from "../src/index.ts";

describe("Markdown strict JSON boundaries", () => {
  const fence = "`".repeat(3);
  it("rejects duplicate members in interactive payload fences", () => {
    const source = `:::interactive{type="host:scene"}\n${fence}publisle-payload\n{"x":1,"x":2}\n${fence}\n:::\n`;
    const result = fromMarkdown(source);
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "invalid-interactive-directive",
        level: "error",
      }),
    );
  });
  it("rejects duplicate members and invalid Unicode in generic archival directives", () => {
    for (const payload of ['{"x":1,"\\u0078":2}', '"\\ud800"', "1e400"]) {
      const result = fromMarkdown(
        `:::publisle{type="host:unknown"}\n${fence}json\n${payload}\n${fence}\n:::\n`,
      );
      expect(result.document).toBeUndefined();
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "invalid-publisle-directive",
          level: "error",
        }),
      );
    }
  });
  it("does not silently fall back when encoded citation JSON is malformed", () => {
    const data = encodeURIComponent('[{"id":"first","id":"second"}]');
    const result = fromMarkdown(`See :cite[]{data="${data}"}.\n`);
    expect(result.document).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "markdown-import-failed",
        level: "error",
      }),
    );
  });
  it("preserves arbitrary valid JSON and prototype-sensitive members", () => {
    const result = fromMarkdown(
      `:::publisle{type="host:unknown"}\n${fence}json\n{"__proto__":{"x":1},"payload":[null,true,"x"]}\n${fence}\n:::\n`,
    );
    expect(result.diagnostics.some(({ level }) => level === "error")).toBe(
      false,
    );
    expect(
      Object.getOwnPropertyDescriptor(
        result.document?.blocks[0]?.data ?? {},
        "__proto__",
      )?.value,
    ).toEqual({ x: 1 });
    expect(result.document?.blocks[0]?.data).toHaveProperty("payload", [
      null,
      true,
      "x",
    ]);
    expect(Object.prototype).not.toHaveProperty("x");
  });
});
