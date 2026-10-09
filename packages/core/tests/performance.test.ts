import { describe, expect, it } from "vitest";
import { coreBlockDefinitions, paragraph } from "@publisle/blocks-core";
import { document } from "@publisle/schema";
import { createRegistry, prepare } from "../src/index.ts";
import {
  preparationPhase,
  withPreparationTimings,
} from "../src/performance.ts";

describe("internal preparation profiling", () => {
  it("preserves preparation results and reports exclusive time without double counting", () => {
    const input = document({
      blocks: [paragraph({ content: [{ type: "text", value: "Hello 🌍" }] })],
    });
    const options = { registry: createRegistry(coreBlockDefinitions) };
    const expected = prepare(input, options);
    const profiled = withPreparationTimings(() => prepare(input, options));
    expect(profiled.value).toEqual(expected);
    expect(profiled.timings["declared traversal"]?.calls).toBe(1);
    const total =
      profiled.timings["total (exclusive = unattributed overhead)"]!;
    const exclusive = Object.values(profiled.timings).reduce(
      (sum, phase) => sum + phase.exclusiveMs,
      0,
    );
    expect(exclusive).toBeCloseTo(total.inclusiveMs, 6);
    expect(
      Object.values(profiled.timings).every((phase) => phase.exclusiveMs >= 0),
    ).toBe(true);
  });
  it("restores the outer session after a nested profiling exception", () => {
    const outer = withPreparationTimings(() => {
      expect(() =>
        withPreparationTimings(() =>
          preparationPhase("failing", () => {
            throw new Error("failure");
          }),
        ),
      ).toThrow("failure");
      return preparationPhase("surviving", () => 42);
    });
    expect(outer.value).toBe(42);
    expect(outer.timings["surviving"]?.calls).toBe(1);
    expect(outer.timings).not.toHaveProperty("failing");
    expect(preparationPhase("outside", () => 7)).toBe(7);
    expect(outer.timings).not.toHaveProperty("outside");
  });
});
