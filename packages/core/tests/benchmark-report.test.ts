import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { summarize } from "../../../tools/benchmarks/report.ts";
import {
  gateExitCode,
  judgeMetrics,
  parseBudgetCaps,
  preparationCaps,
  readerCaps,
  readerObservations,
} from "../../../tools/benchmarks/gate.ts";
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

it("enforces accepted caps with an immediate byte failure and one timing rerun", () => {
  const caps = parseBudgetCaps(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../tools/benchmarks/accepted-budgets.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  expect(caps.timingP95Ms["static-1000 prepare reused registry"]).toBe(219);
  expect(Object.keys(preparationCaps(caps).timingP95Ms)).toHaveLength(20);
  expect(Object.keys(readerCaps(caps).timingP95Ms)).toHaveLength(24);
  const breach = judgeMetrics(
    [
      { name: "html", kind: "bytes", value: 11 },
      { name: "prep", kind: "timing", value: 50, samples: 30 },
    ],
    { bytes: { html: 10 }, timingP95Ms: { prep: 40 } },
    { enforceTiming: true, requireComplete: true },
  );
  expect(breach.status).toBe("fail");
  expect(
    judgeMetrics(
      [{ name: "prep", kind: "timing", value: 50, samples: 30 }],
      { bytes: {}, timingP95Ms: { prep: 40 } },
      { enforceTiming: true, requireComplete: true },
    ).status,
  ).toBe("retry");
  expect(
    judgeMetrics(
      [{ name: "prep", kind: "timing", value: 50, samples: 30 }],
      { bytes: {}, timingP95Ms: { prep: 40 } },
      {
        enforceTiming: true,
        requireComplete: true,
        rerun: [{ name: "prep", kind: "timing", value: 10, samples: 30 }],
      },
    ).status,
  ).toBe("noisy");
  expect(
    judgeMetrics(
      [{ name: "prep", kind: "timing", value: 40.9, samples: 30 }],
      { bytes: {}, timingP95Ms: { prep: 40 } },
      { enforceTiming: true, requireComplete: true },
    ).status,
  ).toBe("pass");
  expect(
    judgeMetrics(
      [{ name: "prep", kind: "timing", value: 627.813, samples: 30 }],
      { bytes: {}, timingP95Ms: { prep: 626 } },
      {
        enforceTiming: true,
        requireComplete: true,
        rerun: [{ name: "prep", kind: "timing", value: 626.457, samples: 30 }],
      },
    ).status,
  ).toBe("noisy");
  expect(gateExitCode("noisy")).toBe(0);
  expect(gateExitCode("fail")).toBe(1);
  expect(gateExitCode("retry")).toBe(2);
  expect(
    judgeMetrics(
      [{ name: "prep", kind: "timing", value: 50, samples: 30 }],
      { bytes: {}, timingP95Ms: { prep: 40 } },
      {
        enforceTiming: true,
        requireComplete: true,
        rerun: [{ name: "prep", kind: "timing", value: 55, samples: 30 }],
      },
    ).status,
  ).toBe("fail");
  expect(
    judgeMetrics(
      [{ name: "prep", kind: "timing", value: 50, samples: 3 }],
      { bytes: {}, timingP95Ms: { prep: 40 } },
      { enforceTiming: false, requireComplete: false },
    ).status,
  ).toBe("pass");
  const sample = {
    firstActivationMs: 10,
    remainingActivationMs: 4,
    initialRequests: ["/app.js"],
    requests: ["/app.js"],
    initialJsBytes: 100,
    activatedJsBytes: 110,
  };
  const observations = readerObservations({
    complete: true,
    metadata: { repetitions: 30 },
    results: [
      {
        framework: "react",
        mode: "native",
        islandsPerPlacement: 1,
        placements: 2,
        htmlBytes: 10,
        htmlGzipBytes: 8,
        cssBytes: 4,
        propsBytes: 3,
        assets: [{ fileName: "app.js", gzipBytes: 5 }],
        samples: Array.from({ length: 30 }, () => sample),
      },
    ],
  });
  expect(
    observations.find((entry) => entry.name.endsWith("initialJsGzipBytes"))
      ?.value,
  ).toBe(5);
  expect(() =>
    readerObservations({
      complete: false,
      metadata: { repetitions: 30 },
      results: [],
    }),
  ).toThrow(/Incomplete/u);
});
