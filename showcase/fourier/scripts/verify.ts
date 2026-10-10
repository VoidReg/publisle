import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { publication } from "../src/host/publication.ts";

interface Manifest {
  dependencies: Record<string, string>;
}
interface Lock {
  packages: Record<
    string,
    { version?: string; integrity?: string; resolved?: string } | undefined
  >;
}
const html = await readFile("dist/index.html", "utf8");
const source = await readFile("public/fourier-series.md", "utf8");
assert.match(html, /Fourier Series: Geometry Hidden Inside a Wave/);
assert.match(html, /Gibbs/);
assert.match(html, /Parseval/);
assert.match(html, /manual counter starts at zero/);
assert.match(html, /An orange point lies one unit above a blue point/);
assert((html.match(/<math\b/g) ?? []).length > 40, "MathML output is missing.");
assert(
  (html.match(/<table\b/g) ?? []).length > 0,
  "The authored table is missing.",
);
assert(
  (html.match(/\/diagrams\/mermaid-/g) ?? []).length >= 2,
  "Authored Mermaid SVGs are missing.",
);
assert(
  !html.includes("data-publisle-unresolved"),
  "An article reference is unresolved.",
);
assert(
  !html.includes("data-publisle-activate"),
  "Static reading edition advertises unavailable activation.",
);
assert(!publication.diagnostics.some((item) => item.level === "error"));
assert.deepEqual(
  publication.diagnostics.map((item) => item.code),
  [
    "missing-island-renderer",
    "missing-island-renderer",
    ...Array<string>(4).fill("missing-diagram-renderer"),
  ],
);
const manifest = JSON.parse(await readFile("package.json", "utf8")) as Manifest;
const lock = JSON.parse(await readFile("package-lock.json", "utf8")) as Lock;
const packages: Record<
  string,
  { requested: string; version: string; integrity: string }
> = {};
for (const [name, requested] of Object.entries(manifest.dependencies)) {
  const entry = lock.packages[`node_modules/${name}`];
  assert(entry?.version && entry.integrity, `Missing pinned package ${name}.`);
  packages[name] = {
    requested,
    version: entry.version,
    integrity: entry.integrity,
  };
}
for (const name of Object.keys(lock.packages)) {
  assert(
    !/node_modules\/(?:@publisle\/(?:research|template-[^/]+|cli-research)|citeproc|fflate)(?:\/|$)/.test(
      name,
    ),
    `Research dependency leaked: ${name}`,
  );
}
const publisleRequests = Object.entries(manifest.dependencies).filter(
  ([name]) => name.startsWith("@publisle/"),
);
const packedRehearsal = publisleRequests.every(([, requested]) =>
  requested.startsWith("file:"),
);
const registryRehearsal = publisleRequests.every(([name, requested]) => {
  const entry = packages[name];
  return (
    /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(requested) &&
    entry?.version === requested &&
    lock.packages[`node_modules/${name}`]?.resolved?.startsWith("https://")
  );
});
assert(
  packedRehearsal || registryRehearsal,
  "Use one exact package source: all packed files or all exact registry versions.",
);
const report = {
  status: packedRehearsal
    ? "local-packed-artifact-rehearsal"
    : "registry-package-rehearsal",
  packageSource: packedRehearsal ? "packed-tarballs" : "registry",
  publicDeployment: null,
  sourceDigest: `sha256:${createHash("sha256").update(source).digest("hex")}`,
  pageDigest: `sha256:${createHash("sha256").update(html).digest("hex")}`,
  publicationIdentity: publication.identity,
  packages,
  diagnostics: publication.diagnostics,
  limitations: [
    "Graphviz, WaveDrom, PlantUML and demo projection use authored static fallback prose.",
    "The scene and manual counter use authored static fallbacks; no activation controls are advertised.",
    packedRehearsal
      ? "Registry publication and public deployment remain pending release prerequisites."
      : "This records a local build of exact registry package versions; public deployment remains unverified.",
  ],
};
await writeFile("dist/rehearsal.json", JSON.stringify(report, null, 2) + "\n");
console.log(
  `Full Fourier showcase verified: ${String(source.split("\n").length)} source lines, MathML, table, SVGs, resolved references and Core-only pinned packages.`,
);
