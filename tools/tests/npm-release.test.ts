import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareRelease,
  publishRelease,
  reviewedTarballs,
  validateVersion,
} from "../npm-release.ts";

const temporary: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "publisle-release-test-"));
  temporary.push(root);
  await mkdir(join(root, "packages/schema"), { recursive: true });
  await mkdir(join(root, "blocks/core"), { recursive: true });
  await mkdir(join(root, "showcase/fourier"), { recursive: true });
  const names = ["@publisle/schema", "@publisle/blocks-core"];
  await writeFile(
    join(root, "packages/core-packages.json"),
    JSON.stringify({ core: names, research: [] }),
  );
  const paths = ["packages/schema", "blocks/core"];
  for (const [i, path] of paths.entries()) {
    await writeFile(
      join(root, path, "package.json"),
      JSON.stringify({
        name: names[i],
        version: "0.1.0",
        publishConfig: { access: "public" },
        ...(i === 1
          ? {
              dependencies: { "@publisle/schema": "workspace:*" },
              peerDependencies: {
                "@publisle/schema": "0.1.0",
                unrelated: "^4.0.0",
              },
            }
          : {}),
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
      name: "showcase",
      version: "0.0.0",
      dependencies: {
        "@publisle/schema": "file:.artifacts/publisle-schema-0.1.0.tgz",
        astro: "6.4.8",
      },
    }),
  );
  await writeFile(
    join(root, "CHANGELOG.md"),
    "# Changelog\n\n## Unreleased\n\n- A change.\n\n## 0.1.0\n\nHistorical notes.\n",
  );
  return { root, paths, names };
}
async function artifacts() {
  const source = await fixture();
  const stage = join(source.root, "artifacts");
  await mkdir(join(stage, "tarballs"), { recursive: true });
  const packages = [];
  for (const [i, path] of source.paths.entries()) {
    const unpacked = join(stage, `unpacked-${String(i)}`);
    await mkdir(join(unpacked, "package"), { recursive: true });
    const manifest = JSON.parse(
      await readFile(join(source.root, path, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    if (manifest.dependencies)
      manifest.dependencies["@publisle/schema"] = "0.1.0";
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
      name: source.names[i],
      version: "0.1.0",
      tarball,
      sha256: createHash("sha256")
        .update(await readFile(join(stage, tarball)))
        .digest("hex"),
    });
  }
  const report = {
    version: "0.1.0",
    status: "validated-packed-artifacts",
    compiler: {
      publishedImage: `ghcr.io/voidreg/publisle-compiler@sha256:${"a".repeat(64)}`,
    },
    publicationOrder: source.names,
    packages,
  };
  const manifestPath = join(stage, "release-manifest.json");
  await writeFile(manifestPath, JSON.stringify(report));
  return { ...source, stage, manifestPath, report };
}

describe("coordinated npm release", () => {
  it.each(["0.0.0", "1.0.0", "0.01.1", "0.1", "0.1.1; echo bad", "../0.1.1"])(
    "rejects invalid beta version %s",
    (version) => {
      expect(() => {
        validateVersion(version);
      }).toThrow();
    },
  );
  it("bumps the entire publish set, exact pins, README, showcase and changelog together", async () => {
    const { root } = await fixture();
    await prepareRelease(root, "0.1.1");
    const manifest = JSON.parse(
      await readFile(join(root, "blocks/core/package.json"), "utf8"),
    ) as {
      version: string;
      dependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
    };
    expect(manifest.version).toBe("0.1.1");
    expect(manifest.dependencies["@publisle/schema"]).toBe("workspace:*");
    expect(manifest.peerDependencies).toEqual({
      "@publisle/schema": "0.1.1",
      unrelated: "^4.0.0",
    });
    expect(
      await readFile(join(root, "packages/schema/README.md"), "utf8"),
    ).toContain("`0.1.1`");
    expect(
      await readFile(join(root, "showcase/fourier/package.json"), "utf8"),
    ).toContain("publisle-schema-0.1.1.tgz");
    const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
    expect(changelog).toContain("## 0.1.1 —");
    expect(changelog).toContain("Historical notes.");
    expect(changelog.indexOf("## 0.1.1")).toBeLessThan(
      changelog.indexOf("- A change."),
    );
  });
  it.each(["0.1.0", "0.0.9"])(
    "refuses unchanged or older version %s without writes",
    async (version) => {
      const { root } = await fixture();
      const path = join(root, "packages/schema/package.json");
      const before = await readFile(path, "utf8");
      await expect(prepareRelease(root, version)).rejects.toThrow("newer");
      expect(await readFile(path, "utf8")).toBe(before);
    },
  );
  it("rejects an incomplete publish set", async () => {
    const { root } = await fixture();
    await rm(join(root, "blocks/core"), { recursive: true });
    await expect(prepareRelease(root, "0.1.1")).rejects.toThrow("disagree");
  });
  it("validates all artifacts before allowing publication", async () => {
    const { root, manifestPath } = await artifacts();
    const report = await reviewedTarballs(root, manifestPath, "0.1.0");
    expect(report.packages).toHaveLength(2);
    expect(report.packages[0]?.integrity).toMatch(/^sha512-/u);
  });
  it("refuses changed tarball bytes", async () => {
    const { root, stage, manifestPath } = await artifacts();
    await writeFile(join(stage, "tarballs/package-1.tgz"), "tampered");
    await expect(reviewedTarballs(root, manifestPath, "0.1.0")).rejects.toThrow(
      "Changed tarball",
    );
  });
  it("refuses paths outside the retained artifact directory", async () => {
    const { root, manifestPath, report } = await artifacts();
    const first = report.packages[0];
    expect(first).toBeDefined();
    if (first) first.tarball = "../outside.tgz";
    await writeFile(manifestPath, JSON.stringify(report));
    await expect(reviewedTarballs(root, manifestPath, "0.1.0")).rejects.toThrow(
      "inside",
    );
  });
  it("refuses publication order that places a dependency after its consumer", async () => {
    const { root, manifestPath, report } = await artifacts();
    report.packages.reverse();
    report.publicationOrder.reverse();
    await writeFile(manifestPath, JSON.stringify(report));
    await expect(reviewedTarballs(root, manifestPath, "0.1.0")).rejects.toThrow(
      "publish first",
    );
  });
  it("preflights the whole batch and refuses a conflicting published version", async () => {
    const { root, manifestPath } = await artifacts();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({ dist: { integrity: "different" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      publishRelease(root, manifestPath, "0.1.0", true),
    ).rejects.toThrow("Different bytes already published");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
