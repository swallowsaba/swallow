import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Base path for GitHub Pages.
 * - Project site (https://<user>.github.io/<repo>/):  '/<repo>/'
 * - User/Org site (https://<user>.github.io/):         '/'
 *
 * In CI the workflow sets VITE_BASE to `/<repo-name>/` automatically,
 * so you normally do not need to edit this file.
 */
const base = process.env.VITE_BASE ?? '/raw-studio/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    // Enables `crossOriginIsolated` during local dev without the service worker,
    // so SharedArrayBuffer / WASM threads work in `npm run dev`.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
