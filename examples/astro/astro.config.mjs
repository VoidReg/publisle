import { defineConfig } from "astro/config";
import { publisleAstro } from "@publisle/adapter-astro";
export default defineConfig({ integrations: [publisleAstro()] });
