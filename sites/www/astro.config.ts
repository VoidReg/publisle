import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import { publisleAstro } from "@publisle/adapter-astro";

export default defineConfig({
  site: "https://publisle.xyz",
  output: "static",
  trailingSlash: "always",
  integrations: [svelte(), publisleAstro()],
  vite: {
    plugins: [tailwindcss()],
  },
});
