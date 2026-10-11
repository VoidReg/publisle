import { defineCollection } from "astro:content";
import { publisleDocsLoader } from "./lib/docs-loader";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { createRegistry } from "@publisle/core";
import { docSources } from "./lib/docs-source";

// The site's own documentation is loaded through Publisle's Markdown pipeline
// and rendered with the production compiler — docs are the demo.
export const collections = {
  docs: defineCollection({
    loader: publisleDocsLoader(docSources(), {
      registry: createRegistry(coreBlockDefinitions),
      knownFiles: docSources().map((source) => source.repoPath),
    }),
  }),
};
