import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import summary from "../src/data/performance.json";

interface Observation {
  tool: string;
  medianMs: number;
  p95Ms: number;
  samples: number[];
}
interface Report {
  complete: boolean;
  samples: number;
  warmups: number;
  documents: { fixture: string; operations: Observation[] }[];
  sites: { tool: string; deliveredGzipBytes: { js: number } }[];
}

it("homepage comparisons come from a complete measured run with identified workloads", () => {
  const report = JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        "../../../docs/assets/performance/ecosystem.json",
      ),
      "utf8",
    ),
  ) as Report;
  expect(report.complete).toBe(true);
  expect(report.samples).toBeGreaterThanOrEqual(30);
  expect(report.warmups).toBeGreaterThanOrEqual(5);
  expect(summary.samples).toBe(report.samples);
  expect(summary.fixture).toBe("math-heavy");
  expect(summary.readerFixture).toBe("mixed");
  const fixture = report.documents.find(
    (row) => row.fixture === summary.fixture,
  );
  expect(summary.tools.map((row) => row.name).sort()).toEqual([
    "Docusaurus",
    "MDX",
    "Pandoc",
    "Publisle",
    "VitePress",
  ]);
  for (const tool of summary.tools) {
    const measurement = fixture?.operations.find(
      (row) => row.tool === tool.name,
    );
    expect(measurement?.samples.length).toBe(report.samples);
    expect(tool.compileMs).toBe(measurement?.medianMs);
    expect(tool.p95Ms).toBe(measurement?.p95Ms);
    expect(tool.installedBytes).toBeGreaterThan(0);
    expect(tool.readerJsGzipBytes).toBe(
      report.sites.find((row) => row.tool === tool.name)?.deliveredGzipBytes.js,
    );
    if (["Publisle", "MDX", "Pandoc"].includes(tool.name))
      expect(tool.readerJsGzipBytes).toBe(0);
  }
});
