import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const state = vi.hoisted(() => ({ packagePath: "" }));
vi.mock("node:module", () => ({
  createRequire: () => ({ resolve: () => state.packagePath }),
}));
import {
  installedNativeCompiler,
  NATIVE_PLATFORM_PACKAGES,
  NATIVE_ARTIFACT_VERSION,
} from "../src/native-install.ts";
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "publisle-native-package-"));
  temporary.push(root);
  await mkdir(join(root, "bin"));
  const executable = `bin/publisle-pdf${process.platform === "win32" ? ".exe" : ""}`;
  const bytes = Buffer.from("pinned compiler fixture");
  await writeFile(join(root, executable), bytes);
  const fonts = JSON.stringify([]);
  await writeFile(join(root, "fonts.json"), fonts);
  const artifact = {
    schemaVersion: 1,
    inputSchemaVersion: 1,
    compilerVersion: NATIVE_ARTIFACT_VERSION,
    platform: process.platform,
    architecture: process.arch,
    files: {
      [executable]: createHash("sha256").update(bytes).digest("hex"),
      "fonts.json": createHash("sha256").update(fonts).digest("hex"),
    },
  };
  await writeFile(join(root, "artifact.json"), JSON.stringify(artifact));
  state.packagePath = join(root, "package.json");
  await writeFile(
    state.packagePath,
    JSON.stringify({
      name: NATIVE_PLATFORM_PACKAGES[`${process.platform}-${process.arch}`],
      version: NATIVE_ARTIFACT_VERSION,
    }),
  );
  return { root, executable, artifact };
}
it("resolves the matching installed artifact without downloading", async () => {
  const { root, executable } = await fixture();
  expect(await installedNativeCompiler()).toEqual({
    executable: join(root, executable),
    fontManifest: join(root, "fonts.json"),
    compilerVersion: NATIVE_ARTIFACT_VERSION,
  });
});
it("rejects corrupted binaries before invocation", async () => {
  const { root, executable } = await fixture();
  await writeFile(join(root, executable), "changed bytes");
  await expect(installedNativeCompiler()).rejects.toThrow(/checksum mismatch/u);
});
it("rejects escaped paths and incompatible input versions", async () => {
  const { root, artifact } = await fixture();
  const files = { ...artifact.files, "../outside": "a".repeat(64) };
  await writeFile(
    join(root, "artifact.json"),
    JSON.stringify({ ...artifact, files }),
  );
  await expect(installedNativeCompiler()).rejects.toThrow(/path or checksum/u);
  await writeFile(
    join(root, "artifact.json"),
    JSON.stringify({ ...artifact, inputSchemaVersion: 99 }),
  );
  await expect(installedNativeCompiler()).rejects.toThrow(/incompatible/u);
});
it("rejects a package version that does not match Research", async () => {
  await fixture();
  await writeFile(
    state.packagePath,
    JSON.stringify({
      name: NATIVE_PLATFORM_PACKAGES[`${process.platform}-${process.arch}`],
      version: "0.0.0",
    }),
  );
  await expect(installedNativeCompiler()).rejects.toThrow(/version/u);
});
