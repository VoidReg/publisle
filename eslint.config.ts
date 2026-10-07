import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(
  {
    ignores: [
      "**/dist/**",
      "**/.svelte-kit/**",
      "**/node_modules/**",
      "examples/svelte/svelte.config.js",
      "examples/playground-svelte/svelte.config.js",
    ],
  },
  {
    files: [
      "packages/schema/**/*.ts",
      "packages/core/src/**/*.ts",
      "packages/block-sdk/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "react",
            "react-dom/*",
            "svelte",
            "svelte/*",
            "vite",
            "@publisle/adapter-*",
            "@publisle/markdown",
          ],
        },
      ],
    },
  },
  {
    files: ["packages/adapter-core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["react", "react-dom/*", "svelte", "svelte/*"] },
      ],
    },
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          defaultProject: "tsconfig.json",
        },
        tsconfigRootDir,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: [
      "blocks/**/*.ts",
      "packages/adapter-*/**/*.ts",
      "packages/block-sdk/**/*.ts",
      "packages/core/**/*.ts",
      "packages/markdown/**/*.ts",
      "packages/schema/src/prepared.ts",
      "examples/playground-*/**/*.ts",
      "examples/playground-*/**/*.tsx",
    ],
    rules: {
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-arguments": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unnecessary-type-parameters": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },
  eslintConfigPrettier,
);
