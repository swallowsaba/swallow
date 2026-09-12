#!/usr/bin/env node
/**
 * GTFS を取り込んで検索用の索引を作る  (GitHub Actions から実行する)
 * ==================================================================
 *   ODPT_TOKEN=xxxxx node tools/build-gtfs-index.mjs
 *
 * 【これは何のためにあるか】
 * ODPT は京王バス・小田急バス・西東京バスの API 形式データの提供をやめ、
 * GTFS(ZIP)だけになった。GTFS は検索のたびに取りに行くには大きすぎるので、
 * ここで検索用の小さな索引に変換して transit/data/gtfs/ に置く。
 *
 * 【動かない条件を隠さない】
 * ・ODPT_TOKEN が無ければ何もせず異常終了する(空の索引を作らない)
 * ・ダウンロードや展開に失敗した事業者はスキップし、最後に必ず報告する
 * ・元データが前回と同じなら書き換えない(Git の履歴を無駄に太らせない)
 */

import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, splitForWeb } from './gtfs-lib.mjs';

const run = promisify(execFile);

/* ------------------------------------------------------------------ *
 *  取り込む事業者
 * ------------------------------------------------------------------ *
 * 事業者はこのファイルに書かず、tools/gtfs-sources.json で指定する。
 * 追加のたびにスクリプトを触らずに済むようにするため。
 *
 *   kind: 'odpt' … ODPT のデータカタログ(CKAN)から URL を引き直す。トークンが要る。
 *   kind: 'url'  … GTFS(ZIP)の URL を直接指定する。どこのデータでもよい。
 */
const SOURCES_FILE = path.resolve('tools/gtfs-sources.json');

async function loadSources() {
  if (!existsSync(SOURCES_FILE)) {
    throw new Error(`取り込み元の設定が見つかりません: ${SOURCES_FILE}`);
  }
  let body;
  try {
    body = JSON.parse(await readFile(SOURCES_FILE, 'utf8'));
  } catch (e) {
    throw new Error(`${SOURCES_FILE} を読めません(JSON が壊れています): ${e.message}`);
  }
  const list = Array.isArray(body.sources) ? body.sources : [];
  if (!list.length) throw new Error(`${SOURCES_FILE} に sources がありません`);

  // 設定の誤りは取り込み前に全部指摘する。1 つずつ直させない。
  const problems = [];
  const seen = new Set();
  for (const [i, src] of list.entries()) {
    const where = `sources[${i}]${src.id ? ` (${src.id})` : ''}`;
    if (!src.id) problems.push(`${where}: id がありません`);
    else if (!/^[A-Za-z0-9_-]+$/.test(src.id)) problems.push(`${where}: id に使えるのは英数字と _ - だけです`);
    else if (seen.has(src.id)) problems.push(`${where}: id が重複しています`);
    seen.add(src.id);

    if (!src.title) problems.push(`${where}: title(表示名)がありません`);
    if (!src.license) problems.push(`${where}: license がありません。再配布できるライセンスか確認してください`);

    if (src.kind === 'odpt') {
      if (!src.dataset) problems.push(`${where}: kind が odpt なら dataset(データセット ID)が要ります`);
    } else if (src.kind === 'url') {
      if (!src.url) problems.push(`${where}: kind が url なら url が要ります`);
      else if (!/^https?:\/\//.test(src.url)) problems.push(`${where}: url は http(s) で始めてください`);
    } else {
      problems.push(`${where}: kind は 'odpt' か 'url' です(今は ${JSON.stringify(src.kind)})`);
    }
  }
  if (problems.length) {
    throw new Error(`取り込み元の設定に誤りがあります:\n  - ${problems.join('\n  - ')}`);
  }
  return list;
}

const CKAN = 'https://ckan.odpt.org/api/3/action/package_show?id=';
const OUT_ROOT = path.resolve('transit/data/gtfs');
const TMP = path.resolve('.gtfs-tmp');

const TOKEN = String(process.env.ODPT_TOKEN || '').trim();

// Node の既定の User-Agent だと、配布側の Bot 対策に HTML の案内ページを
// 返されることがある(HTTP は 200 のまま)。ブラウザと同じ名乗りにしておく。
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/127.0.0.0 Safari/537.36';

// 返ってきたものが JSON でなかったとき、「何が返ったか」を残す。
// 黙って「JSON ではありません」とだけ言われても原因が分からないため。
function describeBody(res, text) {
  const type = res.headers.get('content-type') || '(不明)';
  const head = text.replace(/\s+/g, ' ').trim().slice(0, 200);
  return `HTTP ${res.status} / Content-Type: ${type} / 本文の先頭: ${head}`;
}

/* ------------------------------------------------------------------ */

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const only = args.filter((a) => !a.startsWith('-'));

  const sources = await loadSources();

  if (listOnly) {
    await printList(sources);
    return;
  }

  if (!TOKEN && sources.some((s) => s.kind === 'odpt')) {
    console.error('ODPT_TOKEN が設定されていません。');
    console.error('GitHub の Settings → Secrets and variables → Actions に ODPT_TOKEN を登録してください。');
    console.error('(ODPT 以外の取り込み元だけにする場合は、tools/gtfs-sources.json から kind:"odpt" を外してください)');
    process.exit(1);
  }

  const targets = only.length ? sources.filter((o) => only.includes(o.id)) : sources;
  if (!targets.length) {
    console.error(`対象の事業者が見つかりません: ${only.join(', ')}`);
    console.error(`設定されているのは: ${sources.map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });

  const report = [];
  for (const op of targets) {
    try {
      report.push(await buildOne(op));
    } catch (e) {
      console.error(`  ✗ ${op.title}: ${e.message}`);
      report.push({ id: op.id, title: op.title, status: 'failed', message: e.message });
    }
  }

  await rm(TMP, { recursive: true, force: true });
  await writeCatalog(report, sources);

  console.log('\n────────── まとめ ──────────');
  for (const r of report) {
    const mark = r.status === 'updated' ? '更新' : r.status === 'unchanged' ? '変更なし' : '失敗';
    console.log(`  ${mark}  ${r.title}${r.message ? ` — ${r.message}` : ''}`);
  }

  const failed = report.filter((r) => r.status === 'failed');
  if (failed.length === report.length) {
    console.error('\nすべての事業者で失敗しました。');
    process.exit(1);
  }
  if (failed.length) {
    console.error(`\n${failed.length} 事業者で失敗しました(他は更新済み)。`);
    process.exit(2); // 一部失敗。ワークフロー側で「警告つき成功」にする
  }
}

/** 設定されている取り込み元と、今の状態を並べて出す */
async function printList(sources) {
  console.log(`取り込み元の設定: ${SOURCES_FILE}\n`);
  for (const src of sources) {
    const prev = await readPrevious(path.join(OUT_ROOT, src.id));
    const state = prev
      ? `取り込み済み(${(prev.generatedAt || '').slice(0, 10)} / 停留所 ${prev.stopCount} / 系統 ${prev.patternCount})`
      : '未取り込み';
    console.log(`  ${src.id}`);
    console.log(`    名前      : ${src.title}`);
    console.log(`    取得方法  : ${src.kind === 'odpt' ? `ODPT カタログ(${src.dataset})` : src.url}`);
    console.log(`    ライセンス: ${src.license}`);
    console.log(`    状態      : ${state}`);
    console.log('');
  }
  console.log(`合計 ${sources.length} 事業者`);
  console.log('\n事業者を足すには tools/gtfs-sources.json を編集してください。');
  console.log('※ 追加する前に、そのデータのライセンスが再配布を許しているか必ず確認すること。');
}

/* ------------------------------------------------------------------ *
 *  1 事業者ぶん
 * ------------------------------------------------------------------ */
async function buildOne(op) {
  console.log(`\n■ ${op.title}`);

  const resource = await pickResource(op);
  console.log(`  対象データ: ${resource.name}(${resource.validFrom || '有効期間の記載なし'})`);

  const outDir = path.join(OUT_ROOT, op.id);
  const prev = await readPrevious(outDir);

  // ODPT はリソース ID が変わればダイヤ改正。落とす前に判定できる。
  if (resource.compareBy !== 'content' && prev && prev.source?.resourceId === resource.id) {
    console.log('  前回と同じデータのため、書き換えません。');
    return { id: op.id, title: op.title, status: 'unchanged', generatedAt: prev.generatedAt };
  }

  const zipPath = path.join(TMP, `${op.id}.zip`);
  const { bytes, sha256 } = await download(resource.url, zipPath);
  console.log(`  ダウンロード: ${(bytes / 1024 / 1024).toFixed(1)} MB`);

  // URL 直指定は中身のハッシュで比べる(URL が変わらないまま改正されるため)
  if (resource.compareBy === 'content' && prev && prev.source?.sha256 === sha256) {
    console.log('  前回と中身が同じため、書き換えません。');
    return { id: op.id, title: op.title, status: 'unchanged', generatedAt: prev.generatedAt };
  }

  const extractDir = path.join(TMP, op.id);
  await mkdir(extractDir, { recursive: true });
  await unzip(zipPath, extractDir);

  const files = await readGtfsFiles(extractDir);
  console.log(`  展開: ${Object.keys(files).join(', ')}`);

  const generatedAt = new Date().toISOString();
  const { index, patterns, warnings } = buildIndex(files, {
    operator: op.id,
    title: op.title,
    license: op.license,
    generatedAt,
    source: {
      kind: op.kind,
      dataset: op.dataset || null,
      url: op.kind === 'url' ? op.url : null,
      resourceId: resource.id,
      name: resource.name,
      validFrom: resource.validFrom,
      sha256,
    },
    attribution: op.attribution || null,
  });
  for (const w of warnings) console.warn(`  ! ${w}`);

  const web = splitForWeb(index, patterns);
  await rm(outDir, { recursive: true, force: true });
  for (const [rel, body] of Object.entries(web)) {
    const dest = path.join(outDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body);
  }

  const total = Object.values(web).reduce((n, b) => n + Buffer.byteLength(b), 0);
  console.log(
    `  索引: 停留所 ${index.stopCount} / 系統 ${index.patternCount} / ` +
      `${Object.keys(web).length} ファイル ${(total / 1024 / 1024).toFixed(1)} MB`
  );

  return {
    id: op.id,
    title: op.title,
    status: 'updated',
    generatedAt,
    stopCount: index.stopCount,
    patternCount: index.patternCount,
    validFrom: resource.validFrom,
  };
}

/* ------------------------------------------------------------------ *
 *  カタログからダウンロード URL を決める
 * ------------------------------------------------------------------ */
async function pickResource(op) {
  // 直接 URL が指定されているときは、カタログを引かずにそれを使う
  if (op.kind === 'url') {
    return {
      id: `url:${op.url}`,
      name: op.title,
      url: op.url,
      validFrom: null,
      // URL 指定は「同じ URL でも中身が変わる」ので、毎回取り直して中身で比べる
      compareBy: 'content',
    };
  }
  const res = await fetch(CKAN + encodeURIComponent(op.dataset), {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': UA,
      'Accept-Language': 'ja,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`データカタログを読めませんでした: ${describeBody(res, text)}`);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    // HTML が返ったということは、API ではなく案内ページ・ログイン画面・
    // Bot 対策のページに行き着いている。中身を出さないと切り分けられない。
    throw new Error(`データカタログが JSON を返しませんでした: ${describeBody(res, text)}`);
  }
  if (!body.success) {
    const why = body.error?.message || body.error?.__type || JSON.stringify(body.error || {});
    throw new Error(`データカタログが success:false を返しました (${why})`);
  }

  const today = ymd(new Date());
  const items = (body.result.resources || [])
    .filter((r) => /zip/i.test(r.format || '') || /\.zip(\?|$)/i.test(r.url || ''))
    .map((r) => ({
      id: r.id,
      name: r.name || r.id,
      url: r.url,
      // URL の date= か、名前の末尾の 8 桁を「いつからのダイヤか」とみなす
      validFrom: (/date=(\d{8})/.exec(r.url || '') || /(\d{8})\s*$/.exec(r.name || '') || [])[1] || null,
    }))
    .filter((r) => r.url);

  if (!items.length) throw new Error('GTFS(ZIP)のリソースが見つかりません');

  // 今日から見て「すでに始まっているダイヤ」のうち、いちばん新しいもの
  const started = items.filter((r) => r.validFrom && r.validFrom <= today);
  const pool = started.length ? started : items;
  pool.sort((a, b) => String(b.validFrom || '').localeCompare(String(a.validFrom || '')));
  return pool[0];
}

/* ------------------------------------------------------------------ *
 *  ダウンロードと展開
 * ------------------------------------------------------------------ */
async function download(url, dest) {
  // カタログの URL にはトークンの差し込み位置が [アクセストークン] のように
  // 書かれていることがある。ここで実物に置き換える。
  // ODPT 以外の配布元にトークンを送ってはいけない。
  // 元の URL にトークンの差し込み位置がある場合だけ差し替える。
  const withToken =
    url.includes('acl:consumerKey=') && TOKEN
      ? url.replace(/acl:consumerKey=[^&]*/, `acl:consumerKey=${encodeURIComponent(TOKEN)}`)
      : url;

  const res = await fetch(withToken, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(300000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('ODPT_TOKEN が拒否されました。トークンを確認してください。');
  }
  if (!res.ok) throw new Error(`ダウンロードに失敗しました (HTTP ${res.status})`);

  const buf = Buffer.from(await res.arrayBuffer());
  // ZIP は "PK" で始まる。エラーが JSON で返ってきた場合をここで弾く。
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    const head = buf.subarray(0, 200).toString('utf8');
    throw new Error(`ZIP ではないものが返りました: ${head.replace(/\s+/g, ' ').slice(0, 150)}`);
  }
  await writeFile(dest, buf);
  return { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
}

async function unzip(zipPath, destDir) {
  try {
    await run('unzip', ['-o', '-q', zipPath, '-d', destDir], { maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    throw new Error(`ZIP を展開できませんでした: ${e.message}`);
  }
}

/** GTFS の中で使うファイルだけを読む(全部読むとメモリが要る) */
async function readGtfsFiles(dir) {
  const want = new Set([
    'stops.txt',
    'routes.txt',
    'trips.txt',
    'stop_times.txt',
    'calendar.txt',
    'calendar_dates.txt',
    'feed_info.txt',
  ]);
  const found = {};
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !want.has(entry.name)) continue;
    const full = path.join(entry.parentPath || entry.path || dir, entry.name);
    found[entry.name] = await readFile(full, 'utf8');
  }
  return found;
}

/* ------------------------------------------------------------------ *
 *  前回の結果 / 目録
 * ------------------------------------------------------------------ */
async function readPrevious(outDir) {
  const file = path.join(outDir, 'index.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/** 画面側が「どの事業者の索引があるか」を知るための目録 */
async function writeCatalog(report, sources = []) {
  await mkdir(OUT_ROOT, { recursive: true });
  const catalogPath = path.join(OUT_ROOT, 'catalog.json');

  let prev = {};
  if (existsSync(catalogPath)) {
    try {
      prev = JSON.parse(await readFile(catalogPath, 'utf8'));
    } catch {
      prev = {};
    }
  }
  const byId = new Map((prev.operators || []).map((o) => [o.id, o]));

  for (const r of report) {
    if (r.status === 'failed') continue;
    const before = byId.get(r.id) || {};
    byId.set(r.id, {
      id: r.id,
      title: r.title,
      dir: r.id,
      generatedAt: r.generatedAt || before.generatedAt || null,
      stopCount: r.stopCount ?? before.stopCount ?? null,
      patternCount: r.patternCount ?? before.patternCount ?? null,
      validFrom: r.validFrom ?? before.validFrom ?? null,
      license: (sources.find((o) => o.id === r.id) || {}).license || before.license || null,
      attribution: (sources.find((o) => o.id === r.id) || {}).attribution || before.attribution || null,
    });
  }

  await writeFile(
    catalogPath,
    JSON.stringify(
      {
        v: 1,
        updatedAt: new Date().toISOString(),
        note: 'ODPT が API 形式の提供を終了した事業者を GTFS から取り込んだもの。ダイヤ改正時のスナップショット。',
        operators: [...byId.values()],
        failed: report.filter((r) => r.status === 'failed').map((r) => ({ id: r.id, title: r.title, message: r.message })),
      },
      null,
      2
    )
  );
}

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/* ------------------------------------------------------------------ */
// 直接実行されたときだけ動かす。テストから import しても走り出さないように。
const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  main().catch((e) => {
    console.error(`\n異常終了: ${e.message}`);
    process.exit(1);
  });
}

export { pickResource, loadSources };
