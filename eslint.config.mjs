import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'prefer-const': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['app/desktop/**/*.{ts,tsx}', 'desktop/**/*.{ts,tsx}', 'apps/desktop/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/v1/*'],
              message:
                'Desktop boundary violation: do not import web (app/v1) pages/components into desktop code.',
            },
            {
              group: ['next-auth/*'],
              message:
                'Desktop boundary violation: do not import next-auth in desktop code. Use desktop cloud-session bridge.',
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
    // Generated Prisma client (do not lint)
    "app/generated/prisma/**",
  ]),
]);

export default eslintConfig;
