// Keep homepage numbers derived from the retained, complete observations.
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const input = resolve(process.argv[2] ?? ".local/ecosystem");
const report = JSON.parse(await readFile(join(input, "results.json"), "utf8"));
if (!report.complete || report.samples < 30 || report.warmups < 5)
  throw new Error("Cannot publish an incomplete benchmark");
// Identify the working-tree compiler sources retained with these observations.
// This is recorded at publication; compilation sources must stay unchanged
// between the measurement run and this command.
const sourceFiles = [];
for (const directory of [
  "packages/core/src",
  "packages/block-sdk/src",
  "packages/profiles/src",
  "packages/schema/src",
  "packages/contracts/src",
  "packages/markdown/src",
  "packages/adapter-core/src",
  "blocks/core/src",
]) {
  for (const file of await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (file.isFile()) {
      const path = join(file.parentPath, file.name);
      sourceFiles.push({
        path,
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      });
    }
  }
}
sourceFiles.sort((a, b) => a.path.localeCompare(b.path));
report.publisleSources = {
  recordedAt: "publication",
  files: sourceFiles,
  sha256: createHash("sha256")
    .update(JSON.stringify(sourceFiles))
    .digest("hex"),
};
const fixture = report.documents.find((x) => x.fixture === "math-heavy");
for (const row of fixture.operations) {
  const output = await readFile(
    join(input, `math-heavy-${row.tool}.output`),
    "utf8",
  );
  const count =
    row.tool === "Docusaurus"
      ? [...output.matchAll(/_jsx\(_components\.math,/gu)].length
      : [...output.matchAll(/<math\b/gu)].length;
  if (count !== 40)
    throw new Error(
      `${row.tool}: expected forty rendered math expressions, found ${count}`,
    );
  row.verifiedMathExpressions = count;
  row.outputSha256 = createHash("sha256").update(output).digest("hex");
}
const result = {
  samples: report.samples,
  warmups: report.warmups,
  generatedAt: report.generatedAt,
  fixture: "math-heavy",
  readerFixture: "mixed",
  tools: fixture.operations.map((row) => {
    const site = report.sites.find((x) => x.tool === row.tool);
    const install = report.installation[row.tool];
    return {
      name: row.tool,
      version:
        report.versions[
          row.tool === "MDX"
            ? "@mdx-js/mdx"
            : row.tool === "Docusaurus"
              ? "@docusaurus/core"
              : row.tool === "VitePress"
                ? "vitepress"
                : row.tool === "Pandoc"
                  ? "pandoc"
                  : "Publisle"
        ] ?? "source checkout",
      host: site.configuration,
      operation:
        row.tool === "Docusaurus"
          ? "MDX module · warm process"
          : row.tool === "Pandoc"
            ? "HTML · fresh process"
            : "HTML · warm process",
      compileMs: row.medianMs,
      p95Ms: row.p95Ms,
      readerJsGzipBytes: site.deliveredGzipBytes.js,
      installedBytes: install.bytes ?? install.binaryBytes,
    };
  }),
};
if (
  result.tools.some(
    (x) => !Number.isFinite(x.installedBytes) || x.installedBytes <= 0,
  )
)
  throw new Error("Missing installation footprint");
await writeFile(
  "sites/www/src/data/performance.json",
  JSON.stringify(result, null, 2) + "\n",
);
await mkdir("docs/assets/performance", { recursive: true });
await writeFile(
  "docs/assets/performance/ecosystem.json",
  JSON.stringify(report, null, 2) + "\n",
);
await copyFile(
  join(input, "package-lock.json"),
  "docs/assets/performance/ecosystem-lock.json",
);
