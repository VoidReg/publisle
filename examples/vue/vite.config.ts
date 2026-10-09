import { defineConfig } from "vite";
import { publisleVue } from "@publisle/adapter-vue";
import { coreBlockDefinitions } from "@publisle/blocks-core";
import { createRegistry } from "@publisle/core";
export default defineConfig({
  plugins: [
    await publisleVue({ registry: createRegistry(coreBlockDefinitions) }),
  ],
});
