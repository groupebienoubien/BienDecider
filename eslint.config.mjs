import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // claude-sonnet-5-5 rejects a forced tool (HTTP 400); the CI has no API key to catch it.
      "no-restricted-syntax": ["error", {
        selector: "Property[key.name='tool_choice'] > ObjectExpression > Property[key.name='type'][value.value=/^(tool|any)$/]",
        message: "Le modèle refuse tool_choice « tool » ou « any » (400) : demandez l'outil dans la consigne système.",
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Maquette statique, hors application.
    "maquette_v2/**",
    "maquette_v3/**",
    "maquette_v4/**",
    "maquette_v5/**",
    "maquette_v5.2/**",
  ]),
]);

export default eslintConfig;
