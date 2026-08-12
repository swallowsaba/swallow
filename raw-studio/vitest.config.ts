import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    // Model/logic tests run in Node; component tests opt into jsdom via a
    // // @vitest-environment jsdom comment at the top of the file.
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/features/**/model/**/*.ts', 'src/features/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.worker.ts',
        'src/**/components/**',
        'src/**/index.ts',
      ],
    },
  },
});
