#!/usr/bin/env node
// 確認ページを作る。今回撮影した画面と、正解の見本を並べる
import { readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
const shots = existsSync('shots')
  ? readdirSync('shots').filter((f) => f.endsWith('.png'))
      .map((f) => ({ f, t: statSync(`shots/${f}`).mtimeMs })).sort((a, b) => b.t - a.t).map((x) => x.f)
  : [];
mkdirSync('review', { recursive: true });
const cards = shots.map((f) => `<figure><img src="../shots/${f}" loading="lazy"><figcaption>${f}</figcaption></figure>`).join('\n');
const baseline = existsSync('docs/design/baseline') ? readdirSync('docs/design/baseline').filter((f) => f.endsWith('.png')) : [];
const refs = '<a href="https://claude.ai/artifact/8R55TEaqEgjKuhkTzRSxXB">見本の実物（事務所・選手・試合・ホームタウン）</a>';
const baseImgs = baseline.map((f) => `<img src="../docs/design/baseline/${f}" title="${f}">`).join('');
const html = `<!doctype html><meta charset="utf-8"><title>確認ページ</title>
<style>
body{margin:24px;background:#0e1b2e;color:#e9eef4;font:14px "Noto Sans JP",sans-serif}
h1{font-size:22px;margin:0 0 8px}p{color:#c9d4e3}
.ref{display:flex;gap:12px;margin:12px 0 24px}.ref img{width:32%;border:1px solid #2c3a4b;border-radius:8px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
figure{margin:0;background:#13284a;border-radius:10px;padding:8px}img{width:100%;border-radius:6px}
figcaption{color:#9fb0c6;margin-top:6px;font-size:12px}a{color:#f2b632}
</style>
<h1>確認ページ</h1>
<p>上が正解の見本、下が今回撮影した画面（新しい順）。見比べて、REVIEW.md に承認か指摘を書いてください。</p>
<p>${refs}</p>${baseImgs ? `<p>承認済みの基準</p><div class="ref">${baseImgs}</div>` : ''}
<div class="ref"><img src="../docs/design/images/town1.png"><img src="../docs/design/images/town2.png"><img src="../docs/design/images/town3.png"></div>
<div class="grid">${cards || '<p>撮影された画面がありません。</p>'}</div>`;
writeFileSync('review/index.html', html);
console.log('review/index.html');
