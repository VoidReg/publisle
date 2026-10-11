import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readFile,
  readdir,
  writeFile,
  appendFile,
  mkdir,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { satisfies, gt } from "semver";

interface PackageManifest {
  name: string;
  version: string;
  publishConfig?: unknown;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}
export interface ReleasePlan {
  schemaVersion: 2;
  id: string;
  versions: Record<string, string>;
  releases: { name: string; oldVersion: string; version: string }[];
}
interface ReleaseManifest {
  schemaVersion: 2;
  releaseId: string | null;
  sourceCommit: string | null;
  versions: Record<string, string>;
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
    "Use a numeric beta version such as 0.1.1 or 0.2.0.",
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

export function validatePlan(
  plan: ReleasePlan,
  packages: { manifest: PackageManifest }[],
): void {
  assert.equal(plan.schemaVersion, 2);
  assert.match(plan.id, /^npm-release-[a-zA-Z0-9-]+$/u);
  const versions = Object.fromEntries(
    packages.map(({ manifest }) => [manifest.name, manifest.version]),
  );
  assert.deepEqual(
    plan.versions,
    versions,
    "Release plan does not match source versions.",
  );
  assert(plan.releases.length, "Empty publication plan.");
  const seen = new Set<string>();
  for (const pkg of plan.releases) {
    assert(!seen.has(pkg.name), "Duplicate planned package.");
    seen.add(pkg.name);
    validateVersion(pkg.version);
    validateVersion(pkg.oldVersion);
    assert(gt(pkg.version, pkg.oldVersion), "Release version must increase.");
    assert.equal(plan.versions[pkg.name], pkg.version);
  }
}

export async function readReleasePlan(root: string): Promise<ReleasePlan> {
  const plan = JSON.parse(
    await readFile(join(root, ".release/plan.json"), "utf8"),
  ) as ReleasePlan;
  validatePlan(plan, await releasePackages(root));
  return plan;
}

export async function prepareRelease(
  root: string,
): Promise<ReleasePlan | null> {
  const packages = await releasePackages(root);
  // A completed GitHub release proves that registry consumer verification passed.
  const previousPath = join(root, ".release/plan.json");
  if (existsSync(previousPath)) {
    const previous = await readReleasePlan(root);
    const release = JSON.parse(
      execFileSync(
        "gh",
        ["release", "view", previous.id, "--json", "isDraft"],
        { cwd: root, encoding: "utf8" },
      ),
    ) as { isDraft: boolean };
    assert(
      !release.isDraft,
      "Resume the unfinished publication before preparing another release.",
    );
  }
  const temporary = await mkdtemp(join(tmpdir(), "publisle-plan-"));
  try {
    const cli = fileURLToPath(
      new URL("../node_modules/@changesets/cli/bin.js", import.meta.url),
    );
    const output = join(temporary, "changesets.json");
    execFileSync(process.execPath, [cli, "status", "--output", output], {
      cwd: root,
      stdio: "inherit",
    });
    const status = JSON.parse(await readFile(output, "utf8")) as {
      releases: {
        name: string;
        type: string;
        oldVersion: string;
        newVersion: string;
      }[];
    };
    const pending = status.releases.filter((pkg) => pkg.type !== "none");
    if (!pending.length) {
      console.log("No pending Changesets; nothing to release.");
      return null;
    }
    const versions = Object.fromEntries(
      packages.map(({ manifest }) => [manifest.name, manifest.version]),
    );
    const releases = pending.map((pkg) => {
      assert.equal(
        versions[pkg.name],
        pkg.oldVersion,
        "Unexpected Changesets package.",
      );
      versions[pkg.name] = pkg.newVersion;
      return {
        name: pkg.name,
        oldVersion: pkg.oldVersion,
        version: pkg.newVersion,
      };
    });
    const id = `npm-release-${process.env["GITHUB_RUN_ID"] ?? String(Date.now())}-${process.env["GITHUB_RUN_ATTEMPT"] ?? "1"}`;
    const plan: ReleasePlan = { schemaVersion: 2, id, versions, releases };
    validatePlan(
      plan,
      packages.map((pkg) => {
        const version = versions[pkg.manifest.name];
        assert(version);
        return { manifest: { ...pkg.manifest, version } };
      }),
    );
    execFileSync(process.execPath, [cli, "version"], {
      cwd: root,
      stdio: "inherit",
    });
    validatePlan(plan, await releasePackages(root));
    for (const pkg of packages) {
      const version = versions[pkg.manifest.name];
      assert(version);
      if (version === pkg.manifest.version) continue;
      const readme = join(dirname(pkg.path), "README.md");
      const content = await readFile(readme, "utf8");
      await writeFile(
        readme,
        content.replace(
          /^This package is part of Publisle[^\n]*\.$/mu,
          `This package is part of Publisle, independently versioned at \`${version}\` and published under the npm \`beta\` tag.`,
        ),
      );
    }
    const showcasePath = join(root, "showcase/fourier/package.json");
    const showcase = JSON.parse(
      await readFile(showcasePath, "utf8"),
    ) as PackageManifest;
    for (const [name, version] of Object.entries(versions)) {
      if (showcase.dependencies?.[name])
        showcase.dependencies[name] =
          `file:.artifacts/${name.slice(1).replaceAll("/", "-")}-${version}.tgz`;
    }
    await writeFile(showcasePath, JSON.stringify(showcase, null, 2) + "\n");
    await mkdir(join(root, ".release"), { recursive: true });
    await writeFile(previousPath, JSON.stringify(plan, null, 2) + "\n");
    console.log(
      `Prepared ${String(releases.length)} independently versioned packages (${id}).`,
    );
    return plan;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function reviewedTarballs(
  root: string,
  manifestPath: string,
  expectedCommit?: string,
) {
  const stage = dirname(resolve(manifestPath));
  const report = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as ReleaseManifest;
  assert.equal(report.schemaVersion, 2);
  const plan = await readReleasePlan(root);
  assert.equal(report.releaseId, plan.id);
  assert.deepEqual(report.versions, plan.versions);
  if (expectedCommit) assert.equal(report.sourceCommit, expectedCommit);
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
  const publishing = new Set(plan.releases.map((pkg) => pkg.name));
  assert.equal(new Set(report.publicationOrder).size, publishing.size);
  assert.deepEqual([...report.publicationOrder].sort(), [...publishing].sort());
  assert.deepEqual(
    report.packages.filter((p) => publishing.has(p.name)).map((p) => p.name),
    report.publicationOrder,
  );
  const seen = new Set<string>();
  const prepared = [];
  for (const pkg of report.packages) {
    assert.equal(pkg.version, report.versions[pkg.name]);
    validateVersion(pkg.version);
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
    assert.equal(manifest.version, pkg.version);
    for (const dependencies of [
      manifest.dependencies,
      manifest.peerDependencies,
      manifest.optionalDependencies,
    ]) {
      for (const [name, pin] of Object.entries(dependencies ?? {})) {
        if (names.includes(name)) {
          const version = report.versions[name];
          assert(
            version && satisfies(version, pin),
            `Incompatible internal range: ${pkg.name} -> ${name}`,
          );
          if (publishing.has(pkg.name) && publishing.has(name))
            assert(seen.has(name), `Dependency must publish first: ${name}`);
        }
      }
    }
    seen.add(pkg.name);
    if (publishing.has(pkg.name))
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
  publish: boolean,
  expectedCommit?: string,
): Promise<void> {
  const { stage, packages } = await reviewedTarballs(
    root,
    manifestPath,
    expectedCommit,
  );
  const registry = "https://registry.npmjs.org";
  // Check the entire batch before publishing anything. Existing immutable versions
  // are accepted only if they are the same bytes retained by this workflow run.
  for (const pkg of packages) {
    const existing = await registryJson<RegistryVersion>(
      `${registry}/${encodeURIComponent(pkg.name)}/${pkg.version}`,
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
        `${registry}/${encodeURIComponent(pkg.name)}/${pkg.version}`,
      );
      if (existing)
        assert.equal(
          existing.dist.integrity,
          pkg.integrity,
          `Different bytes already published: ${pkg.name}`,
        );
      if (!existing && !accepted.includes(pkg.name)) {
        console.log(`Publishing ${pkg.name}@${pkg.version}`);
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
        metadata = index?.versions[pkg.version];
        if (metadata && index?.["dist-tags"]["beta"] === pkg.version) break;
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
        version: pkg.version,
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
          releaseId: (await readReleasePlan(root)).id,
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
      `Published and verified **${String(records.length)} independently versioned packages** under the npm **beta** tag.\n`,
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(import.meta.dirname, "..");
  const [command, manifestPath] = process.argv.slice(2);
  if (command === "prepare") await prepareRelease(root);
  else if (command === "source") await readReleasePlan(root);
  else {
    assert(
      command === "verify" || command === "publish",
      "Use prepare|source|verify|publish [MANIFEST].",
    );
    assert(manifestPath);
    await publishRelease(
      root,
      manifestPath,
      command === "publish",
      process.env["GITHUB_SHA"],
    );
  }
}
