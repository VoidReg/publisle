import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/pdf-ua.integration.test.ts"],
    maxWorkers: 1,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    include: ["packages/research/tests/**/*.integration.test.ts"],
  },
});
