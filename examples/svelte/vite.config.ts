import { publislePublication } from "@publisle/adapter-core/vite";
import { sceneDefinition } from "@publisle/example-scene";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { interactiveSchematicDefinition } from "@publisle/blocks-technical";
import { createRegistry } from "@publisle/core";
import adapter from "@sveltejs/adapter-auto";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const registry = createRegistry([
  ...coreBlockDefinitions,
  interactiveSchematicDefinition,
  sceneDefinition,
]);

export default defineConfig({
  plugins: [
    publislePublication({ registry }),
    sveltekit({ adapter: adapter() }),
  ],
});
