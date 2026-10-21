import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
const root = resolve(".local");
const reports = {};
for (const name of [
  "pdf-baseline",
  "pdf-optimized",
  "pdf-native",
  "pdf-baseline-diagnostics",
  "pdf-optimized-diagnostics",
  "pdf-native-diagnostics",
]) {
  const report = JSON.parse(
    await readFile(join(root, name, "results.json"), "utf8"),
  );
  if (!report.complete) throw new Error(`Incomplete PDF measurement: ${name}`);
  if (
    !name.includes("diagnostics") &&
    (report.samples < 30 || report.warmups < 5)
  )
    throw new Error(`Insufficient principal observations: ${name}`);
  if (report.cpu !== 0.5 || report.memoryMiB !== 512)
    throw new Error("Resource budgets differ");
  if (/oom_kill [1-9]/u.test(report.memoryEvents))
    throw new Error("Memory-budget failure");
  if (
    (!name.includes("diagnostics") || name === "pdf-optimized-diagnostics") &&
    (report.passed === false ||
      report.results.some(
        (row) => row.failure || row.observations.length !== report.samples,
      ))
  )
    throw new Error(`Failed or insufficient PDF observations: ${name}`);
  reports[name] = report;
}
for (const prefix of ["pdf-baseline", "pdf-native"]) {
  for (const row of reports[`${prefix}-diagnostics`].results) {
    const candidate = reports["pdf-optimized-diagnostics"].results.find(
      (x) => x.name === row.name,
    );
    if (row.sourceSha256 !== candidate?.sourceSha256)
      throw new Error("Diagnostic source workload changed");
  }
}
for (const row of reports["pdf-baseline"].results) {
  const after = reports["pdf-optimized"].results.find(
    (x) => x.name === row.name,
  );
  if (row.sourceSha256 !== after.sourceSha256)
    throw new Error("PDF source workload changed");
  const beforeText = (
    await execute("pdftotext", [
      join(root, "pdf-baseline", `${row.name}.pdf`),
      "-",
    ])
  ).stdout;
  const afterText = (
    await execute("pdftotext", [
      join(root, "pdf-optimized", `${row.name}.pdf`),
      "-",
    ])
  ).stdout;
  // Float placement and line wrapping can change without losing article content.
  const inventory = (text) =>
    text
      .replace(/([\p{L}])-\s*\n\s*([\p{L}])/gu, "$1$2")
      .split(/\s+/u)
      .filter(Boolean)
      .sort();
  const sameText = beforeText === afterText;
  const sameTokens =
    JSON.stringify(inventory(beforeText)) ===
    JSON.stringify(inventory(afterText));
  if (!sameTokens) throw new Error("PDF article token inventory changed");
  after.readingContent = {
    sameText,
    sameTokens,
    note: "Token inventory normalizes line-wrap hyphenation; float reading order may differ.",
  };
}
// Deployment verification may be a later equivalent build than the timed image.
// Preserve both identities rather than attributing timings to an unmeasured image.
try {
  const verification = JSON.parse(
    await readFile(join(root, "pdf-budget-optimized/budget.json"), "utf8"),
  );
  if (
    !verification.passed ||
    verification.aggregateCpu !== 0.5 ||
    verification.aggregateMemoryMiB !== 512
  )
    throw new Error("Candidate resource verification failed");
  reports.candidateVerification = verification;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await mkdir("docs/assets/performance", { recursive: true });
await writeFile(
  "docs/assets/performance/pdf.json",
  JSON.stringify(reports, null, 2) + "\n",
);
await copyFile(
  join(root, "pdf-optimized/research.pdf"),
  "sites/www/public/examples/research-paper.pdf",
);
const before = reports["pdf-baseline"].results[0];
const after = reports["pdf-optimized"].results[0];
const native = reports["pdf-native"].results[0];
const table =
  `| Backend | Median | p95 |\\n| --- | --- | --- |\\n| Previous LaTeX worker | ${(before.medianMs / 1000).toFixed(2)} s | ${(before.p95Ms / 1000).toFixed(2)} s |\\n| Optimized LaTeX worker | ${(after.medianMs / 1000).toFixed(2)} s | ${(after.p95Ms / 1000).toFixed(2)} s |\\n| Native generic-article feasibility study | ${(native.medianMs / 1000).toFixed(2)} s | ${(native.p95Ms / 1000).toFixed(2)} s |`.replaceAll(
    "\\n",
    "\n",
  );
const path = "docs/guides/performance-comparison.md";
let doc = await readFile(path, "utf8");
const marker = "<!-- pdf-results -->";
const end = "<!-- /pdf-results -->";
const section = `${marker}\n\nThe Research-paper sample is the principal latency workload: five warmups and thirty uncached observations per backend on ${reports["pdf-baseline"].environment.cpu}. These are local controlled measurements, not live VPS latency. Successful diagnostic fixtures have five observations each; their p95 is the maximum and is not a latency-budget calibration. The previous worker fails the FFT diagnostic; the candidate passes all three. The native study rejects the FFT fixture because its TeX-to-Typst bridge cannot convert the colored math. Raw observations and worker identities are in the [PDF report](../assets/performance/pdf.json).\n\n${table}\n\nThe five-second p95 target ${after.p95Ms < 5000 ? "was met" : "was not met"} by the existing LaTeX path within the fixed budget. The native study changes typography and template implementation, and is not a production replacement or evidence of publisher/PDF-UA equivalence.\n\n${end}`;
if (doc.includes(marker))
  doc =
    doc.slice(0, doc.indexOf(marker)) +
    section +
    doc.slice(doc.indexOf(end) + end.length);
else doc += "\n\n" + section + "\n";
await writeFile(path, doc);
console.log(
  JSON.stringify({
    before: { median: before.medianMs, p95: before.p95Ms },
    after: { median: after.medianMs, p95: after.p95Ms },
    native: { median: native.medianMs, p95: native.p95Ms },
  }),
);
