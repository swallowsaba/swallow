import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // 決定論の担保: エンジン層は実時間・乱数に触れない
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
  {
    files: ['scripts/**/*.mjs', 'e2e/**/*.ts', '*.config.ts'],
    languageOptions: { globals: globals.node },
    ...tseslint.configs.disableTypeChecked,
  },
);
