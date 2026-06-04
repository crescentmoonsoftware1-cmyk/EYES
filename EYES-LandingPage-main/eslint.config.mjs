import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      // Build output directories
      ".next/**",
      "out/**",
      "build/**",
      // Auto-generated Next.js type file
      "next-env.d.ts",
      // Node modules
      "node_modules/**",
      // ESLint-specific ignore (migrated from .eslintignore)
      "postcss.config.mjs",
    ],
  },
]);

export default eslintConfig;
