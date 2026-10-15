import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.E2E_BASE ?? '/devlearn-arena/';
// 公開した後は、公開 URL に対して動かす（docs/deployment.md 7 章）。この時は手元のサーバを立てない
//   E2E_URL=https://swallowsaba.github.io/swallow/devlearn-arena/ npx playwright test
const PUBLIC_URL = process.env.E2E_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // 手元の vite preview は、多くのブラウザから同時に読まれると、レッスンの中身の読み込みが
  // 10〜60 秒止まることがある（サーバ自身は即座に返す。Phase 12 で確かめた）。2 つまでにする
  workers: 2,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: PUBLIC_URL ?? `http://localhost:4173${BASE}`, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // build と preview の両方に VITE_BASE を渡す。
  // `VITE_BASE=x cmd1 && cmd2` と書くと cmd2 に渡らず、preview が base を
  // 知らないまま '/' で配信して全ページが空になる。
  webServer: PUBLIC_URL ? undefined : {
    command: 'npm run build && npm run preview -- --port 4173',
    env: { VITE_BASE: BASE },
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
