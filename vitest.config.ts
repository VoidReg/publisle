import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Bound CPU contention now that independent schema consumers run alongside
    // the Node fixture builders. Keep assertion timeouts unchanged.
    maxWorkers: 2,
    exclude: ["**/*.acceptance.test.ts"],
    include: [
      "packages/*/tests/**/*.test.ts",
      "examples/playground-core/tests/**/*.test.ts",
    ],
  },
});
