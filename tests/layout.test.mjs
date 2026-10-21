/**
 * 画面の組み立てのテスト
 *   node tests/layout.test.mjs
 *
 * index.html を組み替えたときに壊れやすいところを押さえる。
 *
 * 【実際に壊した例】
 * 経由地のブロックを左の棚へ移したとき、閉じタグの拾い方を間違えて
 * 説明文と `#via-list` が検索フォームの中に取り残された。画面には出るので
 * JS のエラーにはならず、見た目でしか気づけなかった。
 *
 * ブラウザは使わない(利用者の PC に npm を入れない方針のため)。
 * HTML を文字列として読んで、構造の約束だけを確かめる。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'transit');
const html = readFileSync(join(root, 'index.html'), 'utf8');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}\n       ${e.message}`);
    process.exitCode = 1;
  }
}

/** JS が参照している id を全部集める */
function referencedIds() {
  const ids = new Set();
  for (const f of ['main.js', 'ui.js', 'map.js', 'via.js', 'category.js']) {
    const s = readFileSync(join(root, 'js', f), 'utf8');
    for (const re of [
      /\$\(['"]#([\w-]+)['"]\)/g,
      /getElementById\(['"]([\w-]+)['"]\)/g,
      /querySelector\(['"]#([\w-]+)['"]\)/g,
    ]) {
      for (const m of s.matchAll(re)) ids.add(m[1]);
    }
  }
  return [...ids];
}

/** 開始タグから対応する閉じタグまでを切り出す(入れ子を数える) */
function section(openTagPattern, tag = 'section') {
  const start = html.search(openTagPattern);
  assert.ok(start >= 0, `見つからない: ${openTagPattern}`);
  let i = html.indexOf('>', start) + 1;
  let depth = 1;
  const open = new RegExp(`<${tag}[\\s>]`, 'g');
  const close = new RegExp(`</${tag}>`, 'g');
  while (depth > 0 && i < html.length) {
    open.lastIndex = i;
    close.lastIndex = i;
    const o = open.exec(html);
    const c = close.exec(html);
    if (!c) break;
    if (o && o.index < c.index) {
      depth += 1;
      i = o.index + 1;
    } else {
      depth -= 1;
      i = c.index + c[0].length;
    }
  }
  return html.slice(start, i);
}

/* ------------------------------------------------------------------ *
 *  JS が触る id
 * ------------------------------------------------------------------ */

test('JS が参照する id がすべて HTML にある', () => {
  const missing = referencedIds().filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, [], `足りない id: ${missing.join(', ')}`);
});

test('id が重複していない', () => {
  const counts = new Map();
  for (const m of html.matchAll(/id="([\w-]+)"/g)) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  const dup = [...counts].filter(([, n]) => n > 1).map(([k]) => k);
  assert.deepEqual(dup, [], `重複: ${dup.join(', ')}`);
});

/* ------------------------------------------------------------------ *
 *  中央と左の棚の振り分け
 * ------------------------------------------------------------------ */

const side = section(/<aside class="side"/, 'aside');
const col = html.slice(html.indexOf('<div class="col">'), html.indexOf('</main>'));

test('経路を出すのに要るものは中央にある', () => {
  for (const id of ['search-form', 'map-card', 'results']) {
    assert.ok(col.includes(`id="${id}"`), `${id} が中央に無い`);
  }
});

test('それ以外は左の棚にある', () => {
  for (const id of ['status-card', 'excludes-card', 'blk-vias', 'blk-checks', 'blk-data', 'blk-coverage']) {
    assert.ok(side.includes(`id="${id}"`), `${id} が左の棚に無い`);
  }
});

test('経由地の中身は経由地のブロックの中にある', () => {
  // 以前、閉じタグの拾い間違いで説明文と via-list が検索フォームに残った
  const vias = section(/<section class="blk" id="blk-vias"/);
  assert.ok(vias.includes('id="via-list"'), 'via-list が経由地ブロックの外にある');
  assert.ok(vias.includes('id="via-add"'), 'via-add が経由地ブロックの外にある');
  assert.ok(vias.includes('vias__note'), '説明文が経由地ブロックの外にある');
  const form = section(/<form class="blk blk--key is-open" id="search-form"/, 'form');
  assert.ok(!form.includes('vias__note'), '経由地の説明文が検索フォームに残っている');
  assert.ok(!form.includes('id="via-list"'), 'via-list が検索フォームに残っている');
});

/* ------------------------------------------------------------------ *
 *  畳めるブロック
 * ------------------------------------------------------------------ */

test('どのブロックにも開閉ボタンと本体がある', () => {
  const blocks = html.match(/<(section|form)[^>]*class="blk[^"]*"[^>]*>/g) || [];
  assert.ok(blocks.length >= 8, `ブロックが少なすぎる(${blocks.length})`);
  for (const m of html.matchAll(/<(section|form)[^>]*class="blk[^"]*"[^>]*id="([\w-]+)"/g)) {
    const tag = m[1];
    const part = section(new RegExp(`<${tag}[^>]*id="${m[2]}"`), tag);
    assert.ok(part.includes('class="blk__b"'), `${m[2]} に開閉ボタンが無い`);
    assert.ok(part.includes('class="blk__body"'), `${m[2]} に本体が無い`);
  }
});

test('見出しの要約を入れる場所がある', () => {
  for (const id of ['status-card-note', 'excludes-card-note', 'blk-vias-note', 'blk-checks-note',
    'blk-data-note', 'blk-coverage-note', 'search-form-note']) {
    assert.ok(html.includes(`id="${id}"`), `${id} が無い`);
  }
});

/* ------------------------------------------------------------------ *
 *  時刻の指定の仕方
 * ------------------------------------------------------------------ */

test('出発・到着・始発・終電の 4 つが選べる', () => {
  const modes = [...html.matchAll(/data-mode="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(modes, ['depart', 'arrive', 'first', 'last']);
});

test('始発・終電で隠す欄に id が付いている', () => {
  for (const id of ['when-time', 'when-now', 'when-label', 'when-note']) {
    assert.ok(html.includes(`id="${id}"`), `${id} が無い`);
  }
});

test('時刻の欄は 1 つだけ(出発用と到着用に分けていない)', () => {
  const inputs = (html.match(/type="datetime-local"/g) || []).length;
  assert.equal(inputs, 1);
});

/* ------------------------------------------------------------------ *
 *  変えてはいけない約束
 * ------------------------------------------------------------------ */

test('運賃・料金を表示する欄を作っていない', () => {
  const body = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  assert.ok(!/運賃|料金|円/.test(body), '本文に運賃まわりの文言がある');
});

test('API キーを HTML に埋めていない', () => {
  assert.ok(!/odpt[_-]?token|acl:consumerKey|apikey/i.test(html));
});

console.log(`\n${passed} 件のテストが成功`);
