import { expect, it } from "vitest";
import { summarize } from "../../../tools/benchmarks/report.ts";
it("reports nearest-rank percentiles and rejects empty or invalid benchmark samples", () => {
  expect(summarize([5, 1, 4, 2, 3])).toEqual({
    samples: 5,
    p50: 3,
    p95: 5,
    variance: 2.5,
  });
  for (const values of [[], [NaN], [Infinity]])
    expect(() => summarize(values)).toThrow();
});

import { timingProposal } from "../../../tools/benchmarks/propose.ts";
it("requires three measured calibration runs before proposing a cap", () => {
  expect(() => timingProposal([Array<number>(30).fill(10)])).toThrow(/three/u);
  expect(() => timingProposal([[], [], []])).toThrow();
  expect(
    timingProposal(Array.from({ length: 3 }, () => Array<number>(30).fill(10)))
      .proposedCap,
  ).toBe(10);
});
