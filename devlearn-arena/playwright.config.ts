import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.E2E_BASE ?? '/devlearn-arena/';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:4173${BASE}`, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // サブディレクトリ配信でパスが壊れないことを E2E 自体で担保する
  webServer: {
    command: `VITE_BASE=${BASE} npm run build && npm run preview -- --port 4173`,
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
