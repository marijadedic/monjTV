import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["dist/**", "data/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}", "vite.config.ts"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // React Compiler rules. Preact refs are written, and read during render, on purpose.
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
    },
  },
  {
    files: ["src/**/*.test.ts"],
    rules: {
      // node:test waits on it() and describe(). The runner owns those promises.
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            { from: "package", name: ["describe", "it"], package: "node:test" },
          ],
        },
      ],
    },
  },
);
