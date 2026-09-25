// @ts-check
import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jest from 'eslint-plugin-jest';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';

export default defineConfig([
  globalIgnores(['lib/', 'coverage/', 'benchmarks/', 'examples/', 'docs/']),
  {
    files: ['**/*.{ts,js,mjs}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['**/__tests__/**/*.ts', '**/*.spec.ts', 'tests/**/*.{ts,js}'],
    extends: [jest.configs['flat/recommended']],
    languageOptions: { globals: globals.jest },
  },
  prettier,
]);
