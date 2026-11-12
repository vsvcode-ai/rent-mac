import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/node_modules/**',
      'prototype/**', '.claude/**',
    ],
  },
  js.configs.recommended,
  { files: ['**/*.mjs', '**/*.js'], languageOptions: { globals: { process: 'readonly' } } },
  ...tseslint.configs.recommended,
  // TypeScript 自己检查未定义变量，no-undef 会对浏览器全局（IntersectionObserver 等）误报
  { files: ['**/*.ts', '**/*.tsx'], rules: { 'no-undef': 'off' } },
);
