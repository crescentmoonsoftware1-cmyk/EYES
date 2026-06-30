import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".venv/**",
    "out/**",
    "build/**",
    "scripts/**",
    "next-env.d.ts",
    // Local developer utility/debug scripts (CommonJS, not part of the production build)
    "check-db.js",
    "run-live-audit.js",
    "scripts/embed-memories.mjs",
    "check_*.js",
    "scratch_*.js",
    "test_*.js",
    "test_*.ts",
    "run_*.ts",
    "request_*.js",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn"
    }
  }
]);

export default eslintConfig;
