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

const eslintConfig = defineConfig([
  { ...nextVitals[0], rules: { ...nextVitals[0].rules, ...ruleOverrides } },
  ...nextVitals.slice(1),
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
