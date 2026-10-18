/**
 * `hidden` 属性がちゃんと効くかのテスト
 *   node tests/hidden.test.mjs
 *
 * 【何が起きていたか】
 * ダークモードの地図の上に、**中身の空な黒い楕円**が出たままになっていた。
 * 正体は読み込み表示(`#map-status`)。JS は `el.hidden = true` にしていたのに
 * 消えていなかった。
 *
 * 理由は CSS の優先順位。ブラウザ既定の
 *
 *     [hidden] { display: none }
 *
 * は**作者のスタイルに負ける**。`.map-status { display: flex }` と書いた時点で
 * `hidden` は無効になる。地理院タイル(淡色)＋ライトモードでは白い楕円だったので
 * 誰も気づかず、OSM ＋ダークモードで真っ黒になって初めて見えた。
 *
 * 同じ作りの要素は他にもあった。個別に直すと必ず取りこぼすので、
 * `[hidden] { display: none !important }` を 1 つ置いて全部に効かせている。
 * ここではその歯止めが外れていないことを確かめる。
 *
 * 【なぜブラウザを使わないのか】
 * これは CSS と HTML の書き方の問題なので、ファイルを読めば判る。
 * 見た目そのものはスモークテストと実機で見る。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(here, '../transit/css/style.css'), 'utf8');
const HTML = readFileSync(join(here, '../transit/index.html'), 'utf8');

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

/* ------------------------------------------------------------------ *
 *  下ごしらえ
 * ------------------------------------------------------------------ */

/** コメントを落とす(コメントの中の記述を数えないため) */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** `hidden` 属性が付いている要素のクラス名を集める */
function hiddenElementClasses(html) {
  const out = [];
  // <div class="..." id="..." hidden> のように、属性の並びは一定ではない
  for (const tag of html.match(/<[a-zA-Z][^>]*\bhidden\b[^>]*>/g) || []) {
    if (/\baria-hidden\b/.test(tag) && !/(^|\s)hidden(\s|>|=)/.test(tag.replace(/aria-hidden(="[^"]*")?/g, ''))) {
      continue; // aria-hidden だけの要素は対象外
    }
    const cls = /class="([^"]*)"/.exec(tag);
    const id = /id="([^"]*)"/.exec(tag);
    out.push({ classes: cls ? cls[1].split(/\s+/).filter(Boolean) : [], id: id ? id[1] : null, tag });
  }
  return out;
}

/** そのクラスのルールが display を指定しているか */
function setsDisplay(css, className) {
  // 「.cls {」「.cls, 」「.cls:hover {」などを拾う。別クラスの前方一致は拾わない。
  const re = new RegExp(`\\.${className.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?![\\w-])[^{]*\\{([^}]*)\\}`, 'g');
  let m;
  while ((m = re.exec(css))) {
    if (/(^|;|\s)display\s*:/.test(m[1])) return true;
  }
  return false;
}

const cleanCss = stripComments(CSS);
const hiddenEls = hiddenElementClasses(HTML);

/* ================================================================== */
console.log('\n下ごしらえ');

test('hidden 属性を使っている要素を拾えている', () => {
  assert(hiddenEls.length >= 5, `拾えた要素が少なすぎる: ${hiddenEls.length}`);
  const ids = hiddenEls.map((e) => e.id).filter(Boolean);
  assert(ids.includes('map-status'), `#map-status を拾えていない: ${ids.join(',')}`);
});

/* ================================================================== */
console.log('\nhidden を打ち消していないか');

// ここが本体。これが無いと、クラス側で display を指定した要素は消えない。
test('[hidden] を必ず効かせる指定がある', () => {
  const m = /\[hidden\]\s*\{([^}]*)\}/.exec(cleanCss);
  assert(m, '[hidden] のルールが無い');
  assert(/display\s*:\s*none/.test(m[1]), '[hidden] が display:none になっていない');
  assert(
    /!important/.test(m[1]),
    '!important が無い。クラス側の display に負けるので効かない'
  );
});

test('[hidden] の指定は、クラスの指定より前に置く(読みやすさのため)', () => {
  const hiddenAt = cleanCss.indexOf('[hidden]');
  const mapStatusAt = cleanCss.indexOf('.map-status');
  assert(hiddenAt >= 0 && mapStatusAt >= 0);
  assert(hiddenAt < mapStatusAt, '後ろに置くと、なぜ効くのかが読み取りにくい');
});

// 問題が起きていた要素を名指しで押さえる。
test('#map-status は display 指定があり、それでも hidden で消える', () => {
  assert(setsDisplay(cleanCss, 'map-status'), '前提が変わっている(display 指定が消えた)');
  const m = /\[hidden\]\s*\{([^}]*)\}/.exec(cleanCss);
  assert(m && /display\s*:\s*none\s*!important/.test(m[1]), 'hidden が効かない状態に戻っている');
});

// 同じ作りの要素を列挙しておく。増えても [hidden] が効くので壊れないが、
// 「なぜ !important が要るのか」の記録として残す。
test('クラス側で display を指定している要素が実際にある', () => {
  const withDisplay = [];
  for (const el of hiddenEls) {
    for (const c of el.classes) {
      if (setsDisplay(cleanCss, c)) withDisplay.push(`${el.id || el.classes.join('.')} (.${c})`);
    }
  }
  assert(
    withDisplay.length > 0,
    'display を指定している要素が 1 つも無い。前提が変わっているので、このテストを見直すこと'
  );
  // 記録として出す(失敗ではない)
  console.log(`      → ${withDisplay.join(' / ')}`);
});

/* ================================================================== */
console.log('\n空のまま出しっぱなしにしない');

test('読み込み表示は、文字が無ければ hidden にする', () => {
  const main = readFileSync(join(here, '../transit/js/main.js'), 'utf8');
  const fn = /function setMapStatus\([^)]*\)\s*\{([\s\S]*?)\n\}/.exec(main);
  assert(fn, 'setMapStatus が見つからない');
  assert(/\.hidden\s*=\s*!text/.test(fn[1]), '文字が無いときに hidden にしていない');
  assert(/\.textContent\s*=\s*text\s*\|\|\s*''/.test(fn[1]), '文字を空にしていない');
});

console.log(`\n${passed} 件のテストが成功${process.exitCode ? '(失敗あり)' : ''}\n`);
