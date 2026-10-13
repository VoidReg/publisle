import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";

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
