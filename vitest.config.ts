import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/tests/**/*.test.ts",
      "examples/playground-core/tests/**/*.test.ts",
    ],
  },
});
