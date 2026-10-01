import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/** 模型の層と描画が import してはいけない画面の包み */
const UI_PACKAGES = [
  'react', 'react/*', 'react-dom', 'react-dom/*', 'react-router-dom', 'three', 'three/*',
  '@react-three/*', '@xterm/*', 'framer-motion', 'zustand', 'zustand/*',
];

/** 模型の層が触れてはいけない画面の物 */
const DOM_GLOBALS = [
  'window', 'document', 'HTMLCanvasElement', 'CanvasRenderingContext2D', 'OffscreenCanvas',
  'requestAnimationFrame', 'Image', 'localStorage', 'indexedDB',
];

export default tseslint.config(
  { ignores: ['docs/archive/**', '.work/**', 'dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },

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

  // 層の境界（docs/architecture.md 3 章）。
  // 模型の層（都市・ゲーム・学習・模擬環境）は React・DOM・Canvas に触れず、実時間と乱数を使わない。
  // 描画（src/city/render）は Canvas に描くので、この規則から外し、下で画面の包みだけを禁じる
  {
    files: ['src/engines/**/*.{ts,tsx}', 'src/game/**/*.{ts,tsx}', 'src/learning/**/*.{ts,tsx}', 'src/city/**/*.{ts,tsx}'],
    ignores: ['src/city/render/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: UI_PACKAGES, message: '模型の層は画面の包みを import しない（docs/architecture.md 3 章）。' }] }],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: '模型の層では Date を使わない。時刻は引数で渡すこと。' },
        ...DOM_GLOBALS.map((name) => ({ name, message: '模型の層は DOM・Canvas に触れない（docs/architecture.md 3 章）。' })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: '模型の層では seed から作る乱数を使うこと。' },
      ],
    },
  },
  {
    files: ['src/city/render/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: UI_PACKAGES, message: '描画は模型を読んで Canvas に描くだけ。画面の包みを import しない。' }] }],
    },
  },

  // 型情報を使わない素の TypeScript lint
  {
    files: ['e2e/**/*.ts', 'scripts/**/*.mts', '*.config.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // 設定用の JavaScript
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: globals.node, sourceType: 'module' },
  },

  // 撮影道具。node で動くが、ブラウザへ注入する関数も書くので両方の globals を許す
  {
    files: ['tools/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser }, sourceType: 'module' },
  },
);
