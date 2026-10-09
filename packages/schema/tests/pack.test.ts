import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("packed schema consumer", () => {
  it("parses a document from the packed tarball without reader packages", () => {
    const directory = mkdtempSync(join(tmpdir(), "publisle-pack-"));
    try {
      execFileSync(
        "pnpm",
        [
          "--filter",
          "@publisle/schema",
          "pack",
          "--pack-destination",
          directory,
        ],
        { cwd: join(import.meta.dirname, "../../.."), stdio: "pipe" },
      );
      const tarball = readdirSync(directory).find((name) =>
        name.endsWith(".tgz"),
      );
      if (!tarball) throw new Error("Schema pack did not produce a tarball");
      const listed = execFileSync("tar", ["-tzf", join(directory, tarball)], {
        encoding: "utf8",
      });
      expect(listed).toContain("package/src/index.ts");
      expect(listed).not.toContain("adapter-");
      execFileSync("tar", ["-xzf", join(directory, tarball), "-C", directory]);
      const manifest = JSON.parse(
        readFileSync(join(directory, "package/package.json"), "utf8"),
      ) as { license?: string; dependencies?: Record<string, string> };
      expect(manifest.license).toBe("MIT");
      expect(manifest.dependencies ?? {}).not.toHaveProperty(
        "@publisle/adapter-react",
      );
      const entry = pathToFileURL(join(directory, "package/src/index.ts")).href;
      const result = execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "--input-type=module",
          "--eval",
          `import { parseDocument } from ${JSON.stringify(entry)};
           const document = parseDocument({ schemaVersion: 1, metadata: { language: "ar", direction: "rtl" }, blocks: [] });
           if (document.metadata?.language !== "ar" || document.metadata?.direction !== "rtl") process.exit(1);`,
        ],
        { encoding: "utf8" },
      );
      expect(result).toBe("");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
