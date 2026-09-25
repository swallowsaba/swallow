#!/usr/bin/env node
// 撮影用。ブラウザを同時に1つしか立ち上げない（WebGL のソフトウェア描画はメモリを大量に使うため）
// 使い方: node tools/shoot.mjs <名前> [URLのパス] [待つミリ秒]
import { chromium } from 'playwright';
import { mkdirSync, openSync, closeSync, unlinkSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const LOCK = '.shoot.lock';
const [name = 'shot', path = '/', waitMs = '4000'] = process.argv.slice(2);
const BASE = process.env.SHOOT_BASE ?? 'http://localhost:4173/devlearn-arena';

async function acquire() {
  for (let i = 0; i < 600; i += 1) {
    try { closeSync(openSync(LOCK, 'wx')); return; } catch { await sleep(500); }
  }
  throw new Error('撮影の順番待ちが 5 分を超えた');
}

await acquire();
try {
  mkdirSync('shots', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await sleep(Number(waitMs));
  const file = `shots/${name}.png`;
  await page.screenshot({ path: file });
  await browser.close();
  console.log(file);
  if (errors.length > 0) console.log('ページのエラー:\n' + errors.join('\n'));
} finally {
  if (existsSync(LOCK)) unlinkSync(LOCK);
}
