import { readReleasePlan, releasePackages } from "./release.ts";
import { dirname, relative, resolve } from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const run = (args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();
const headRef = process.env["GITHUB_HEAD_REF"];
const branch = headRef?.length ? headRef : process.env["GITHUB_REF_NAME"];
if (branch === "changeset-release/main") {
  await readReleasePlan(resolve(import.meta.dirname, ".."));
  execFileSync("pnpm", ["changeset", "status", "--since", "HEAD"], {
    stdio: "inherit",
  });
} else {
  const files = run(["diff", "--name-only", "origin/main...HEAD"]).split("\n");
  const root = resolve(import.meta.dirname, "..");
  const packages = await releasePackages(root);
  const publicChange = files.some((file) =>
    packages.some(({ path }) => {
      const prefix = relative(root, dirname(path)) + "/";
      return (
        file === prefix + "package.json" || file.startsWith(prefix + "src/")
      );
    }),
  );
  execFileSync(
    "pnpm",
    ["changeset", "status", "--since", publicChange ? "origin/main" : "HEAD"],
    {
      stdio: "inherit",
    },
  );
  if (publicChange)
    assert(
      files.some((file) =>
        /^\.changeset\/(?!config\.json)[^/]+\.md$/u.test(file),
      ),
      "Public package changes need a Changeset. Docs and private workflow changes are exempt.",
    );
}
