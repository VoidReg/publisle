import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 1,
    testTimeout: 240_000,
    hookTimeout: 240_000,
    include: ["packages/research/tests/pdf-ua.integration.test.ts"],
  },
});
