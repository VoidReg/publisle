import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { publisleAstro } from "@publisle/adapter-astro";

export default defineConfig({
  site: "https://publisle.xyz",
  output: "static",
  integrations: [svelte(), sitemap(), publisleAstro()],
  vite: {
    plugins: [tailwindcss()],
  },
});
