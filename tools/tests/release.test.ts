/* eslint-disable @typescript-eslint/require-await -- In-memory async publisher doubles. */
import { mkdtemp, mkdir, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import {
  publishPackages,
  reviewedTarballs,
  releasePackages,
  validateVersion,
} from "../release.ts";
it("publishes only the 24 TypeScript packages", async () => {
  const p = await releasePackages(new URL("../../", import.meta.url).pathname);
  expect(p).toHaveLength(24);
  expect(
    p.filter((p) => p.manifest.name.includes("/pdf-native-")),
  ).toHaveLength(0);
  expect(p.some((p) => p.manifest.name === "@publisle/pdf-service")).toBe(
    false,
  );
});
it("supports numeric beta releases and actual prereleases", () => {
  validateVersion("0.3.0");
  validateVersion("0.3.0-next.1");
  expect(() => {
    validateVersion("0.0.0");
  }).toThrow();
  expect(() => {
    validateVersion("latest");
  }).toThrow();
});
it("checks every immutable collision before any upload", async () => {
  let uploads = 0;
  await expect(
    publishPackages(
      [
        { name: "a", version: "0.1.0", integrity: "A" },
        { name: "b", version: "0.1.0", integrity: "B" },
      ],
      {
        accepted: new Set(),
        lookup: async (p) =>
          p.name === "b"
            ? { dist: { integrity: "wrong", tarball: "x" } }
            : null,
        upload: async () => {
          uploads++;
        },
        save: async () => {
          /* In-memory no-op. */
        },
        wait: async () => {
          /* In-memory no-op. */
        },
      },
    ),
  ).rejects.toThrow(/Different published bytes/);
  expect(uploads).toBe(0);
});
it("waits for accepted and staged uploads instead of publishing twice", async () => {
  for (const staged of [false, true]) {
    let uploads = 0,
      polls = 0,
      saves = 0;
    const accepted = new Set<string>();
    await publishPackages([{ name: "a", version: "0.1.0", integrity: "A" }], {
      accepted,
      lookup: async () =>
        ++polls > 4 ? { dist: { integrity: "A", tarball: "x" } } : null,
      upload: async () => {
        uploads++;
        if (staged) throw Error("npm E409 previously staged version");
      },
      save: async () => {
        saves++;
      },
      wait: async () => {
        /* In-memory no-op. */
      },
    });
    expect(uploads).toBe(1);
    expect(saves).toBe(1);
    expect(accepted.has("a@0.1.0")).toBe(true);
  }
});
it("resumes persisted uploads and leaves pending versions recoverable", async () => {
  let uploads = 0;
  await expect(
    publishPackages([{ name: "a", version: "0.1.0", integrity: "A" }], {
      accepted: new Set(["a@0.1.0"]),
      attempts: 2,
      lookup: async () => null,
      upload: async () => {
        uploads++;
      },
      save: async () => {
        /* In-memory no-op. */
      },
      wait: async () => {
        /* In-memory no-op. */
      },
    }),
  ).rejects.toThrow(/still processing/);
  expect(uploads).toBe(0);
});
it("skips matching public packages and refuses changed bytes after processing", async () => {
  let uploads = 0;
  const p = { name: "a", version: "0.1.0", integrity: "A" };
  await publishPackages([p], {
    accepted: new Set(),
    lookup: async () => ({ dist: { integrity: "A", tarball: "x" } }),
    upload: async () => {
      uploads++;
    },
    save: async () => {
      /* In-memory no-op. */
    },
    wait: async () => {
      /* In-memory no-op. */
    },
  });
  expect(uploads).toBe(0);
  let lookups = 0;
  await expect(
    publishPackages([p], {
      accepted: new Set(["a@0.1.0"]),
      lookup: async () =>
        ++lookups > 2 ? { dist: { integrity: "wrong", tarball: "x" } } : null,
      upload: async () => {
        /* In-memory no-op. */
      },
      save: async () => {
        /* In-memory no-op. */
      },
      wait: async () => {
        /* In-memory no-op. */
      },
    }),
  ).rejects.toThrow(/Different published bytes/);
});

it("rejects stale source, escaped archives and altered bytes before publication", async () => {
  const root = await mkdtemp(join(tmpdir(), "publisle-release-test-"));
  const repository = new URL("../../", import.meta.url).pathname;
  try {
    const packages = await releasePackages(repository);
    for (const item of packages) {
      const path = join(root, relative(repository, item.path));
      await mkdir(dirname(path), { recursive: true });
      await cp(item.path, path);
    }
    await cp(
      join(repository, "packages/core-packages.json"),
      join(root, "packages/core-packages.json"),
    );
    const versions = Object.fromEntries(
      packages.map((p) => [p.manifest.name, p.manifest.version]),
    );
    const first = packages[0];
    if (!first) throw Error("Missing package fixture");
    const { name, version } = first.manifest;
    await mkdir(join(root, ".release"));
    await writeFile(
      join(root, ".release/plan.json"),
      JSON.stringify({
        schemaVersion: 2,
        id: "test",
        versions,
        releases: [{ name, oldVersion: "0.0.0", version }],
      }),
    );
    const stage = join(root, "stage");
    await mkdir(join(stage, "tarballs"), { recursive: true });
    await writeFile(join(stage, "tarballs/package.tgz"), "changed archive");
    const report = {
      schemaVersion: 2,
      releaseId: "test",
      versions,
      sourceCommit: "different",
      sourceTree: "wrong",
      publicationOrder: [name],
      packages: [
        { name, version, tarball: "tarballs/package.tgz", sha256: "wrong" },
      ],
    };
    const manifest = join(stage, "release-manifest.json");
    const save = () => writeFile(manifest, JSON.stringify(report));
    await save();
    await expect(reviewedTarballs(root, manifest)).rejects.toThrow(
      "Changed tarball",
    );
    const archive = report.packages[0];
    if (!archive) throw Error("Missing archive fixture");
    archive.tarball = "../outside.tgz";
    await save();
    await expect(reviewedTarballs(root, manifest)).rejects.toThrow();
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    const emptyTree = execFileSync(
      "git",
      ["hash-object", "-t", "tree", "--stdin"],
      { cwd: root, input: "", encoding: "utf8" },
    ).trim();
    await expect(reviewedTarballs(root, manifest, emptyTree)).rejects.toThrow(
      "Stale validated source",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
