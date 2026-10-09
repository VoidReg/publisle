import { defineCollection } from "astro:content";
import { publisleLoader } from "@publisle/adapter-astro";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { createRegistry } from "@publisle/core";
import { fileURLToPath } from "node:url";
export const collections = {
  articles: defineCollection({
    loader: publisleLoader(
      { local: fileURLToPath(new URL("../article.json", import.meta.url)) },
      { registry: createRegistry(coreBlockDefinitions) },
    ),
  }),
};
