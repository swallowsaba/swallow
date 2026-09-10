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
import { buildIndex, splitForWeb } from './gtfs-lib.mjs';

const run = promisify(execFile);

/* ------------------------------------------------------------------ *
 *  取り込む事業者
 * ------------------------------------------------------------------ *
 * dataset は ODPT のデータカタログ(CKAN)のデータセット ID。
 * ダウンロード URL はカタログから取る。事業者ごとにファイル名が違い
 * (AllLines.zip / AIILines.zip など)、決め打ちすると壊れるため。
 */
const OPERATORS = [
  {
    id: 'KeioBus',
    title: '京王バス',
    dataset: 'keio_bus_all_lines',
    license: '公共交通オープンデータ基本ライセンス',
  },
  {
    id: 'OdakyuBus',
    title: '小田急バス',
    dataset: 'odakyu_bus_aii_lines',
    license: '公共交通オープンデータ基本ライセンス',
  },
  {
    id: 'NishiTokyoBus',
    title: '西東京バス',
    dataset: 'nishi_tokyo_bus_nt_bus',
    license: '公共交通オープンデータ基本ライセンス',
  },
];

const CKAN = 'https://ckan.odpt.org/api/3/action/package_show?id=';
const OUT_ROOT = path.resolve('transit/data/gtfs');
const TMP = path.resolve('.gtfs-tmp');

const TOKEN = String(process.env.ODPT_TOKEN || '').trim();

/* ------------------------------------------------------------------ */

async function main() {
  if (!TOKEN) {
    console.error('ODPT_TOKEN が設定されていません。');
    console.error('GitHub の Settings → Secrets and variables → Actions に ODPT_TOKEN を登録してください。');
    process.exit(1);
  }

  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const targets = only.length ? OPERATORS.filter((o) => only.includes(o.id)) : OPERATORS;
  if (!targets.length) {
    console.error(`対象の事業者が見つかりません: ${only.join(', ')}`);
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
  await writeCatalog(report);

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

/* ------------------------------------------------------------------ *
 *  1 事業者ぶん
 * ------------------------------------------------------------------ */
async function buildOne(op) {
  console.log(`\n■ ${op.title}`);

  const resource = await pickResource(op);
  console.log(`  対象データ: ${resource.name}(${resource.validFrom || '有効期間の記載なし'})`);

  const outDir = path.join(OUT_ROOT, op.id);
  const prev = await readPrevious(outDir);
  if (prev && prev.source?.resourceId === resource.id) {
    console.log('  前回と同じデータのため、書き換えません。');
    return { id: op.id, title: op.title, status: 'unchanged', generatedAt: prev.generatedAt };
  }

  const zipPath = path.join(TMP, `${op.id}.zip`);
  const bytes = await download(resource.url, zipPath);
  console.log(`  ダウンロード: ${(bytes / 1024 / 1024).toFixed(1)} MB`);

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
    source: { dataset: op.dataset, resourceId: resource.id, name: resource.name, validFrom: resource.validFrom },
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
  const res = await fetch(CKAN + encodeURIComponent(op.dataset), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`データカタログを読めませんでした (HTTP ${res.status})`);
  const body = await res.json();
  if (!body.success) throw new Error('データカタログが success:false を返しました');

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
  const withToken = url.includes('acl:consumerKey=')
    ? url.replace(/acl:consumerKey=[^&]*/, `acl:consumerKey=${encodeURIComponent(TOKEN)}`)
    : `${url}${url.includes('?') ? '&' : '?'}acl:consumerKey=${encodeURIComponent(TOKEN)}`;

  const res = await fetch(withToken, { signal: AbortSignal.timeout(300000) });
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
  return buf.length;
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
async function writeCatalog(report) {
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
      license: (OPERATORS.find((o) => o.id === r.id) || {}).license || null,
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
main().catch((e) => {
  console.error(`\n異常終了: ${e.message}`);
  process.exit(1);
});

export { pickResource, OPERATORS };
