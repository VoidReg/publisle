import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import {
  readFile,
  readdir,
  writeFile,
  mkdir,
  mkdtemp,
  cp,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { satisfies, gt } from "semver";

function environment(name: string) {
  const value = process.env[name];
  assert(value, `Missing ${name}`);
  return value;
}
interface Manifest {
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
export function npmCli(): string {
  const path = (process.env["PATH"] ?? "")
    .split(delimiter)
    .map((p) => join(p, "npm"))
    .find(existsSync);
  assert(path, "npm is required");
  return realpathSync(path);
}
const run = (
  command: string,
  args: string[],
  cwd = resolve(import.meta.dirname, ".."),
) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
const json = async <T>(path: string) =>
  JSON.parse(await readFile(path, "utf8")) as T;
export async function releasePackages(root: string) {
  const sets = await json<{
    core: string[];
    research: string[];
    native?: string[];
  }>(join(root, "packages/core-packages.json"));
  const packages: { path: string; manifest: Manifest }[] = [];
  for (const group of ["packages", "blocks", "native/packages"]) {
    if (!existsSync(join(root, group))) continue;
    for (const entry of await readdir(join(root, group), {
      withFileTypes: true,
    })) {
      const path = join(root, group, entry.name, "package.json");
      if (!entry.isDirectory() || !existsSync(path)) continue;
      const manifest = await json<Manifest>(path);
      if (manifest.publishConfig) packages.push({ path, manifest });
    }
  }
  const names = [...sets.core, ...sets.research, ...(sets.native ?? [])];
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(
    packages.map((p) => p.manifest.name).sort(),
    names.sort(),
    "Publish set and manifests disagree",
  );
  return packages;
}
export function validateVersion(version: string) {
  assert.match(
    version,
    /^0\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u,
  );
  assert.notEqual(version, "0.0.0");
}
export async function readReleasePlan(root: string) {
  const plan = await json<ReleasePlan>(join(root, ".release/plan.json"));
  assert.equal(plan.schemaVersion, 2);
  assert.deepEqual(
    plan.versions,
    Object.fromEntries(
      (await releasePackages(root)).map((p) => [
        p.manifest.name,
        p.manifest.version,
      ]),
    ),
  );
  assert(plan.releases.length);
  for (const p of plan.releases) {
    validateVersion(p.version);
    assert.equal(plan.versions[p.name], p.version);
  }
  return plan;
}
export async function syncNativeVersion(root: string) {
  const research = await json<Manifest>(
    join(root, "packages/research/package.json"),
  );
  const sets = await json<{ native: string[] }>(
    join(root, "packages/core-packages.json"),
  );
  for (const p of await releasePackages(root))
    if (sets.native.includes(p.manifest.name))
      assert.equal(
        p.manifest.version,
        research.version,
        "Native packages must version with Research",
      );
  const cargo = join(root, "native/pdf/Cargo.toml"),
    lock = join(root, "native/pdf/Cargo.lock");
  await writeFile(
    cargo,
    (await readFile(cargo, "utf8")).replace(
      /^(version = ")[^"]+/mu,
      `$1${research.version}`,
    ),
  );
  await writeFile(
    lock,
    (await readFile(lock, "utf8")).replace(
      /(name = "publisle-pdf"\nversion = ")[^"]+/u,
      `$1${research.version}`,
    ),
  );
  await writeFile(
    join(root, "native/pdf/package-version.json"),
    JSON.stringify({ version: research.version }, null, 2) + "\n",
  );
}
export async function versionRelease(root: string) {
  const before = await releasePackages(root);
  run("pnpm", ["changeset", "version"], root);
  await syncNativeVersion(root);
  const after = await releasePackages(root),
    versions = Object.fromEntries(
      after.map((p) => [p.manifest.name, p.manifest.version]),
    );
  const releases = before
    .filter((p) => versions[p.manifest.name] !== p.manifest.version)
    .map((p) => ({
      name: p.manifest.name,
      oldVersion: p.manifest.version,
      version: (() => {
        const value = versions[p.manifest.name];
        assert(value);
        return value;
      })(),
    }));
  assert(releases.length, "No pending package changes");
  const id =
    "release-" +
    createHash("sha256")
      .update(JSON.stringify(versions))
      .digest("hex")
      .slice(0, 16);
  await mkdir(join(root, ".release"), { recursive: true });
  await writeFile(
    join(root, ".release/plan.json"),
    JSON.stringify({ schemaVersion: 2, id, versions, releases }, null, 2) +
      "\n",
  );
  run("pnpm", ["install", "--lockfile-only", "--ignore-scripts"], root);
  run(
    "pnpm",
    [
      "exec",
      "prettier",
      "--write",
      "packages",
      "blocks",
      "native/packages",
      "native/pdf/package-version.json",
      ".release",
      ".changeset",
      "pnpm-lock.yaml",
    ],
    root,
  );
}
interface Packed {
  name: string;
  version: string;
  tarball: string;
  sha256: string;
}
interface Artifact {
  schemaVersion: number;
  releaseId: string;
  sourceCommit: string;
  sourceTree?: string;
  versions: Record<string, string>;
  publicationOrder: string[];
  packages: Packed[];
}
export async function reviewedTarballs(
  root: string,
  manifestPath: string,
  expectedCommit?: string,
) {
  const report = await json<Artifact>(manifestPath),
    plan = await readReleasePlan(root),
    stage = dirname(manifestPath);
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.releaseId, plan.id);
  assert.deepEqual(report.versions, plan.versions);
  if (expectedCommit && report.sourceCommit !== expectedCommit)
    assert.equal(
      report.sourceTree,
      run("git", ["rev-parse", `${expectedCommit}^{tree}`], root).trim(),
      "Stale validated source",
    );
  const wanted = new Set(plan.releases.map((p) => p.name));
  assert.deepEqual([...report.publicationOrder].sort(), [...wanted].sort());
  const packages = [];
  const seen = new Set<string>();
  for (const name of report.publicationOrder) {
    const p = report.packages.find((p) => p.name === name);
    assert(p);
    assert(!seen.has(name));
    const path = resolve(stage, p.tarball),
      local = relative(stage, path);
    assert(
      local.startsWith(`tarballs${sep}`) && !local.split(sep).includes(".."),
    );
    const bytes = await readFile(path);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      p.sha256,
      "Changed tarball",
    );
    const m = JSON.parse(
      run("tar", ["-xOf", path, "package/package.json"]),
    ) as Manifest;
    assert.equal(m.name, name);
    assert.equal(m.version, plan.versions[name]);
    assert.equal(p.version, m.version);
    for (const [dependency, pin] of Object.entries({
      ...m.dependencies,
      ...m.peerDependencies,
      ...m.optionalDependencies,
    }))
      if (plan.versions[dependency]) {
        assert(satisfies(plan.versions[dependency], pin));
        if (wanted.has(dependency))
          assert(seen.has(dependency), "Publish dependencies first");
      }
    seen.add(name);
    packages.push({
      ...p,
      path,
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    });
  }
  return { stage, packages };
}
export interface Publication {
  name: string;
  version: string;
  integrity: string;
}
interface RegistryVersion {
  dist: { integrity: string; tarball: string };
}
interface Publisher {
  lookup: (pkg: Publication) => Promise<RegistryVersion | null>;
  upload: (pkg: Publication) => Promise<void>;
  save: (key: string) => Promise<void>;
  wait: () => Promise<void>;
  accepted: Set<string>;
  attempts?: number;
}
export async function publishPackages(packages: Publication[], io: Publisher) {
  // Check the entire batch before any mutation, including immutable collisions.
  for (const p of packages) {
    const old = await io.lookup(p);
    if (old)
      assert.equal(
        old.dist.integrity,
        p.integrity,
        `Different published bytes: ${p.name}`,
      );
  }
  for (const p of packages) {
    const key = `${p.name}@${p.version}`;
    let m = await io.lookup(p);
    if (!m && !io.accepted.has(key)) {
      try {
        await io.upload(p);
      } catch (error) {
        if (!/\bE409\b|previously staged version/u.test(String(error)))
          throw error;
      }
      io.accepted.add(key);
      await io.save(key);
    }
    for (let n = 0; !m && n < (io.attempts ?? 180); n++) {
      await io.wait();
      m = await io.lookup(p);
    }
    assert(
      m,
      `Accepted upload is still processing: ${key}. Resume this run; do not rebuild or republish.`,
    );
    assert.equal(
      m.dist.integrity,
      p.integrity,
      `Different published bytes: ${p.name}`,
    );
  }
}
async function registry(pkg: Publication) {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${pkg.version}?verify=${String(Date.now())}`,
    {
      signal: AbortSignal.timeout(30000),
      headers: { "cache-control": "no-cache" },
    },
  );
  if (response.status === 404) return null;
  assert(response.ok, `Registry HTTP ${String(response.status)}`);
  return response.json() as Promise<RegistryVersion>;
}
export async function publishRelease(root: string, manifestPath: string) {
  assert.equal(process.env["GITHUB_ACTIONS"], "true");
  const { stage, packages } = await reviewedTarballs(
    root,
    manifestPath,
    process.env["GITHUB_SHA"],
  );
  const file = join(stage, "accepted-uploads.json"),
    accepted = new Set(existsSync(file) ? await json<string[]>(file) : []);
  const npm = (args: string[]) =>
    run(process.execPath, [npmCli(), ...args], tmpdir());
  await publishPackages(packages, {
    lookup: registry,
    accepted,
    wait: () => new Promise((ok) => setTimeout(ok, 5000)),
    save: async () => {
      await writeFile(file, JSON.stringify([...accepted]));
    },
    upload: (p) => {
      const pkg = packages.find((x) => x.name === p.name);
      assert(pkg);
      npm([
        "publish",
        pkg.path,
        "--access",
        "public",
        "--provenance",
        "--ignore-scripts",
        "--tag",
        p.version.includes("-") ? "next" : "latest",
      ]);
      return Promise.resolve();
    },
  });
  const records = [];
  for (const p of packages) {
    const m = await registry(p);
    assert(m);
    const response = await fetch(m.dist.tarball, {
      signal: AbortSignal.timeout(60000),
    });
    assert(response.ok);
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(await response.arrayBuffer()))
        .digest("hex"),
      p.sha256,
    );
    const tag = p.version.includes("-") ? "next" : "latest";
    // publish --tag establishes the channel. OIDC publishing credentials must
    // not be assumed to authorize standalone account/tag mutations.
    let visibleTag: string | undefined;
    for (let attempt = 0; attempt < 180; attempt++) {
      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(p.name)}?tags=${String(Date.now())}`,
        { signal: AbortSignal.timeout(30000) },
      );
      assert(response.ok);
      const index = (await response.json()) as {
        "dist-tags": Record<string, string>;
      };
      visibleTag = index["dist-tags"][tag];
      if (visibleTag === p.version || (visibleTag && gt(visibleTag, p.version)))
        break;
      await new Promise((ok) => setTimeout(ok, 5000));
    }
    assert(
      visibleTag && (visibleTag === p.version || gt(visibleTag, p.version)),
      `Registry channel not ready: ${p.name} ${tag}`,
    );
    records.push({
      name: p.name,
      version: p.version,
      integrity: p.integrity,
      sha256: p.sha256,
    });
  }
  await writeFile(
    join(stage, "publication-record.json"),
    JSON.stringify(
      { sourceCommit: process.env["GITHUB_SHA"], packages: records },
      null,
      2,
    ),
  );
}
export async function finalizeRelease(root: string, manifestPath: string) {
  const { packages } = await reviewedTarballs(
    root,
    manifestPath,
    environment("GITHUB_SHA"),
  );
  const record = await json<{ packages: { name: string; version: string }[] }>(
    join(dirname(manifestPath), "publication-record.json"),
  );
  assert.deepEqual(
    record.packages.map((p) => p.name + "@" + p.version).sort(),
    packages.map((p) => p.name + "@" + p.version).sort(),
  );
  for (const p of packages) {
    const tag = `${p.name}@${p.version}`;
    let exists = false;
    try {
      run("gh", ["release", "view", tag], root);
      exists = true;
    } catch {
      /* Missing releases are reconciled on reruns. */
    }
    if (exists) {
      const refs = run(
        "git",
        [
          "ls-remote",
          "origin",
          `refs/tags/${tag}`,
          `refs/tags/${tag}^{} `.trim(),
        ],
        root,
      )
        .trim()
        .split("\n");
      const target = refs.at(-1)?.split(/\s+/u)[0];
      assert.equal(
        target,
        environment("GITHUB_SHA"),
        "Conflicting release tag",
      );
      run(
        "gh",
        [
          "release",
          "edit",
          tag,
          "--draft=false",
          "--title",
          tag,
          "--prerelease=" + String(p.version.includes("-")),
        ],
        root,
      );
    }
    if (!exists)
      run(
        "gh",
        [
          "release",
          "create",
          tag,
          "--target",
          environment("GITHUB_SHA"),
          "--title",
          tag,
          "--generate-notes",
          ...(p.version.includes("-") ? ["--prerelease"] : []),
        ],
        root,
      );
  }
}
async function promote(root: string) {
  const sha = environment("GITHUB_SHA"),
    repo = environment("GITHUB_REPOSITORY");
  const prs = JSON.parse(
    run("gh", ["api", `repos/${repo}/commits/${sha}/pulls`]),
  ) as { head: { sha: string } }[];
  const candidates = JSON.parse(
    run("gh", [
      "run",
      "list",
      "--workflow",
      "release.yml",
      "--status",
      "success",
      "--limit",
      "100",
      "--json",
      "databaseId,headSha,event",
    ]),
  ) as { databaseId: number; headSha: string; event: string }[];
  const tree = run("git", ["rev-parse", "HEAD^{tree}"], root).trim();
  for (const candidate of candidates.filter(
    (r) =>
      prs.some((p) => p.head.sha === r.headSha) &&
      ["pull_request", "workflow_dispatch"].includes(r.event),
  )) {
    const directory = await mkdtemp(join(tmpdir(), "publisle-validated-"));
    run(
      "gh",
      [
        "run",
        "download",
        String(candidate.databaseId),
        "--name",
        "packed-consumer-and-tarballs",
        "--dir",
        directory,
      ],
      root,
    );
    const paths = (await readdir(directory, { recursive: true })).filter((p) =>
      p.endsWith("release-manifest.json"),
    );
    assert.equal(paths.length, 1);
    const first = paths[0];
    assert(first);
    const path = join(directory, first);
    const manifest = await json<Artifact>(path);
    if (manifest.sourceTree !== tree) continue;
    await reviewedTarballs(root, path, sha);
    // Restore progress from earlier attempts of this exact publication run.
    const artifacts = JSON.parse(
      run("gh", [
        "api",
        `repos/${repo}/actions/runs/${environment("GITHUB_RUN_ID")}/artifacts`,
      ]),
    ) as { artifacts: { id: number; name: string; expired: boolean }[] };
    const previous = artifacts.artifacts
      .filter((a) => !a.expired && a.name.startsWith("publication-progress-"))
      .sort((a, b) => b.id - a.id)[0];
    if (previous)
      run(
        "gh",
        [
          "run",
          "download",
          environment("GITHUB_RUN_ID"),
          "--name",
          previous.name,
          "--dir",
          dirname(path),
        ],
        root,
      );
    await cp(dirname(path), join(root, ".local/release"), { recursive: true });
    return;
  }
  throw new Error(
    "No successful release validation with the exact merged source tree; validate the Version packages PR before publishing.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = resolve(import.meta.dirname, "..");
  switch (process.argv[2]) {
    case "version":
      await versionRelease(root);
      break;
    case "sync":
      await syncNativeVersion(root);
      break;
    case "promote":
      await promote(root);
      break;
    case "finalize":
      await finalizeRelease(
        root,
        join(root, ".local/release/release-manifest.json"),
      );
      break;
    case "publish":
      await publishRelease(
        root,
        join(root, ".local/release/release-manifest.json"),
      );
      break;
    default:
      throw new Error("Use release.ts version|sync|promote|publish");
  }
}
