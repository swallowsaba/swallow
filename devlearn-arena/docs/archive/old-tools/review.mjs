#!/usr/bin/env node
// 確認ページを作る。今回撮影した画面と、正解の見本を並べる
// 使い方: node tools/review.mjs [章の要約の .md]（例: docs/review/0.md）。要約はページの上に載る
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
const shots = existsSync('shots')
  ? readdirSync('shots').filter((f) => f.endsWith('.png'))
      .map((f) => ({ f, t: statSync(`shots/${f}`).mtimeMs })).sort((a, b) => b.t - a.t).map((x) => x.f)
  : [];
mkdirSync('review', { recursive: true });
// 要約は見出し（# ）・箇条（- ）・段落だけを読む。`…` はコードとして出す
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>');
const summaryFile = process.argv[2];
const summaryLines = summaryFile && existsSync(summaryFile)
  ? readFileSync(summaryFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  : [];
const summary = summaryLines.map((l) =>
  l.startsWith('# ') ? `<h2>${inline(l.slice(2))}</h2>` : l.startsWith('- ') ? `<li>${inline(l.slice(2))}</li>` : `<p>${inline(l)}</p>`,
).join('\n').replace(/(<li>[\s\S]*<\/li>)/, '<ul class="sum">$1</ul>');
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
h2{font-size:18px;margin:16px 0 8px}.sum{background:#13284a;border-radius:10px;padding:12px 16px 12px 32px;line-height:1.8}
code{font-family:"JetBrains Mono",monospace;color:#f2b632}
</style>
<h1>確認ページ</h1>
<p>上が正解の見本、下が今回撮影した画面（新しい順）。見比べて、REVIEW.md に承認か指摘を書いてください。</p>
${summary}
<p>${refs}</p>${baseImgs ? `<p>承認済みの基準</p><div class="ref">${baseImgs}</div>` : ''}
<div class="ref"><img src="../docs/design/images/town1.png"><img src="../docs/design/images/town2.png"><img src="../docs/design/images/town3.png"></div>
<div class="grid">${cards || '<p>撮影された画面がありません。</p>'}</div>`;
writeFileSync('review/index.html', html);
console.log('review/index.html');
