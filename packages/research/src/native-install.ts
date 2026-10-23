/** Locate a pinned, already installed native artifact. Never download at runtime. */
import { createHash } from "node:crypto";
import researchPackage from "../package.json" with { type: "json" };
import { createRequire } from "node:module";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseJson, isPlainObject } from "@publisle/schema";
const require = createRequire(import.meta.url);
export const NATIVE_ARTIFACT_VERSION =
  researchPackage.optionalDependencies["@publisle/pdf-native-linux-x64"];
if (
  !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/u.test(NATIVE_ARTIFACT_VERSION) ||
  !Object.values(researchPackage.optionalDependencies).every(
    (version) => version === NATIVE_ARTIFACT_VERSION,
  )
)
  throw new Error(
    "Native PDF dependencies must share one exact external version.",
  );
export const NATIVE_PLATFORM_PACKAGES: Readonly<Record<string, string>> = {
  "linux-x64": "@publisle/pdf-native-linux-x64",
  "linux-arm64": "@publisle/pdf-native-linux-arm64",
  "darwin-x64": "@publisle/pdf-native-darwin-x64",
  "darwin-arm64": "@publisle/pdf-native-darwin-arm64",
  "win32-x64": "@publisle/pdf-native-win32-x64",
};
export interface InstalledNativeCompiler {
  readonly executable: string;
  readonly fontManifest: string;
  readonly compilerVersion: string;
}
export async function installedNativeCompiler(): Promise<InstalledNativeCompiler> {
  const name = NATIVE_PLATFORM_PACKAGES[`${process.platform}-${process.arch}`];
  if (!name)
    throw new Error(
      `Native PDF does not support ${process.platform}/${process.arch}. Configure an explicit compatible compiler and fonts.`,
    );
  let root: string;
  try {
    root = dirname(require.resolve(`${name}/package.json`));
  } catch {
    throw new Error(
      `Missing ${name}@${NATIVE_ARTIFACT_VERSION}. Install that native package; optional dependencies may have been omitted. PDF compilation never downloads binaries.`,
    );
  }
  const manifest = parseJson(await readFile(resolve(root, "package.json")));
  if (
    !isPlainObject(manifest) ||
    manifest["name"] !== name ||
    manifest["version"] !== NATIVE_ARTIFACT_VERSION
  )
    throw new Error(
      "Installed native PDF package version does not match the pinned dependency.",
    );
  const artifact = parseJson(await readFile(resolve(root, "artifact.json")), {
    maxBytes: 65536,
    maxDepth: 8,
    maxNodes: 512,
  });
  if (
    !isPlainObject(artifact) ||
    artifact["schemaVersion"] !== 1 ||
    artifact["inputSchemaVersion"] !== 1 ||
    artifact["compilerVersion"] !== NATIVE_ARTIFACT_VERSION ||
    artifact["platform"] !== process.platform ||
    artifact["architecture"] !== process.arch ||
    !isPlainObject(artifact["files"])
  )
    throw new Error("Native artifact metadata is invalid or incompatible.");
  const executable =
    process.platform === "win32" ? "bin/publisle-pdf.exe" : "bin/publisle-pdf";
  const paths = Object.keys(artifact["files"]);
  if (
    !paths.includes(executable) ||
    !paths.includes("fonts.json") ||
    paths.length > 64
  )
    throw new Error("Native artifact inventory is incomplete.");
  const base = await realpath(root);
  for (const [file, digest] of Object.entries(artifact["files"])) {
    if (
      typeof digest !== "string" ||
      !/^[a-f0-9]{64}$/u.test(digest) ||
      isAbsolute(file) ||
      file.split(/[\\/]/u).includes("..")
    )
      throw new Error("Invalid native artifact path or checksum.");
    const path = await realpath(resolve(base, file));
    const local = relative(base, path);
    if (
      isAbsolute(local) ||
      local === ".." ||
      local.startsWith(`..${sep}`) ||
      !(await stat(path)).isFile()
    )
      throw new Error("Native artifact escapes its package.");
    const bytes = await readFile(path);
    if (createHash("sha256").update(bytes).digest("hex") !== digest)
      throw new Error(`Native artifact checksum mismatch: ${file}`);
  }
  return {
    executable: resolve(base, executable),
    fontManifest: resolve(base, "fonts.json"),
    compilerVersion: NATIVE_ARTIFACT_VERSION,
  };
}
