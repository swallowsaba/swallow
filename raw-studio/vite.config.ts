import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

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
  plugins: [
    react(),
    // Copy ONNX Runtime Web's wasm/mjs assets so they can be served statically
    // from GitHub Pages under <base>/ort/ (see inference.worker wasmPaths).
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/onnxruntime-web/dist/*.{wasm,mjs}',
          dest: 'ort',
        },
      ],
    }),
  ],
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
    rollupOptions: {
      output: {
        // Split heavy, independently-cached libraries into their own chunks so
        // the initial app load stays small and the WASM libs load on demand.
        manualChunks: {
          react: ['react', 'react-dom'],
          onnx: ['onnxruntime-web'],
          libraw: ['libraw-wasm'],
        },
      },
    },
  },
  optimizeDeps: {
    // These pull large WASM assets; let Vite handle them as-is.
    exclude: ['onnxruntime-web', 'libraw-wasm'],
  },
});
