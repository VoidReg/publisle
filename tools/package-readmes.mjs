/** One template; manifests supply names/descriptions, snippets preserve package guidance. */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { format } from "prettier";
const root = resolve(import.meta.dirname, "..");
const template = await readFile(
  join(root, "tools/templates/package-readme.md"),
  "utf8",
);
const content = JSON.parse(
  await readFile(join(root, "tools/package-readme-content.json"), "utf8"),
);
const write = process.argv.includes("--write");
for (const group of ["packages", "blocks", "native/packages"])
  for (const entry of await readdir(join(root, group), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    let manifest;
    try {
      manifest = JSON.parse(
        await readFile(join(root, group, entry.name, "package.json"), "utf8"),
      );
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (!manifest.publishConfig) continue;
    const text =
      template
        .replace("{{name}}", manifest.name)
        .replace(
          "{{description}}",
          manifest.description ?? "Publisle document tooling.",
        )
        .replace("{{name}}", manifest.name)
        .replace(
          "{{content}}",
          content[manifest.name] ??
            "Normally installed by Publisle Research as the matching optional platform dependency. Compiler and font licenses are included.",
        )
        .trim() + "\n";
    const formatted = await format(text.replace(/\n{3,}/gu, "\n\n"), {
      parser: "markdown",
    });
    const path = join(root, group, entry.name, "README.md");
    if (write) await writeFile(path, formatted);
    else
      assert.equal(
        await readFile(path, "utf8"),
        formatted,
        `Run pnpm readmes:write: ${path}`,
      );
  }
