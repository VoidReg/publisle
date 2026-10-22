/** Publish the exact five platform archives already validated by the build matrix. */
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const directory = resolve(process.argv[2] ?? "");
assert.equal(process.argv.length, 3);
assert.equal(
  process.env.GITHUB_REF,
  "refs/heads/main",
  "Publish only from main",
);
const { version } = JSON.parse(
  await readFile(
    new URL("../native/pdf/package-version.json", import.meta.url),
  ),
);
const platforms = [
  "linux-x64",
  "linux-arm64",
  "darwin-x64",
  "darwin-arm64",
  "win32-x64",
];
const archives = (await readdir(directory, { recursive: true })).filter(
  (file) => file.endsWith(".tgz"),
);
assert.equal(
  archives.length,
  platforms.length,
  "Require all five platform archives",
);
const packages = [];
for (const platform of platforms) {
  const file = archives.find((file) =>
    file.endsWith(`publisle-pdf-native-${platform}-${version}.tgz`),
  );
  assert(file, `Missing ${platform}`);
  const path = join(directory, file);
  const manifest = JSON.parse(
    execFileSync("tar", ["-xOf", path, "package/package.json"], {
      encoding: "utf8",
    }),
  );
  assert.equal(manifest.name, `@publisle/pdf-native-${platform}`);
  assert.equal(manifest.version, version);
  assert(!manifest.scripts, "Native packages must have no install scripts");
  packages.push({
    name: manifest.name,
    version,
    path,
    integrity: `sha512-${createHash("sha512")
      .update(await readFile(path))
      .digest("base64")}`,
  });
}
async function registry(name) {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    {
      signal: AbortSignal.timeout(30000),
      headers: { accept: "application/json" },
    },
  );
  if (response.status === 404) return {};
  assert(response.ok, `Registry ${name}: ${response.status}`);
  return response.json();
}
for (const pkg of packages) {
  const before = await registry(pkg.name);
  if (!before.versions?.[version])
    execFileSync(
      "npm",
      [
        "publish",
        pkg.path,
        "--access",
        "public",
        "--provenance",
        "--ignore-scripts",
      ],
      { cwd: process.env.RUNNER_TEMP, stdio: "inherit" },
    );
  const after = await registry(pkg.name);
  assert.equal(
    after.versions?.[version]?.dist?.integrity,
    pkg.integrity,
    `Published bytes differ: ${pkg.name}`,
  );
  if (after["dist-tags"]?.latest !== version)
    execFileSync(
      "npm",
      ["dist-tag", "add", `${pkg.name}@${version}`, "latest"],
      { cwd: process.env.RUNNER_TEMP, stdio: "inherit" },
    );
  console.log(`${pkg.name}@${version}: public integrity verified`);
}
await writeFile(
  join(directory, "publication.json"),
  JSON.stringify({ sourceCommit: process.env.GITHUB_SHA, packages }, null, 2),
);
