import { describe, expect, it } from "vitest";
import { verifyP0Evidence } from "../../../tools/p0-gate.ts";

describe("required P0 evidence gate", () => {
  it("fails closed when cross-language evidence is absent or skipped", () => {
    expect(() => verifyP0Evidence([])).toThrow("Missing P0 evidence");
    expect(() =>
      verifyP0Evidence([
        {
          file: "packages/contracts/tests/independent.test.ts",
          title: "shared JCS",
          status: "pending",
        },
      ]),
    ).toThrow("Missing P0 evidence");
  });
});
