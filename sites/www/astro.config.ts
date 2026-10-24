import { visualizer } from "rollup-plugin-visualizer";
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
    plugins: [
      tailwindcss(),
      ...(process.env.BUNDLE_REPORT
        ? [
            visualizer({
              filename: process.env.BUNDLE_REPORT,
              template: "raw-data",
              gzipSize: true,
              sourcemap: true,
            }),
          ]
        : []),
    ],
    build: { sourcemap: !!process.env.BUNDLE_REPORT },
  },
});
