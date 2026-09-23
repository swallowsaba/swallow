/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base は CI から VITE_BASE=/<repo>/ で注入する。
// ローカル開発と user-pages(<user>.github.io) では '/' のままで動く。
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // 3D の街（three.js）は CityScene の塊に入る。作業画面を開いて
    // WebGL が使えるときだけ読むので、初回の読み込みには載らない。
    // three だけを手で別の塊にすると、入口の塊が静的に参照してしまい先読みされる
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['framer-motion'],
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
