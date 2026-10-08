#!/usr/bin/env node
// 画面の撮影（docs/testing-strategy.md 6 章）。
//
//   npm run shoot -- <名前> [パス] [待つミリ秒]
//
// 1920×1080 で撮り、shots/<名前>.png に保存する。開発用のサーバを自分で立てて、自分で片付ける。
// 環境変数:
//   SHOOT_SIZE=1280x720   画面の大きさを変える
//   SHOOT_FPS=1           都市を毎フレーム描き直させ、3 秒間の fps を測って表示する
//   SHOOT_EVAL='...'      撮る前にページで実行する式（カメラを動かすなど）
//   SHOOT_TWICE=2000      その間隔で 2 枚撮る（動きの確認。<名前>-2.png）
//   SHOOT_INTRO=1         初回の操作説明を閉じずに撮る（既定では閉じてから撮る）
//   SHOOT_SCRIPT=tools/scenarios/town.mjs
//                         撮る前に、画面を操作する台本を動かす（台本は shot(名前) で途中の画面も撮れる）
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const [name = 'shot', path = '#/city', waitMs = '1500'] = process.argv.slice(2);
const [width, height] = (process.env.SHOOT_SIZE ?? '1920x1080').split('x').map(Number);

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const address = server.httpServer?.address();
const port = typeof address === 'object' && address ? address.port : 5173;
const url = `http://localhost:${String(port)}/${path.startsWith('#') ? path : path.replace(/^\//, '')}`;

const browser = await chromium.launch();
try {
  mkdirSync('shots', { recursive: true });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.cityReady === '1' || !document.querySelector('[data-testid="city-screen"]'), null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  // 初めて開いた時の操作説明は、それを撮る時のほかは閉じる（閉じたことは保存され、次からは出ない）
  if (!process.env.SHOOT_INTRO) await page.evaluate(() => document.querySelector('[data-testid="intro"] .intro-skip')?.click());
  if (process.env.SHOOT_EVAL) await page.evaluate(process.env.SHOOT_EVAL);
  if (process.env.SHOOT_SCRIPT) {
    const script = await import(pathToFileURL(process.env.SHOOT_SCRIPT).href);
    await script.default(page, async (shotName) => {
      await page.screenshot({ path: `shots/${shotName}.png` });
      console.log(`shots/${shotName}.png`);
    });
  }
  await sleep(Number(waitMs));
  if (process.env.SHOOT_FPS) {
    const fps = await page.evaluate(async () => {
      const city = window.__city;
      city.setContinuous(true);
      const start = city.stats.frames;
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 3000));
      const frames = city.stats.frames - start;
      city.setContinuous(false);
      return { fps: (frames * 1000) / (performance.now() - t0), objects: city.stats.drawnObjects };
    });
    console.log(`fps: ${fps.fps.toFixed(1)}（描いた物 ${String(fps.objects)}）`);
  }
  const file = `shots/${name}.png`;
  await page.screenshot({ path: file });
  console.log(file);
  if (process.env.SHOOT_TWICE) {
    await sleep(Number(process.env.SHOOT_TWICE));
    await page.screenshot({ path: `shots/${name}-2.png` });
    console.log(`shots/${name}-2.png`);
  }
  if (errors.length > 0) {
    console.error('ページの誤り:\n' + errors.join('\n'));
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await server.close();
}
