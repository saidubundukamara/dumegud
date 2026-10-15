import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Security guardrails (implementation.md §4).
  {
    rules: {
      // XSS: never render raw HTML. Sanitized markdown goes through a vetted component instead.
      "react/no-danger": "error",
      // SQL injection: only Drizzle's builder / parameterized sql`` templates.
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='sql'][property.name='raw']",
          message: "sql.raw() bypasses parameterization. Use Drizzle's query builder or sql`` templates.",
        },
      ],
    },
  },
  // Layering: only repositories (and the transaction runner) may touch the database client.
  {
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["server/db/**", "server/repositories/**", "server/services/transaction.ts", "tests/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/db/client",
              message: "Database access belongs in server/repositories. Call a repository from a service.",
            },
          ],
          patterns: [
            {
              group: ["drizzle-orm/neon-*", "@neondatabase/serverless"],
              message: "Database drivers are only used in server/db/client.ts.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
