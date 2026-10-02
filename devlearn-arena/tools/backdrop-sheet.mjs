#!/usr/bin/env node
// 施設の中の景色（レッスン画面の背景）の一覧を 1 枚に撮る（docs/testing-strategy.md 6 章。素材の見た目を並べて確かめる）。
//
//   node tools/backdrop-sheet.mjs [名前]
//
// src/screens/lesson/backdrops/*.svg を並べ、shots/<名前>.png に保存する。
// SVG ごとの class の名前がぶつからないよう、1 枚ずつ画像として置く。
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';

const [name = 'backdrop-sheet'] = process.argv.slice(2);
const DIR = 'src/screens/lesson/backdrops';

const cells = readdirSync(DIR).filter((f) => f.endsWith('.svg')).sort().map((f) => {
  const svg = readFileSync(`${DIR}/${f}`, 'utf8');
  const title = /<title>(.*?)<\/title>/.exec(svg)?.[1] ?? f;
  const kb = Math.round(svg.length / 102.4) / 10;
  return `<figure><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"><figcaption>${title}（${f}・${kb}KB）</figcaption></figure>`;
}).join('');

const html = `<!doctype html><html><head><style>
body{margin:0;padding:8px;background:#0a1424;color:#eef2f6;font:13px sans-serif;display:grid;grid-template-columns:repeat(4,470px);gap:8px}
figure{margin:0}img{width:470px;height:300px;object-fit:contain;display:block}
</style></head><body>${cells}</body></html>`;

mkdirSync('shots', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1300 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: `shots/${name}.png`, fullPage: true });
  console.log(`shots/${name}.png`);
} finally {
  await browser.close();
}
