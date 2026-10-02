#!/usr/bin/env node
// 施設の SVG の一覧を 1 枚に撮る（docs/testing-strategy.md 6 章の画面の確認。素材の見た目を並べて確かめる）。
//
//   node tools/facility-sheet.mjs [名前] [拡大率] [施設の名前の正規表現]
//
// src/city/assets/facilities/*/lv*.svg の正面と裏の姿を並べ、shots/<名前>.png に保存する。
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [name = 'facility-sheet', scale = '1.6', only = '.'] = process.argv.slice(2);
const DIR = 'src/city/assets/facilities';

function view(svg, which) {
  const style = /<style>[\s\S]*?<\/style>/.exec(svg)?.[0] ?? '';
  if (which === 'front') {
    const m = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
    const g = /<g id="front">([\s\S]*?)<\/g>/.exec(svg);
    return { w: Number(m[3]), h: Number(m[4]), svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${m[1]} ${m[2]} ${m[3]} ${m[4]}">${style}${g[1]}</svg>` };
  }
  const g = /<g id="back" data-viewbox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)">([\s\S]*?)<\/g>/.exec(svg);
  return { w: Number(g[3]), h: Number(g[4]), svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${g[1]} ${g[2]} ${g[3]} ${g[4]}">${style}${g[5]}</svg>` };
}

const cells = [];
for (const type of readdirSync(DIR).sort().filter((t) => new RegExp(only).test(t))) {
  for (const file of readdirSync(join(DIR, type)).sort()) {
    const svg = readFileSync(join(DIR, type, file), 'utf8');
    const title = /<title>(.*?)<\/title>/.exec(svg)?.[1] ?? type;
    const imgs = ['front', 'back'].map((w) => {
      const v = view(svg, w);
      return `<img style="width:${v.w * Number(scale)}px;height:${v.h * Number(scale)}px" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(v.svg)}">`;
    });
    cells.push(`<figure><div class="pair">${imgs.join('')}</div><figcaption>${title}（${(svg.length / 1024).toFixed(1)}KB）</figcaption></figure>`);
  }
}

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:16px;background:#7a9a52;font:14px sans-serif;color:#0a1424}
main{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}
figure{margin:0;padding:8px;background:rgba(255,255,255,.18)}
.pair{display:flex;gap:8px;align-items:flex-end}
figcaption{margin-top:4px}
</style><main>${cells.join('')}</main>`;

mkdirSync('shots', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: `shots/${name}.png`, fullPage: true });
  console.log(`shots/${name}.png`);
} finally {
  await browser.close();
}
