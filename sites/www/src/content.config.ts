import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, join } from "node:path";
import { defineCollection } from "astro:content";
import { publisleDocsLoader, type DocEntryInput } from "./lib/docs-loader";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { createRegistry } from "@publisle/core";

// The site's own documentation is loaded through Publisle's Markdown pipeline
// and rendered with the production compiler — docs are the demo.
const docsRoot = fileURLToPath(new URL("../../../docs/", import.meta.url));

function sectionEntries(section: "guides" | "standards"): DocEntryInput[] {
  const dir = join(docsRoot, section);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const file = join(dir, name);
      const source = readFileSync(file, "utf8");
      const heading = /^#\s+(.+?)\s*$/mu.exec(source)?.[1];
      const base = basename(name, ".md");
      return {
        id: name === "README.md" ? section : `${section}/${base}`,
        file,
        section,
        title: heading ?? (name === "README.md" ? section : base),
      };
    });
}

export const collections = {
  docs: defineCollection({
    loader: publisleDocsLoader(
      [...sectionEntries("guides"), ...sectionEntries("standards")],
      {
        registry: createRegistry(coreBlockDefinitions),
        knownFiles: [
          "README.md",
          ...readdirSync(join(docsRoot, "guides"))
            .filter((name) => name.endsWith(".md"))
            .map((name) => `guides/${name}`),
          ...readdirSync(join(docsRoot, "standards"))
            .filter((name) => name.endsWith(".md"))
            .map((name) => `standards/${name}`),
        ],
      },
    ),
  }),
};
