import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },

  js.configs.recommended,

  // 型情報を使う lint は src 配下の TypeScript だけに適用する。
  // 全体に掛けると、tsconfig に含まれない設定ファイル自身
  // (eslint.config.js など) を lint する際に
  // 「型情報が要るルールなのに parserOptions が無い」で落ちる。
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // 決定論の担保: エンジン層は実時間・乱数に触れない
  {
    files: ['src/engines/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'エンジン層では Date を使わない。SimClock を注入すること。' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'エンジン層では seeded RNG を使うこと。' },
      ],
    },
  },

  // 型情報を使わない素の TypeScript lint
  {
    files: ['e2e/**/*.ts', '*.config.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // 設定用の JavaScript
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: globals.node, sourceType: 'module' },
  },
);
