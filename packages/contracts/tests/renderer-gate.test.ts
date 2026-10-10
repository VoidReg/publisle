import { expect, it } from "vitest";
import { verifyRendererEvidence } from "../../../tools/renderer-gate.ts";

const report = () => ({
  testResults: [
    {
      assertionResults: [
        "matches the shared migration fixtures exactly",
        "Python independently preserves the shared static rendering semantics",
        "matches shared migration, fallback and refusal outcomes in independent Python and TypeScript",
        "matches shared citation markers, references, classifications and capabilities in independent Python and citeproc-js",
      ].map((fullName) => ({ fullName, status: "passed" })),
    },
  ] as const,
});

it("requires all renderer parity evidence and refuses skipped or missing assertions", () => {
  expect(() => {
    verifyRendererEvidence(report());
  }).not.toThrow();
  for (const invalid of [
    undefined,
    {},
    { testResults: [] },
    { testResults: [{}] },
  ])
    expect(() => {
      verifyRendererEvidence(invalid);
    }).toThrow();
  const missing = report();
  missing.testResults[0].assertionResults.pop();
  expect(() => {
    verifyRendererEvidence(missing);
  }).toThrow("Missing renderer parity evidence");
  for (const status of ["pending", "skipped", "failed", "todo"]) {
    const skipped = report();
    const first = skipped.testResults[0].assertionResults[0];
    if (!first) throw new Error("Missing fixture assertion");
    first.status = status;
    expect(() => {
      verifyRendererEvidence(skipped);
    }).toThrow("skipped tests fail");
  }
});
