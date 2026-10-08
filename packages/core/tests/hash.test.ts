import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/index.ts";

describe("synchronous SHA-256 parity", () => {
  it("matches standard empty and abc vectors", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("matches the independent crypto implementation across padding, multi-block and UTF-8 boundaries", () => {
    for (const size of [1, 55, 56, 63, 64, 65, 119, 120, 128, 1024, 8192]) {
      for (const input of ["a".repeat(size), "مرحبا 🌍".repeat(size)])
        expect(sha256Hex(input)).toBe(
          createHash("sha256").update(input, "utf8").digest("hex"),
        );
    }
  });
});
