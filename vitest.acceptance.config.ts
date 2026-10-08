import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["default"],
    silent: false,
    include: ["packages/*/tests/**/*.acceptance.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
