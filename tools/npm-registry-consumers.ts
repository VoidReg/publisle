import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { npmCli, reviewedTarballs } from "./release.ts";

const root = resolve(import.meta.dirname, "..");
const [manifestPath] = process.argv.slice(2);
assert(
  manifestPath,
  "Usage: node tools/npm-registry-consumers.ts RELEASE_MANIFEST",
);
const { stage } = await reviewedTarballs(
  root,
  manifestPath,
  process.env["GITHUB_SHA"],
);
const report = JSON.parse(await readFile(manifestPath, "utf8")) as {
  versions: Record<string, string>;
  releaseId: string;
};
const { versions } = report;
const sets = JSON.parse(
  await readFile(join(root, "packages/core-packages.json"), "utf8"),
) as { core: string[]; research: string[] };
const selected = sets.core.filter(
  (name) => !/^@publisle\/adapter-(?:react|svelte|next|astro|vue)$/u.test(name),
);
const temporary = await mkdtemp(join(tmpdir(), "publisle-registry-"));
const run = (command: string, args: string[], cwd: string) =>
  execFileSync(command, args, { cwd, stdio: "inherit", timeout: 300_000 });
const install = (cwd: string) =>
  run(
    process.execPath,
    [
      npmCli(),
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--engine-strict",
      "--registry",
      "https://registry.npmjs.org",
    ],
    cwd,
  );
const consumers: {
  name: string;
  packages: Record<
    string,
    { version?: string; resolved?: string; integrity?: string }
  >;
}[] = [];
async function inspectLock(cwd: string, coreOnly: boolean): Promise<void> {
  const lock = JSON.parse(
    await readFile(join(cwd, "package-lock.json"), "utf8"),
  ) as {
    packages: Record<
      string,
      { version?: string; resolved?: string; integrity?: string }
    >;
  };
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path.includes("node_modules/@publisle/")) {
      const name = path.slice(
        path.lastIndexOf("node_modules/") + "node_modules/".length,
      );
      assert.equal(
        entry.version,
        versions[name],
        `Unexpected registry version of ${name}`,
      );
      assert(entry.resolved?.startsWith("https://registry.npmjs.org/"));
      assert(entry.integrity);
    }
    if (coreOnly)
      assert(
        !/node_modules\/(?:@publisle\/(?:research|cli-research|pdf-native-[^/]+|template-[^/]+)|citeproc|fflate)$/u.test(
          path,
        ),
        `Research dependency leaked: ${path}`,
      );
  }
  consumers.push({ name: basename(cwd), packages: lock.packages });
}
for (const research of [false, true]) {
  const cwd = join(temporary, research ? "research" : "core");
  await mkdir(cwd);
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: Object.fromEntries(
          [...selected, ...(research ? sets.research : [])].map((name) => [
            name,
            versions[name],
          ]),
        ),
        devDependencies: { typescript: "6.0.3", "@types/node": "24.13.5" },
      },
      null,
      2,
    ),
  );
  await cp(
    join(
      root,
      research
        ? "packages/cli-research/tests/fixtures/packed-consumer.ts"
        : "packages/adapter-core/tests/fixtures/packed-consumer.ts",
    ),
    join(cwd, "consumer.ts"),
  );
  install(cwd);
  run(process.execPath, ["consumer.ts"], cwd);
  run(
    process.execPath,
    [
      "node_modules/typescript/bin/tsc",
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "false",
      "--module",
      "NodeNext",
      "--target",
      "ES2024",
      "--ignoreConfig",
      "--types",
      "node",
      "consumer.ts",
    ],
    cwd,
  );
  await inspectLock(cwd, !research);
  if (!research) {
    run(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import{document}from'@publisle/schema';import{writeFileSync}from'node:fs';writeFileSync('source.json',JSON.stringify(document({blocks:[]})))",
      ],
      cwd,
    );
    const cli = "node_modules/@publisle/cli/dist/bin.js";
    run(process.execPath, [cli, "validate", "source.json"], cwd);
    const result = spawnSync(
      process.execPath,
      [cli, "export", "source.json", "--to", "pdf"],
      { cwd, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /@publisle\/cli-research/u);
  }
}
// Exercise the exact unqualified install lines shown on the home page.
const quickstart = join(temporary, "quickstart");
const prefix = join(temporary, "global");
await mkdir(quickstart);
await writeFile(
  join(quickstart, "package.json"),
  '{"private":true,"type":"module"}',
);
run(
  process.execPath,
  [
    npmCli(),
    "install",
    "--global",
    "--prefix",
    prefix,
    "@publisle/cli",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ],
  quickstart,
);
const globalCli = join(prefix, "lib/node_modules/@publisle/cli");
assert.equal(
  (
    JSON.parse(await readFile(join(globalCli, "package.json"), "utf8")) as {
      version: string;
    }
  ).version,
  versions["@publisle/cli"],
);
await writeFile(
  join(quickstart, "article.md"),
  "# Hello\n\nBuilt from a clean global install.\n",
);
run(
  process.execPath,
  [join(globalCli, "dist/bin.js"), "build", "article.md", "--out", "dist"],
  quickstart,
);
assert(
  (await readFile(join(quickstart, "dist/index.html"), "utf8")).includes(
    "Built from a clean global install.",
  ),
);
run(
  process.execPath,
  [
    npmCli(),
    "install",
    "@publisle/cli-research",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ],
  quickstart,
);
await inspectLock(quickstart, false);
const showcase = join(temporary, "showcase");
await cp(join(root, "showcase/fourier"), showcase, {
  recursive: true,
  filter: (source) =>
    !["node_modules", ".artifacts", "dist", ".astro"].includes(
      basename(source),
    ),
});
for (const file of [
  "fourier-series.md",
  "fourier-square-wave.svg",
  "fourier-clock.json",
]) {
  await cp(
    join(root, "examples/articles", file),
    join(showcase, "public", file),
  );
}
const showcasePath = join(showcase, "package.json");
const manifest = JSON.parse(await readFile(showcasePath, "utf8")) as {
  dependencies: Record<string, string>;
};
for (const name of Object.keys(manifest.dependencies))
  if (name.startsWith("@publisle/")) {
    const version = versions[name];
    assert(version);
    manifest.dependencies[name] = version;
  }
await writeFile(showcasePath, JSON.stringify(manifest, null, 2));
await rm(join(showcase, "package-lock.json"), { force: true });
install(showcase);
run(process.execPath, ["node_modules/astro/bin/astro.mjs", "build"], showcase);
run(process.execPath, ["scripts/verify.ts"], showcase);
await inspectLock(showcase, true);
await writeFile(
  resolve(stage, "registry-consumers.json"),
  JSON.stringify(
    {
      releaseId: report.releaseId,
      versions,
      sourceCommit: process.env["GITHUB_SHA"],
      verifiedAt: new Date().toISOString(),
      node: process.version,
      status: "passed",
      consumers,
      quickstart: { globalCli: "passed", researchInstall: "passed" },
      showcase: JSON.parse(
        await readFile(join(showcase, "dist/rehearsal.json"), "utf8"),
      ) as unknown,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Fresh registry-only Core, Research, declarations, CLI isolation and full showcase checks passed.",
);
