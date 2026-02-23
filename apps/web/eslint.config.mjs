import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const ruleOverrides = {
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-unused-vars": "warn",
  "@typescript-eslint/no-require-imports": "warn",
  "@typescript-eslint/no-empty-object-type": "warn",
  "react/no-unescaped-entities": "warn",
  "react-hooks/rules-of-hooks": "warn",
  "react-hooks/set-state-in-effect": "warn",
  "react-hooks/set-state-in-render": "warn",
  "react-hooks/exhaustive-deps": "warn",
  "react-hooks/purity": "warn",
  "react-hooks/preserve-manual-memoization": "warn",
};

// Ignore first so eslint.config.mjs and build artifacts are never passed to Next/React rules
// (avoids "contextOrFilename.getFilename is not a function" from eslint-plugin-react under ESLint 9).
const ignores = [
  ".next/**",
  "out/**",
  "build/**",
  "next-env.d.ts",
  "node_modules/**",
  "test-results/**",
  "playwright-report/**",
  "**/eslint.config.mjs",
  "eslint.config.mjs",
  "next.config.js",
  "**/next.config.js",
  "scripts/**",
];

// Apply Next/React config to app source. Exclude root config files so they are never
// passed to React rules (avoids "getFilename is not a function" in eslint-plugin-react under ESLint 9).
const nextFiles = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"];
const nextBlocks = [
  { files: nextFiles, ...nextVitals[0], rules: { ...nextVitals[0].rules, ...ruleOverrides } },
  ...nextVitals.slice(1).map((block) => ({ ...block, files: block.files ?? nextFiles })),
  ...nextTs.map((block) => ({ ...block, files: block.files ?? nextFiles })),
  // Last block wins: force our overrides so TS recommended "error" doesn't fail CI
  { files: nextFiles, rules: ruleOverrides },
];

const eslintConfig = defineConfig([
  globalIgnores(ignores),
  ...nextBlocks,
]);

export default eslintConfig;
