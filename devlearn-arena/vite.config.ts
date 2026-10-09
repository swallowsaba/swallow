/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { bootMarkup } from './src/ui/boot';

/** 読み込み中の演出を、本体より先に出るよう index.html に書き込む（src/ui/boot.ts） */
const bootScreen = (): Plugin => ({
  name: 'boot-screen',
  transformIndexHtml: (html) => html.replace('<div id="root"></div>', `${bootMarkup()}<div id="root"></div>`),
});

// base は CI から VITE_BASE=/<repo>/ で注入する。
// ローカル開発と user-pages(<user>.github.io) では '/' のままで動く。
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), bootScreen()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          // 端末はページを開いてから読めばよい。初回に載せない
          'vendor-term': ['@xterm/xterm', '@xterm/addon-fit'],
          'vendor-yaml': ['js-yaml'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/content/**', 'src/engines/**'],
      exclude: ['src/lib/storage/idb.ts'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
