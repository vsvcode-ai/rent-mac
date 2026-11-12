import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/node_modules/**',
      'prototype/**',
    ],
  },
  js.configs.recommended,
  { files: ['**/*.mjs', '**/*.js'], languageOptions: { globals: { process: 'readonly' } } },
  ...tseslint.configs.recommended,
);
