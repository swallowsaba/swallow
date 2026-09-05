import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.E2E_BASE ?? '/devlearn-arena/';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:4173${BASE}`, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // build と preview の両方に VITE_BASE を渡す。
  // `VITE_BASE=x cmd1 && cmd2` と書くと cmd2 に渡らず、preview が base を
  // 知らないまま '/' で配信して全ページが空になる。
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    env: { VITE_BASE: BASE },
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
