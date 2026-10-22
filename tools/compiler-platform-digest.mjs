import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export const validDigest = (value) =>
  typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
export function platformDigest(manifest, architecture) {
  assert(
    ["amd64", "arm64"].includes(architecture),
    "Unsupported compiler architecture",
  );
  let digest;
  if ("manifests" in manifest) {
    assert(Array.isArray(manifest.manifests), "Invalid OCI index");
    const matches = manifest.manifests.filter(
      (item) =>
        item.platform?.os === "linux" &&
        item.platform?.architecture === architecture,
    );
    assert.equal(
      matches.length,
      1,
      "Expected exactly one compiler platform manifest",
    );
    digest = matches[0].digest;
  } else digest = manifest.digest;
  assert(validDigest(digest), "Invalid platform manifest digest");
  return digest;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert.equal(
    process.argv.length,
    3,
    "Usage: node tools/compiler-platform-digest.mjs amd64|arm64",
  );
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    assert(length <= 1024 * 1024, "OCI manifest exceeds limit");
    chunks.push(chunk);
  }
  console.log(
    platformDigest(JSON.parse(Buffer.concat(chunks)), process.argv[2]),
  );
}
