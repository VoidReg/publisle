import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validDigest } from "./compiler-platform-digest.mjs";
import { VERSION, SHA256 } from "./install-verapdf.mjs";
export function releaseRecord(registry, index, amd64, arm64, manifest, recipe) {
  for (const digest of [index, amd64, arm64])
    assert(validDigest(digest), "Invalid compiler digest");
  assert(
    /^ghcr\.io\/[a-z0-9._/-]+$/u.test(registry),
    "Invalid compiler registry",
  );
  const platforms = { "linux/amd64": amd64, "linux/arm64": arm64 };
  assert.equal(manifest.manifests?.length, 2, "Unexpected compiler platforms");
  const actual = Object.fromEntries(
    manifest.manifests.map((item) => [
      `${item.platform?.os}/${item.platform?.architecture}`,
      item.digest,
    ]),
  );
  assert.deepEqual(
    actual,
    platforms,
    "Unexpected compiler platforms or digests",
  );
  assert(
    Number.isSafeInteger(recipe.recipeVersion) && recipe.recipeVersion > 0,
    "Invalid recipe version",
  );
  return {
    recipeVersion: recipe.recipeVersion,
    publishedImage: `${registry}@${index}`,
    platforms,
    veraPdf: { version: VERSION, installerSha256: SHA256 },
    verification:
      "Native amd64 and arm64 publisher compilation and veraPDF PDF/UA-2 and PDF/UA-1 gates passed before platform publication.",
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert.equal(
    process.argv.length,
    6,
    "Usage: node tools/compiler-release-record.mjs REGISTRY INDEX AMD64 ARM64",
  );
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  const recipe = JSON.parse(
    await readFile("packages/research/compiler/release.json", "utf8"),
  );
  console.log(
    JSON.stringify(
      releaseRecord(...process.argv.slice(2), manifest, recipe),
      null,
      2,
    ),
  );
}
