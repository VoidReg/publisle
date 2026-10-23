import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  readFile,
  copyFile,
  cp,
  mkdir,
  writeFile,
  chmod,
  realpath,
} from "node:fs/promises";
import { dirname, resolve, isAbsolute, relative, sep } from "node:path";
const require = createRequire(import.meta.url);
const destination = resolve(process.argv[2] ?? "/");
const expected = JSON.parse(
  await readFile(new URL("./package.json", import.meta.url), "utf8"),
);
const research = JSON.parse(
  await readFile(new URL("./research.json", import.meta.url), "utf8"),
);
assert.deepEqual(
  expected.optionalDependencies,
  research.optionalDependencies,
  "Worker and Research must pin the same native releases",
);
const name = `@publisle/pdf-native-${process.platform}-${process.arch}`;
const root = await realpath(dirname(require.resolve(`${name}/package.json`)));
const manifest = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);
const artifact = JSON.parse(
  await readFile(resolve(root, "artifact.json"), "utf8"),
);
assert.equal(manifest.version, expected.optionalDependencies[name]);
assert.equal(artifact.compilerVersion, manifest.version);
assert.equal(artifact.platform, process.platform);
assert.equal(artifact.architecture, process.arch);
assert.equal(artifact.schemaVersion, 1);
assert.equal(artifact.inputSchemaVersion, 1);
assert(Object.keys(artifact.files).length <= 64);
assert(artifact.files["bin/publisle-pdf"] && artifact.files["fonts.json"]);
for (const [file, digest] of Object.entries(artifact.files)) {
  assert(!isAbsolute(file) && !file.split(/[\\/]/u).includes(".."));
  const path = await realpath(resolve(root, file));
  const local = relative(root, path);
  assert(!isAbsolute(local) && local !== ".." && !local.startsWith(`..${sep}`));
  assert.equal(
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
    digest,
    file,
  );
}
await copyFile(
  resolve(root, "bin/publisle-pdf"),
  resolve(destination, "publisle-pdf"),
);
await chmod(resolve(destination, "publisle-pdf"), 0o755);
await mkdir(resolve(destination, "fonts"));
await cp(resolve(root, "fonts"), resolve(destination, "fonts"), {
  recursive: true,
});
await cp(resolve(root, "licenses"), resolve(destination, "fonts/licenses"), {
  recursive: true,
});
const fonts = JSON.parse(await readFile(resolve(root, "fonts.json"), "utf8"));
for (const font of fonts) {
  assert(artifact.files[font.path]);
  font.path = font.path.replace(/^fonts\//u, "/app/fonts/");
}
await writeFile(
  resolve(destination, "native-fonts.json"),
  JSON.stringify(fonts),
);
