import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, join, relative, resolve } from "node:path";

interface Manifest {
  name: string;
  version: string;
  publishConfig?: unknown;
  types?: string;
  exports?: unknown;
  bin?: unknown;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}
interface DependencyTree {
  dependencies?: Record<string, DependencyTree>;
}
const root = resolve(import.meta.dirname, "..");
const artifactRoot = process.env["PUBLISLE_DISTRIBUTION_ARTIFACTS"];
if (artifactRoot) await mkdir(artifactRoot, { recursive: true });
const stage = await mkdtemp(
  join(artifactRoot ?? tmpdir(), "publisle-distribution-"),
);
const npmPath = (process.env["PATH"] ?? "")
  .split(delimiter)
  .map((directory) => join(directory, "npm"))
  .find(existsSync);
assert(npmPath, "npm CLI is required for isolated consumer installation.");
const run = (command: string, args: string[], cwd = root) =>
  execFileSync(
    command === "npm" ? process.execPath : command,
    command === "npm" ? [realpathSync(npmPath), ...args] : args,
    {
      cwd,
      env: {
        ...process.env,
        PATH: `${dirname(process.execPath)}:${process.env["PATH"] ?? ""}`,
      },
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
run(process.execPath, ["tools/build-packages.ts"]);
const sets = JSON.parse(
  await readFile(join(root, "packages/core-packages.json"), "utf8"),
) as { core: string[]; research: string[] };
const packed = new Map<string, string>();
const manifests = new Map<string, Manifest>();
const releaseNames = new Set([...sets.core, ...sets.research]);
let releaseVersion: string | undefined;
const tarballs = join(stage, "tarballs");
await mkdir(tarballs);
for (const group of ["packages", "blocks"]) {
  for (const entry of await readdir(join(root, group), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const directory = join(root, group, entry.name);
    let manifest: Manifest;
    try {
      manifest = JSON.parse(
        await readFile(join(directory, "package.json"), "utf8"),
      ) as Manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!manifest.publishConfig) continue;
    assert(
      releaseNames.has(manifest.name),
      `Unlisted package ${manifest.name}`,
    );
    assert.match(manifest.version, /^0\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/u);
    assert.notEqual(
      manifest.version,
      "0.0.0",
      "Never release placeholder versions.",
    );
    releaseVersion ??= manifest.version;
    assert.equal(
      manifest.version,
      releaseVersion,
      "Release versions must agree.",
    );
    run("pnpm", ["pack", "--pack-destination", tarballs], directory);
    const tarball = join(
      tarballs,
      `${manifest.name.slice(1).replaceAll("/", "-")}-${manifest.version}.tgz`,
    );
    const files = new Set(run("tar", ["-tzf", tarball]).trim().split("\n"));
    const artifact = JSON.parse(
      run("tar", ["-xOf", tarball, "package/package.json"]),
    ) as Manifest;
    assert.equal(artifact.types, "./dist/index.d.ts");
    const checkTargets = (value: unknown): void => {
      if (typeof value === "string") {
        assert(
          !value.startsWith("./src/"),
          `Published source export: ${artifact.name} ${value}`,
        );
        if (!value.includes("*"))
          assert(
            files.has(`package/${value.slice(2)}`),
            `Missing ${artifact.name} ${value}`,
          );
      } else if (value && typeof value === "object")
        for (const target of Object.values(value)) checkTargets(target);
    };
    checkTargets(artifact.exports);
    checkTargets(artifact.bin);
    assert(files.has("package/README.md"));
    assert(files.has("package/LICENSE"));
    if (artifact.name === "@publisle/research") {
      for (const required of [
        "compiler/Dockerfile",
        "compiler/install-texlive.sh",
        "compiler/cacert.pem",
        "compiler/release.json",
        "NOTICE.md",
        "vendor/jats/JATS-Archiving-1-3-MathML2-DTD/JATS-archivearticle1-3.dtd",
      ])
        assert(
          files.has(`package/${required}`),
          `Missing Research runtime asset ${required}`,
        );
    }
    assert(files.has("package/dist/index.js.map"));
    assert(files.has("package/dist/index.d.ts.map"));
    for (const mapFile of ["index.js.map", "index.d.ts.map"]) {
      const map = JSON.parse(
        run("tar", ["-xOf", tarball, `package/dist/${mapFile}`]),
      ) as { sources: string[] };
      assert(
        map.sources.every((source) => source.startsWith("../src/")),
        `Nonportable map in ${artifact.name}`,
      );
      for (const source of map.sources)
        assert(
          files.has(`package/${source.slice(3)}`),
          `Unpackaged map source ${source}`,
        );
    }
    for (const dependencies of [
      artifact.dependencies,
      artifact.peerDependencies,
    ]) {
      for (const [name, version] of Object.entries(dependencies ?? {})) {
        assert(!version.startsWith("workspace:"));
        if (releaseNames.has(name))
          assert.equal(
            version,
            releaseVersion,
            `Incorrect packed pin: ${artifact.name} -> ${name}`,
          );
      }
    }
    packed.set(manifest.name, tarball);
    manifests.set(manifest.name, artifact);
  }
}
assert.deepEqual(
  [...packed.keys()].sort(),
  [...sets.core, ...sets.research].sort(),
);
// Derive dependency order from the packed runtime graph, including package peers.
// Development-only CLI/plugin links are deliberately absent from this graph.
const publicationOrder: string[] = [];
const visiting = new Set<string>();
const visit = (name: string): void => {
  if (publicationOrder.includes(name)) return;
  assert(!visiting.has(name), `Published dependency cycle at ${name}`);
  visiting.add(name);
  const manifest = manifests.get(name);
  assert(manifest);
  for (const dependency of Object.keys({
    ...manifest.dependencies,
    ...manifest.peerDependencies,
  }))
    if (releaseNames.has(dependency)) visit(dependency);
  visiting.delete(name);
  publicationOrder.push(name);
};
for (const name of [...sets.core, ...sets.research]) visit(name);
// The plain Node consumer includes the Core renderer but deliberately has no
// framework peers or Research extension. It lives outside the workspace.
const consumer = join(stage, "consumer");
await mkdir(consumer);
await writeFile(
  join(consumer, "package.json"),
  JSON.stringify({ private: true, type: "module" }),
);
const selected = sets.core.filter(
  (name) => !/^@publisle\/adapter-(?:react|svelte|next|astro|vue)$/.test(name),
);
run(
  "npm",
  [
    "install",
    "--ignore-scripts",
    "--legacy-peer-deps",
    "--no-audit",
    "--no-fund",
    ...selected.map((name) => {
      const path = packed.get(name);
      assert(path);
      return relative(consumer, path);
    }),
  ],
  consumer,
);
const tree = JSON.parse(
  run("npm", ["ls", "--all", "--json"], consumer),
) as DependencyTree;
const inspect = (node: DependencyTree): void => {
  for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
    assert(
      !/^@publisle\/(?:research|template-|cli-research)/.test(name) &&
        !["citeproc", "fflate"].includes(name),
      `Research dependency leaked: ${name}`,
    );
    inspect(dependency);
  }
};
inspect(tree);
const fixture = await readFile(
  join(root, "packages/adapter-core/tests/fixtures/packed-consumer.ts"),
  "utf8",
);
await writeFile(join(consumer, "consumer.ts"), fixture);
console.log(run(process.execPath, ["consumer.ts"], consumer).trim());
// Use a real factory document for CLI validation.
run(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    "import{document}from'@publisle/schema';import{writeFileSync}from'node:fs';writeFileSync('source.json',JSON.stringify(document({blocks:[]})))",
  ],
  consumer,
);
const cli = join(consumer, "node_modules/@publisle/cli/dist/bin.js");
run(process.execPath, [cli, "validate", "source.json"], consumer);
let refusal = false;
try {
  run(
    process.execPath,
    [cli, "export", "source.json", "--to", "pdf"],
    consumer,
  );
} catch (error) {
  const failure = error as { status: number; stderr: string };
  assert.equal(failure.status, 2);
  assert.match(failure.stderr, /@publisle\/cli-research/);
  refusal = true;
}
assert(refusal, "Core-only export must refuse with installation guidance.");
run(
  join(root, "node_modules/.bin/tsc"),
  [
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "false",
    "--module",
    "NodeNext",
    "--target",
    "ES2024",
    // Explicit files: never inherit an enclosing workspace tsconfig (TS 5112).
    "--ignoreConfig",
    "consumer.ts",
  ],
  consumer,
);
// Build a framework consumer against the tarballs, including the retained
// .astro source component and public stylesheet subpath.
const astroConsumer = join(stage, "astro-consumer");
await mkdir(join(astroConsumer, "src/pages"), { recursive: true });
await writeFile(
  join(astroConsumer, "package.json"),
  JSON.stringify({ private: true, type: "module" }),
);
const astroTarball = packed.get("@publisle/adapter-astro");
assert(astroTarball);
const astroVersion = (
  JSON.parse(
    await readFile(
      join(root, "examples/astro/node_modules/astro/package.json"),
      "utf8",
    ),
  ) as { version: string }
).version;
run(
  "npm",
  [
    "install",
    "--ignore-scripts",
    "--legacy-peer-deps",
    "--no-audit",
    "--no-fund",
    ...selected.map((name) => {
      const path = packed.get(name);
      assert(path);
      return relative(astroConsumer, path);
    }),
    relative(astroConsumer, astroTarball),
    `astro@${astroVersion}`,
  ],
  astroConsumer,
);
await writeFile(
  join(astroConsumer, "astro.config.mjs"),
  `import {defineConfig} from 'astro/config'; import {publisleAstro} from '@publisle/adapter-astro'; export default defineConfig({integrations:[publisleAstro()]});`,
);
await writeFile(
  join(astroConsumer, "src/pages/index.astro"),
  `---
import Article from '@publisle/adapter-astro/Article.astro';
import {document} from '@publisle/schema';
import {paragraph,coreBlockDefinitions} from '@publisle/blocks-core';
import {prepare,createRegistry} from '@publisle/core';
import {compilePublication} from '@publisle/adapter-core';
import '@publisle/adapter-core/document.css';
const result=prepare(document({blocks:[paragraph({content:[{type:'text',value:'Packed Astro consumer'}]})]}),{registry:createRegistry(coreBlockDefinitions)});
if(!result.document) throw new Error('Preparation failed');
const publication=compilePublication(result.document);
---
<html lang="en"><body><Article {publication} instanceId="astro-packed"/></body></html>
`,
);
run(
  process.execPath,
  [join(astroConsumer, "node_modules/astro/bin/astro.mjs"), "build"],
  astroConsumer,
);
assert.match(
  await readFile(join(astroConsumer, "dist/index.html"), "utf8"),
  /Packed Astro consumer/,
);
console.log("Packed Astro integration, component, CSS and static build pass.");
// Keep Research in a separate installation so the original Core-only tree
// remains a mechanical proof of the optional tooling boundary.
const researchConsumer = join(stage, "research-consumer");
await mkdir(researchConsumer);
await writeFile(
  join(researchConsumer, "package.json"),
  JSON.stringify({ private: true, type: "module" }),
);
run(
  "npm",
  [
    "install",
    "--ignore-scripts",
    "--legacy-peer-deps",
    "--no-audit",
    "--no-fund",
    ...[...selected, ...sets.research].map((name) => {
      const path = packed.get(name);
      assert(path);
      return relative(researchConsumer, path);
    }),
  ],
  researchConsumer,
);
await writeFile(
  join(researchConsumer, "consumer.ts"),
  await readFile(
    join(root, "packages/cli-research/tests/fixtures/packed-consumer.ts"),
    "utf8",
  ),
);
console.log(run(process.execPath, ["consumer.ts"], researchConsumer).trim());
run(
  join(root, "node_modules/.bin/tsc"),
  [
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "false",
    "--module",
    "NodeNext",
    "--target",
    "ES2024",
    // Explicit files: never inherit an enclosing workspace tsconfig (TS 5112).
    "--ignoreConfig",
    // The isolated consumer does not install @types/node; the fixture's
    // node: imports take their declarations from the workspace tooling.
    "--typeRoots",
    join(root, "node_modules/@types"),
    "--types",
    "node",
    "consumer.ts",
  ],
  researchConsumer,
);
console.log(`Publication order: ${publicationOrder.join(", ")}`);
const contractBundleJson = run(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    `
import {createRegistry} from '@publisle/core';
import {coreBlockDefinitions} from '@publisle/blocks-core';
import {interactiveSchematicDefinition} from '@publisle/blocks-technical';
import {exportRegistryContracts} from '@publisle/contracts';
console.log(JSON.stringify(await exportRegistryContracts(createRegistry([
  ...coreBlockDefinitions, interactiveSchematicDefinition,
]))));
`,
  ],
  consumer,
);
const contractBundle = JSON.parse(contractBundleJson) as {
  contracts: { id: string; digest: string; contract: { identity: unknown } }[];
};
await writeFile(join(stage, "contract-bundle.json"), contractBundleJson);
await writeFile(
  join(stage, "release-manifest.json"),
  JSON.stringify(
    {
      version: releaseVersion,
      status: "validated-packed-artifacts",
      compiler: JSON.parse(
        await readFile(
          join(root, "packages/research/compiler/release.json"),
          "utf8",
        ),
      ) as unknown,
      publicationOrder,
      contracts: contractBundle.contracts.map(({ id, digest, contract }) => ({
        id,
        digest,
        identity: contract.identity,
      })),
      packages: await Promise.all(
        publicationOrder.map(async (name) => {
          const tarball = packed.get(name);
          assert(tarball);
          return {
            name,
            version: releaseVersion,
            tarball: relative(stage, tarball),
            sha256: createHash("sha256")
              .update(await readFile(tarball))
              .digest("hex"),
          };
        }),
      ),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Distribution gate passes: ${String(packed.size)} tarballs; Core-only runtime, CLI, dependency tree, consumer declarations, standalone Astro build and isolated Research consumers. Artifacts: ${stage}`,
);
