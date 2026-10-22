/* eslint-disable @typescript-eslint/require-await -- In-memory async publisher doubles. */
import { expect, it } from "vitest";
import {
  publishPackages,
  releasePackages,
  validateVersion,
} from "../release.ts";
it("publishes only the 29 public packages, including all five native platforms", async () => {
  const p = await releasePackages(new URL("../../", import.meta.url).pathname);
  expect(p).toHaveLength(29);
  expect(
    p.filter((p) => p.manifest.name.includes("/pdf-native-")),
  ).toHaveLength(5);
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
