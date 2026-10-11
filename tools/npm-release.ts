import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageManifest {
  name: string;
  version: string;
  publishConfig?: unknown;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}
interface ReleaseManifest {
  version: string;
  status: string;
  compiler: { publishedImage: string | null };
  publicationOrder: string[];
  packages: {
    name: string;
    version: string;
    tarball: string;
    sha256: string;
  }[];
}
interface RegistryVersion {
  dist: { integrity: string; tarball: string };
}

export function npmCli(): string {
  const path = (process.env["PATH"] ?? "")
    .split(delimiter)
    .map((directory) => join(directory, "npm"))
    .find(existsSync);
  assert(path, "npm CLI is required.");
  return realpathSync(path);
}

export function validateVersion(version: string): void {
  assert.match(
    version,
    /^0\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u,
    "Use a coordinated beta version such as 0.1.1 or 0.2.0.",
  );
  assert.notEqual(version, "0.0.0", "Placeholder versions cannot be released.");
}

export async function releasePackages(root: string) {
  const sets = JSON.parse(
    await readFile(resolve(root, "packages/core-packages.json"), "utf8"),
  ) as { core: string[]; research: string[] };
  const names = [...sets.core, ...sets.research];
  assert.equal(new Set(names).size, names.length);
  const packages: { path: string; manifest: PackageManifest }[] = [];
  for (const group of ["packages", "blocks"]) {
    for (const entry of await readdir(resolve(root, group), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      const path = resolve(root, group, entry.name, "package.json");
      let manifest: PackageManifest;
      try {
        manifest = JSON.parse(await readFile(path, "utf8")) as PackageManifest;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (manifest.publishConfig) packages.push({ path, manifest });
    }
  }
  assert.deepEqual(
    packages.map((p) => p.manifest.name).sort(),
    names.sort(),
    "Publish set and manifests disagree.",
  );
  return packages;
}

export async function prepareRelease(
  root: string,
  version: string,
): Promise<void> {
  validateVersion(version);
  const packages = await releasePackages(root);
  const previous = packages[0]?.manifest.version;
  assert(previous);
  for (const { manifest } of packages)
    assert.equal(manifest.version, previous, "Current versions must agree.");
  validateVersion(previous);
  const oldParts = previous.split(".").map(Number);
  const newParts = version.split(".").map(Number);
  const oldMinor = oldParts[1];
  const oldPatch = oldParts[2];
  const newMinor = newParts[1];
  const newPatch = newParts[2];
  assert(
    oldMinor !== undefined &&
      oldPatch !== undefined &&
      newMinor !== undefined &&
      newPatch !== undefined,
  );
  assert(
    newMinor > oldMinor || (newMinor === oldMinor && newPatch > oldPatch),
    "Choose a version newer than the current release. To resume publication, rerun failed jobs in the original publishing run.",
  );
  const names = new Set(packages.map((p) => p.manifest.name));
  // Construct every change before writing, so malformed metadata cannot leave a partial bump.
  const changes = new Map<string, string>();
  for (const { path, manifest } of packages) {
    manifest.version = version;
    for (const field of [
      "dependencies",
      "peerDependencies",
      "optionalDependencies",
    ] as const) {
      const dependencies = manifest[field];
      for (const [name, pin] of Object.entries(dependencies ?? {})) {
        if (names.has(name) && !pin.startsWith("workspace:"))
          if (dependencies) dependencies[name] = version;
      }
    }
    changes.set(path, JSON.stringify(manifest, null, 2) + "\n");
    const readme = resolve(dirname(path), "README.md");
    const content = await readFile(readme, "utf8");
    changes.set(
      readme,
      content.replace(
        /This package is part of Publisle `[^`]+`,[^\n]*\./u,
        `This package is part of Publisle \`${version}\`, published under the npm \`beta\` tag.`,
      ),
    );
  }
  const showcasePath = resolve(root, "showcase/fourier/package.json");
  const showcase = JSON.parse(
    await readFile(showcasePath, "utf8"),
  ) as PackageManifest;
  assert(showcase.dependencies);
  for (const name of Object.keys(showcase.dependencies ?? {})) {
    if (names.has(name))
      showcase.dependencies[name] =
        `file:.artifacts/${name.slice(1).replaceAll("/", "-")}-${version}.tgz`;
  }
  changes.set(showcasePath, JSON.stringify(showcase, null, 2) + "\n");
  const changelogPath = resolve(root, "CHANGELOG.md");
  const changelog = await readFile(changelogPath, "utf8");
  assert(changelog.includes("## Unreleased\n"));
  changes.set(
    changelogPath,
    changelog.replace(
      "## Unreleased\n",
      `## Unreleased\n\n## ${version} — ${new Date().toISOString().slice(0, 10)}\n\nCoordinated release of all ${String(packages.length)} public packages under the npm\n\`beta\` tag. Contract version integers remain independent of package versions.\n`,
    ),
  );
  for (const [path, content] of changes) await writeFile(path, content);
  console.log(`Prepared ${String(packages.length)} packages at ${version}.`);
}

export async function reviewedTarballs(
  root: string,
  manifestPath: string,
  version: string,
) {
  validateVersion(version);
  const stage = dirname(resolve(manifestPath));
  const report = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as ReleaseManifest;
  assert.equal(report.version, version);
  assert.equal(report.status, "validated-packed-artifacts");
  assert.match(
    report.compiler.publishedImage ?? "",
    /^ghcr\.io\/voidreg\/publisle-compiler@sha256:[a-f0-9]{64}$/u,
    "Publish and record the compiler image first.",
  );
  const names = (await releasePackages(root))
    .map((p) => p.manifest.name)
    .sort();
  assert.deepEqual(report.packages.map((p) => p.name).sort(), names);
  assert.deepEqual(
    report.packages.map((p) => p.name),
    report.publicationOrder,
  );
  const seen = new Set<string>();
  const prepared = [];
  for (const pkg of report.packages) {
    assert.equal(pkg.version, version);
    const path = resolve(stage, pkg.tarball);
    assert(
      relative(stage, path).startsWith(`tarballs${sep}`),
      "Tarball must be inside the artifact tarballs directory.",
    );
    const bytes = await readFile(path);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      pkg.sha256,
      `Changed tarball: ${pkg.name}`,
    );
    const manifest = JSON.parse(
      execFileSync("tar", ["-xOf", path, "package/package.json"], {
        encoding: "utf8",
      }),
    ) as PackageManifest;
    assert.equal(manifest.name, pkg.name);
    assert.equal(manifest.version, version);
    for (const dependencies of [
      manifest.dependencies,
      manifest.peerDependencies,
      manifest.optionalDependencies,
    ]) {
      for (const [name, pin] of Object.entries(dependencies ?? {})) {
        if (names.includes(name)) {
          assert.equal(
            pin,
            version,
            `Incorrect internal pin: ${pkg.name} -> ${name}`,
          );
          assert(seen.has(name), `Dependency must publish first: ${name}`);
        }
      }
    }
    seen.add(pkg.name);
    prepared.push({
      ...pkg,
      path,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    });
  }
  return { stage, packages: prepared };
}

async function registryJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) return null;
  assert(response.ok, `Registry HTTP ${String(response.status)}: ${url}`);
  return (await response.json()) as T;
}

export async function publishRelease(
  root: string,
  manifestPath: string,
  version: string,
  publish: boolean,
): Promise<void> {
  const { stage, packages } = await reviewedTarballs(
    root,
    manifestPath,
    version,
  );
  const registry = "https://registry.npmjs.org";
  // Check the entire batch before publishing anything. Existing immutable versions
  // are accepted only if they are the same bytes retained by this workflow run.
  for (const pkg of packages) {
    const existing = await registryJson<RegistryVersion>(
      `${registry}/${encodeURIComponent(pkg.name)}/${version}`,
    );
    if (existing)
      assert.equal(
        existing.dist.integrity,
        pkg.integrity,
        `Different bytes already published: ${pkg.name}. Resume the original run's failed jobs.`,
      );
  }
  if (!publish) {
    console.log(
      `Validated ${String(packages.length)} tarballs; no packages published.`,
    );
    return;
  }
  assert(
    process.env["GITHUB_ACTIONS"] === "true",
    "Publication must run in GitHub Actions with trusted publishing.",
  );
  const acceptedPath = resolve(stage, "accepted-uploads.json");
  let accepted: string[] = [];
  try {
    accepted = JSON.parse(await readFile(acceptedPath, "utf8")) as string[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const records = [];
  try {
    for (const pkg of packages) {
      const existing = await registryJson<RegistryVersion>(
        `${registry}/${encodeURIComponent(pkg.name)}/${version}`,
      );
      if (existing)
        assert.equal(
          existing.dist.integrity,
          pkg.integrity,
          `Different bytes already published: ${pkg.name}`,
        );
      if (!existing && !accepted.includes(pkg.name)) {
        console.log(`Publishing ${pkg.name}@${version}`);
        execFileSync(
          process.execPath,
          [
            npmCli(),
            "publish",
            pkg.path,
            "--access",
            "public",
            "--tag",
            "beta",
            "--registry",
            registry,
            "--ignore-scripts",
          ],
          { cwd: tmpdir(), stdio: "inherit", timeout: 180_000 },
        );
        accepted.push(pkg.name);
        await writeFile(acceptedPath, JSON.stringify(accepted, null, 2) + "\n");
      }
    }
    // New npm packages can appear at version URLs before normal install indexes.
    for (const pkg of packages) {
      let metadata: RegistryVersion | undefined;
      for (let attempt = 0; attempt < 180; attempt++) {
        const index = await registryJson<{
          versions: Record<string, RegistryVersion>;
          "dist-tags": Record<string, string>;
        }>(`${registry}/${encodeURIComponent(pkg.name)}`);
        metadata = index?.versions[version];
        if (metadata && index?.["dist-tags"]["beta"] === version) break;
        metadata = undefined;
        await new Promise((ok) => setTimeout(ok, 5000));
      }
      assert(
        metadata,
        `Registry index or beta tag not ready: ${pkg.name}. Rerun failed jobs after npm processing completes.`,
      );
      assert.equal(metadata.dist.integrity, pkg.integrity);
      const response = await fetch(metadata.dist.tarball, {
        signal: AbortSignal.timeout(60_000),
      });
      assert(response.ok);
      assert.equal(
        createHash("sha256")
          .update(Buffer.from(await response.arrayBuffer()))
          .digest("hex"),
        pkg.sha256,
      );
      records.push({
        name: pkg.name,
        version,
        sha256: pkg.sha256,
        integrity: pkg.integrity,
        tarball: metadata.dist.tarball,
      });
      console.log(
        `Verified public index, beta tag and downloaded bytes: ${pkg.name}`,
      );
    }
  } finally {
    await writeFile(
      resolve(stage, "publication-record.json"),
      JSON.stringify(
        {
          version,
          tag: "beta",
          sourceCommit: process.env["GITHUB_SHA"],
          verifiedAt: new Date().toISOString(),
          packages: records,
        },
        null,
        2,
      ) + "\n",
    );
  }
  if (process.env["GITHUB_STEP_SUMMARY"])
    await appendFile(
      process.env["GITHUB_STEP_SUMMARY"],
      `Published and verified **${String(records.length)} packages at ${version}** under the npm **beta** tag.\n`,
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(import.meta.dirname, "..");
  const [command, version, manifestPath] = process.argv.slice(2);
  assert(
    version,
    "Usage: node tools/npm-release.ts prepare|verify|publish VERSION [MANIFEST]",
  );
  if (command === "prepare") await prepareRelease(root, version);
  else {
    assert(command === "verify" || command === "publish");
    assert(manifestPath);
    await publishRelease(root, manifestPath, version, command === "publish");
  }
}
