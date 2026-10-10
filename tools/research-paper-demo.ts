// One-command research paper export demo: the playground-authored paper
// (examples/articles/interactive-research-paper.md) through the zero-TeX HTML
// preview and all four journal themes. Artifacts land in .local/demos by
// default; override with PUBLISLE_DEMO_ARTIFACTS.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out =
  process.env["PUBLISLE_DEMO_ARTIFACTS"] ?? join(root, ".local/demos");
mkdirSync(out, { recursive: true });
const paper = "examples/articles/interactive-research-paper.md";
const cli = join(root, "packages/cli/src/bin.ts");

const run = (label: string, args: string[]): string => {
  // Diagnostics are printed on stderr; merge the streams for the assertions.
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== 0)
    throw new Error(`${label}: exit ${String(result.status)}\n${output}`);
  if (output.includes("[error]"))
    throw new Error(`${label}: export reported error diagnostics.\n${output}`);
  return output;
};

const report = (label: string, file: string, output: string): void => {
  const codes = [...output.matchAll(/\[([a-z][a-z-]+)\]/g)].map(
    (match) => match[1],
  );
  const unique = [...new Set(codes)].sort();
  // The demo paper deliberately carries interactive elements; their authored
  // fallbacks must be named by every print export.
  for (const required of ["research-block-reduced", "research-block-fallback"])
    if (!unique.includes(required))
      throw new Error(`${label}: missing expected diagnostic [${required}].`);
  const bytes = statSync(file).size;
  console.log(
    `${label}\n  ${file} (${String(Math.round(bytes / 1024))} KB)\n  diagnostics: ${unique.join(", ")}`,
  );
};

const html = join(out, "interactive-research-paper.html");
const htmlOutput = run("HTML preview", [
  "export",
  paper,
  "--to",
  "html",
  "--config",
  "examples/articles/interactive-paper.host.ts",
  "--output",
  html,
]);
const htmlCodes = [
  ...new Set(
    [...htmlOutput.matchAll(/\[([a-z][a-z-]+)\]/g)].map((match) => match[1]),
  ),
].sort();
const htmlBytes = statSync(html).size;
console.log(
  `Zero-TeX HTML preview\n  ${html} (${String(Math.round(htmlBytes / 1024))} KB)\n  diagnostics: ${htmlCodes.join(", ") || "none"}`,
);

const themes: { template: string; file: string; data?: string }[] = [
  { template: "ieee-journal", file: "interactive-paper-ieee.pdf" },
  {
    template: "acm-journal",
    file: "interactive-paper-acm.pdf",
    data: "acm-country.json",
  },
  { template: "elsevier-numeric", file: "interactive-paper-elsevier.pdf" },
  { template: "springer-journal", file: "interactive-paper-springer.pdf" },
];

for (const { template, file, data } of themes) {
  const target = join(out, file);
  if (existsSync(target)) {
    console.error(
      `${template}: ${target} already exists; remove it or set PUBLISLE_DEMO_ARTIFACTS to rerun.`,
    );
    continue;
  }
  const args = [
    "export",
    paper,
    "--to",
    "pdf",
    "--template",
    template,
    "--output",
    target,
  ];
  if (data) {
    const dataFile = join(out, data);
    writeFileSync(dataFile, `${JSON.stringify({ country: "Germany" })}\n`);
    args.push("--template-data", dataFile);
  }
  const output = run(`${template} PDF`, args);
  report(`${template} PDF`, target, output);
}

console.log(
  `\nOpen the HTML preview in a browser; open a PDF in a viewer and confirm the authored fallbacks of the diagram, the counter island and the animation embed appear as prose.`,
);
