import { build } from "esbuild";
import { mkdir, copyFile, mkdtemp, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/worker.ts"],
  outfile: "dist/worker.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  external: ["sharp"],
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
// node.ts reads this recipe record relative to its own module.
await mkdir("compiler", { recursive: true });
await copyFile("../research/compiler/release.json", "compiler/release.json");

// The worker runs outside the workspace in /app. Its imports must not read a
// parent package.json or other source files that are absent in that image.
const smoke = await mkdtemp(join(tmpdir(), "publisle-worker-bundle-"));
try {
  const app = join(smoke, "app");
  await mkdir(app);
  await copyFile("dist/worker.mjs", join(app, "worker.mjs"));
  await symlink(resolve("node_modules"), join(app, "node_modules"), "junction");
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "await import(process.argv[1])",
      pathToFileURL(join(app, "worker.mjs")).href,
    ],
    { timeout: 10000, stdio: "pipe" },
  );
} finally {
  await rm(smoke, { recursive: true, force: true });
}
