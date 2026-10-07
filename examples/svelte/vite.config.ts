import { publislePublication } from "@publisle/adapter-core/vite";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { createRegistry } from "@publisle/core";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const registry = createRegistry([
  ...coreBlockDefinitions,
  interactiveSchematicDefinition,
]);

export default defineConfig({
  plugins: [publislePublication({ registry }), sveltekit()],
});
