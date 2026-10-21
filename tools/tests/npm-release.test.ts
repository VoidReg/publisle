import { afterEach, describe, expect, it, vi } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareRelease,
  publishRelease,
  reviewedTarballs,
  validateVersion,
  releasePackages,
  type ReleasePlan,
} from "../npm-release.ts";

const temporary: string[] = [];
it("keeps the internal website PDF service out of npm releases", async () => {
  const root = new URL("../../", import.meta.url).pathname;
  const manifest = JSON.parse(
    await readFile(join(root, "packages/pdf-service/package.json"), "utf8"),
  ) as { name: string; private: boolean; publishConfig?: unknown };
  expect(manifest.private).toBe(true);
  expect(manifest.publishConfig).toBeUndefined();
  const releases = await releasePackages(root);
  expect(releases.some((entry) => entry.manifest.name === manifest.name)).toBe(
    false,
  );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture(bump?: "patch" | "minor", range = "workspace:^0.1.0") {
  const root = await mkdtemp(join(tmpdir(), "publisle-release-test-"));
  temporary.push(root);
  for (const path of [
    "packages/schema",
    "packages/private-example",
    "blocks/core",
    "showcase/fourier",
    ".changeset",
  ])
    await mkdir(join(root, path), { recursive: true });
  await writeFile(
    join(root, "packages/private-example/package.json"),
    JSON.stringify({
      name: "@publisle/example",
      private: true,
      version: "0.0.0",
      dependencies: { "@publisle/schema": "workspace:*" },
    }),
  );
  const names = ["@publisle/schema", "@publisle/blocks-core"];
  const paths = ["packages/schema", "blocks/core"];
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "test-release",
      private: true,
      workspaces: ["packages/*", "blocks/*"],
    }),
  );
  await writeFile(
    join(root, "pnpm-workspace.yaml"),
    "packages:\n  - packages/*\n  - blocks/*\n",
  );
  await writeFile(
    join(root, ".changeset/config.json"),
    JSON.stringify({
      changelog: false,
      commit: false,
      fixed: [],
      linked: [],
      access: "public",
      baseBranch: "main",
      updateInternalDependencies: "patch",
      ignore: [],
    }),
  );
  await writeFile(
    join(root, "packages/core-packages.json"),
    JSON.stringify({ core: names, research: [] }),
  );
  for (const [i, path] of paths.entries()) {
    await writeFile(
      join(root, path, "package.json"),
      JSON.stringify({
        name: names[i],
        version: "0.1.0",
        publishConfig: { access: "public" },
        ...(i === 1 ? { dependencies: { "@publisle/schema": range } } : {}),
      }),
    );
    await writeFile(
      join(root, path, "README.md"),
      "This package is part of Publisle `0.1.0`, the first beta release.\n",
    );
  }
  await writeFile(
    join(root, "showcase/fourier/package.json"),
    JSON.stringify({
      private: true,
      dependencies: {
        "@publisle/schema": "file:.artifacts/publisle-schema-0.1.0.tgz",
        astro: "7.2.8",
      },
    }),
  );
  if (bump)
    await writeFile(
      join(root, ".changeset/change.md"),
      `---\n"@publisle/schema": ${bump}\n---\n\nFix schema.\n`,
    );
  execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "fixture",
    ],
    { cwd: root, stdio: "ignore" },
  );
  return { root, names, paths };
}
async function artifacts(subset = false) {
  const source = await fixture();
  const stage = join(source.root, "artifacts");
  await mkdir(join(stage, "tarballs"), { recursive: true });
  const versions = {
    "@publisle/schema": "0.1.1",
    "@publisle/blocks-core": "0.2.0",
  };
  const packages = [];
  for (const [i, path] of source.paths.entries()) {
    const name = source.names[i];
    assert(name);
    const version = versions[name as keyof typeof versions];
    const manifest = JSON.parse(
      await readFile(join(source.root, path, "package.json"), "utf8"),
    ) as { version: string; dependencies?: Record<string, string> };
    manifest.version = version;
    await writeFile(
      join(source.root, path, "package.json"),
      JSON.stringify(manifest),
    );
    if (manifest.dependencies)
      manifest.dependencies["@publisle/schema"] = "^0.1.0";
    const unpacked = join(stage, `unpacked-${String(i)}`);
    await mkdir(join(unpacked, "package"), { recursive: true });
    await writeFile(
      join(unpacked, "package/package.json"),
      JSON.stringify(manifest),
    );
    const tarball = `tarballs/package-${String(i)}.tgz`;
    execFileSync("tar", [
      "-czf",
      join(stage, tarball),
      "-C",
      unpacked,
      "package",
    ]);
    packages.push({
      name,
      version,
      tarball,
      sha256: createHash("sha256")
        .update(await readFile(join(stage, tarball)))
        .digest("hex"),
    });
  }
  const plan: ReleasePlan = {
    schemaVersion: 2,
    id: "npm-release-test-1",
    versions,
    releases: packages
      .filter((_, i) => !subset || i === 1)
      .map((pkg) => ({
        name: pkg.name,
        oldVersion: "0.1.0",
        version: pkg.version,
      })),
  };
  await mkdir(join(source.root, ".release"));
  await writeFile(
    join(source.root, ".release/plan.json"),
    JSON.stringify(plan),
  );
  const report = {
    schemaVersion: 2,
    releaseId: plan.id,
    sourceCommit: "abc",
    versions,
    status: "validated-packed-artifacts",
    compiler: {
      publishedImage: `ghcr.io/voidreg/publisle-compiler@sha256:${"a".repeat(64)}`,
    },
    publicationOrder: plan.releases.map((pkg) => pkg.name),
    packages,
  };
  const manifestPath = join(stage, "release-manifest.json");
  await writeFile(manifestPath, JSON.stringify(report));
  return { ...source, stage, manifestPath, report };
}

describe("independent npm releases", () => {
  it.each(["0.0.0", "1.0.0", "0.01.1", "0.1", "0.1.1; echo bad", "../0.1.1"])(
    "rejects invalid beta version %s",
    (version) => {
      expect(() => {
        validateVersion(version);
      }).toThrow();
    },
  );
  it("releases only a changed package when the dependent range stays compatible", async () => {
    const { root } = await fixture("patch", "workspace:^");
    const plan = await prepareRelease(root);
    expect(plan?.releases).toEqual([
      { name: "@publisle/schema", oldVersion: "0.1.0", version: "0.1.1" },
    ]);
    expect(plan?.versions["@publisle/blocks-core"]).toBe("0.1.0");
    expect(
      await readFile(join(root, "showcase/fourier/package.json"), "utf8"),
    ).toContain("publisle-schema-0.1.1.tgz");
    expect(
      await readFile(join(root, "packages/schema/README.md"), "utf8"),
    ).toContain("independently versioned at `0.1.1`");
  });
  it("includes a dependent when its existing range excludes the new version", async () => {
    const { root } = await fixture("minor");
    const plan = await prepareRelease(root);
    expect(plan?.versions).toEqual({
      "@publisle/schema": "0.2.0",
      "@publisle/blocks-core": "0.1.1",
    });
    expect(plan?.releases).toHaveLength(2);
    expect(
      await readFile(join(root, "blocks/core/package.json"), "utf8"),
    ).toContain("workspace:^0.2.0");
  });
  it("does not write metadata when there are no pending changes", async () => {
    const { root } = await fixture();
    expect(await prepareRelease(root)).toBeNull();
    expect(
      execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toBe("");
  });
  it("refuses a new preparation while a prior batch remains unfinished", async () => {
    const { root } = await fixture("patch");
    const plan: ReleasePlan = {
      schemaVersion: 2,
      id: "npm-release-previous-1",
      versions: {
        "@publisle/schema": "0.1.0",
        "@publisle/blocks-core": "0.1.0",
      },
      releases: [
        { name: "@publisle/schema", oldVersion: "0.0.9", version: "0.1.0" },
      ],
    };
    await mkdir(join(root, ".release"));
    await writeFile(join(root, ".release/plan.json"), JSON.stringify(plan));
    const bin = join(root, "bin");
    await mkdir(bin);
    const gh = join(bin, "gh");
    await writeFile(
      gh,
      `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({isDraft:true}));\n`,
    );
    await chmod(gh, 0o755);
    vi.stubEnv("PATH", `${bin}:${process.env["PATH"] ?? ""}`);
    await expect(prepareRelease(root)).rejects.toThrow(
      "Resume the unfinished publication",
    );
    expect(await readFile(join(root, ".release/plan.json"), "utf8")).toBe(
      JSON.stringify(plan),
    );
    expect(
      JSON.parse(
        await readFile(join(root, "packages/schema/package.json"), "utf8"),
      ),
    ).toHaveProperty("version", "0.1.0");
  });
  it("rejects an incomplete publish set", async () => {
    const { root } = await fixture();
    await rm(join(root, "blocks/core"), { recursive: true });
    await expect(prepareRelease(root)).rejects.toThrow("disagree");
  });
  it.each([false, true])(
    "checks historical release completion when the publish set grows (draft: %s)",
    async (isDraft) => {
      const { root } = await fixture("patch", "workspace:^");
      const previous: ReleasePlan = {
        schemaVersion: 2,
        id: "npm-release-previous-1",
        versions: { "@publisle/schema": "0.1.0" },
        releases: [
          { name: "@publisle/schema", oldVersion: "0.0.9", version: "0.1.0" },
        ],
      };
      await mkdir(join(root, ".release"));
      await writeFile(
        join(root, ".release/plan.json"),
        JSON.stringify(previous),
      );
      const bin = join(root, "bin");
      await mkdir(bin);
      const gh = join(bin, "gh");
      await writeFile(
        gh,
        `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({isDraft:${String(isDraft)}}));\n`,
      );
      await chmod(gh, 0o755);
      vi.stubEnv("PATH", `${bin}:${process.env["PATH"] ?? ""}`);
      if (isDraft) {
        await expect(prepareRelease(root)).rejects.toThrow(
          "Resume the unfinished publication",
        );
        expect(await readFile(join(root, ".release/plan.json"), "utf8")).toBe(
          JSON.stringify(previous),
        );
      } else {
        const plan = await prepareRelease(root);
        expect(plan?.versions).toEqual({
          "@publisle/schema": "0.1.1",
          "@publisle/blocks-core": "0.1.0",
        });
        expect(plan?.releases).toEqual([
          { name: "@publisle/schema", oldVersion: "0.1.0", version: "0.1.1" },
        ]);
      }
    },
  );
  it("validates mixed versions and returns only the publication subset", async () => {
    const { root, manifestPath } = await artifacts(true);
    const result = await reviewedTarballs(root, manifestPath, "abc");
    expect(result.packages.map((pkg) => [pkg.name, pkg.version])).toEqual([
      ["@publisle/blocks-core", "0.2.0"],
    ]);
  });
  it("rejects a manifest from another commit", async () => {
    const { root, manifestPath } = await artifacts();
    await expect(
      reviewedTarballs(root, manifestPath, "different"),
    ).rejects.toThrow();
  });
  it("refuses changed tarball bytes", async () => {
    const { root, stage, manifestPath } = await artifacts();
    await writeFile(join(stage, "tarballs/package-1.tgz"), "tampered");
    await expect(reviewedTarballs(root, manifestPath)).rejects.toThrow(
      "Changed tarball",
    );
  });
  it("refuses missing artifacts", async () => {
    const { root, stage, manifestPath } = await artifacts();
    await rm(join(stage, "tarballs/package-1.tgz"));
    await expect(reviewedTarballs(root, manifestPath)).rejects.toThrow();
  });
  it("refuses paths outside retained artifacts", async () => {
    const { root, manifestPath, report } = await artifacts();
    assert(report.packages[0]);
    report.packages[0].tarball = "../outside.tgz";
    await writeFile(manifestPath, JSON.stringify(report));
    await expect(reviewedTarballs(root, manifestPath)).rejects.toThrow(
      "inside",
    );
  });
  it("refuses consumers before their publishing dependency", async () => {
    const { root, manifestPath, report } = await artifacts();
    report.packages.reverse();
    report.publicationOrder.reverse();
    await writeFile(manifestPath, JSON.stringify(report));
    await expect(reviewedTarballs(root, manifestPath)).rejects.toThrow(
      "publish first",
    );
  });
  it("rejects an artifact version inconsistent with the source plan", async () => {
    const { root, manifestPath, report } = await artifacts();
    assert(report.packages[0]);
    report.packages[0].version = "0.9.0";
    await writeFile(manifestPath, JSON.stringify(report));
    await expect(reviewedTarballs(root, manifestPath)).rejects.toThrow();
  });
  it("preflights the whole batch before allowing any upload", async () => {
    const { root, manifestPath } = await artifacts();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({ dist: { integrity: "different" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(publishRelease(root, manifestPath, true)).rejects.toThrow(
      "Different bytes already published",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("resumes retained packages without republishing matching immutable versions", async () => {
    const { root, stage, manifestPath, report } = await artifacts();
    vi.stubEnv("GITHUB_ACTIONS", "true");
    await writeFile(
      join(stage, "accepted-uploads.json"),
      JSON.stringify(report.packages.map((pkg) => pkg.name)),
    );
    const metadata = new Map(
      await Promise.all(
        report.packages.map(async (pkg) => {
          const bytes = await readFile(join(stage, pkg.tarball));
          return [
            pkg.name,
            {
              pkg,
              bytes,
              dist: {
                integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
                tarball: `https://example.com/${String(pkg.name.split("/")[1])}.tgz`,
              },
            },
          ] as const;
        }),
      ),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        for (const [name, record] of metadata) {
          if (url === record.dist.tarball)
            return Promise.resolve(new Response(new Uint8Array(record.bytes)));
          const endpoint = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
          if (url === `${endpoint}/${record.pkg.version}`)
            return Promise.resolve(Response.json({ dist: record.dist }));
          if (url === endpoint)
            return Promise.resolve(
              Response.json({
                versions: { [record.pkg.version]: { dist: record.dist } },
                "dist-tags": { latest: record.pkg.version },
              }),
            );
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );
    await publishRelease(root, manifestPath, true);
    const result = JSON.parse(
      await readFile(join(stage, "publication-record.json"), "utf8"),
    ) as { packages: { version: string }[] };
    expect(result.packages.map((pkg) => pkg.version)).toEqual([
      "0.1.1",
      "0.2.0",
    ]);
  });
});
