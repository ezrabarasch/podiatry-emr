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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone deploy scripts (CommonJS, run under Node/PM2, not the Next app).
    "scripts/**",
  ]),
  // The bare Prisma singleton bypasses tenant/practice scoping entirely — every
  // route must get its client from getSessionUser()/requireRole() instead
  // (lib/scopedPrisma.ts). Allowlist: the factory (needs the base client to
  // extend) and lib/auth.ts (its pre-session login/audit queries run before any
  // tenant context exists, so they can't go through the scoped client).
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    ignores: ["lib/prisma.ts", "lib/scopedPrisma.ts", "lib/auth.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@/lib/prisma",
          message: "Use the scoped client from getSessionUser()/requireRole() (lib/auth.ts) instead of the bare Prisma singleton — direct access skips tenant/practice scoping.",
        }],
      }],
    },
  },
]);

export default eslintConfig;
