import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/*.acceptance.test.ts"],
    include: [
      "packages/*/tests/**/*.test.ts",
      "examples/playground-core/tests/**/*.test.ts",
    ],
  },
});
