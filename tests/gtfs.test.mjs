/**
 * GTFS の取り込みと検索のテスト
 *   node tests/gtfs.test.mjs
 *
 * 合成した小さな GTFS を使う。ネットワークもトークンも要らない。
 */

import assert from 'node:assert/strict';
import { parseCsv, readTable, gtfsTimeToMinutes, gtfsDate, buildIndex, splitForWeb, normalizeStopName } from '../tools/gtfs-lib.mjs';
import {
  runsOn,
  findStops,
  findGtfsBusRoutes,
  findAllGtfsRoutes,
  stopsInBounds,
  resetGtfsCache,
  STOP_MIN_ZOOM,
} from '../transit/js/gtfs.js';

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
 *  合成 GTFS
 * ------------------------------------------------------------------ *
 *   系統 K01: 調布駅北口 → 三鷹台駅 → 吉祥寺駅  (平日のみ)
 *   系統 K02: 調布駅北口 → 吉祥寺駅            (土日のみ)
 */
const FEED = {
  'stops.txt':
    'stop_id,stop_name,stop_lat,stop_lon,location_type\n' +
    'S1,調布駅北口,35.6520,139.5410,0\n' +
    'S2,三鷹台駅,35.6900,139.5850,0\n' +
    'S3,吉祥寺駅,35.7030,139.5800,0\n' +
    'P1,のりば群,35.6520,139.5410,1\n',
  'routes.txt':
    'route_id,route_short_name,route_long_name\n' +
    'R1,K01,調布〜吉祥寺\n' +
    'R2,,調布〜吉祥寺(直行)\n',
  'trips.txt':
    'route_id,service_id,trip_id,trip_headsign\n' +
    'R1,WEEKDAY,T1,吉祥寺駅\n' +
    'R1,WEEKDAY,T2,吉祥寺駅\n' +
    'R2,WEEKEND,T3,吉祥寺駅\n',
  'stop_times.txt':
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' +
    'T1,09:00:00,09:00:00,S1,1\n' +
    'T1,09:12:00,09:12:00,S2,2\n' +
    'T1,09:20:00,09:20:00,S3,3\n' +
    'T2,25:05:00,25:05:00,S1,1\n' +
    'T2,25:17:00,25:17:00,S2,2\n' +
    'T2,25:25:00,25:25:00,S3,3\n' +
    'T3,10:00:00,10:00:00,S1,1\n' +
    'T3,10:15:00,10:15:00,S3,2\n',
  'calendar.txt':
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n' +
    'WEEKDAY,1,1,1,1,1,0,0,20260101,20261231\n' +
    'WEEKEND,0,0,0,0,0,1,1,20260101,20261231\n',
  'calendar_dates.txt': 'service_id,date,exception_type\n' + 'WEEKDAY,20260923,2\n' + 'WEEKEND,20260923,1\n',
  'feed_info.txt':
    'feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date\n' +
    'テスト,https://example.invalid,ja,20260101,20261231\n',
};

const META = { operator: 'KeioBus', title: '京王バス', license: '基本ライセンス', generatedAt: '2026-09-10T00:00:00Z' };

/* ================================================================== */
console.log('\nCSV の読み取り');

test('引用符の中のカンマで壊れない', () => {
  const { rows } = parseCsv('a,b\n"x,y",z\n');
  assert.deepEqual(rows[0], ['x,y', 'z']);
});

test('二重引用符を 1 つに戻す', () => {
  const { rows } = parseCsv('a\n"He said ""hi"""\n');
  assert.equal(rows[0][0], 'He said "hi"');
});

test('引用符の中の改行を 1 つの値として扱う', () => {
  const { rows } = parseCsv('a,b\n"1\n2",3\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], '1\n2');
});

test('CRLF でも読める', () => {
  const { header, rows } = parseCsv('a,b\r\n1,2\r\n');
  assert.deepEqual(header, ['a', 'b']);
  assert.deepEqual(rows[0], ['1', '2']);
});

test('BOM を落とす', () => {
  const { header } = parseCsv('﻿stop_id,stop_name\n');
  assert.equal(header[0], 'stop_id');
});

test('行をオブジェクトにできる', () => {
  const rows = readTable('a,b\n1,2\n');
  assert.deepEqual(rows[0], { a: '1', b: '2' });
});

/* ================================================================== */
console.log('\n時刻と日付');

test('24 時を超える表記をそのまま分にする', () => {
  assert.equal(gtfsTimeToMinutes('25:05:00'), 25 * 60 + 5);
});
test('秒が無くても読める', () => {
  assert.equal(gtfsTimeToMinutes('09:30'), 570);
});
test('おかしな値は null', () => {
  assert.equal(gtfsTimeToMinutes('あ'), null);
  assert.equal(gtfsTimeToMinutes('09:99'), null);
  assert.equal(gtfsTimeToMinutes(''), null);
});
test('日付を ISO に直す', () => {
  assert.equal(gtfsDate('20260910'), '2026-09-10');
  assert.equal(gtfsDate('2026-09-10'), null);
});

/* ================================================================== */
console.log('\n索引づくり');

const { index, patterns, warnings } = buildIndex(FEED, META);

test('のりば群(location_type=1)は停留所にしない', () => {
  assert.equal(index.stopCount, 3, `停留所の数が違う: ${index.stopCount}`);
  assert(!index.byName['のりば群'], 'のりば群が混ざっている');
});

test('停留所を名前で引ける', () => {
  assert(index.byName['調布駅北口'], '名前の索引が無い');
  const s = index.stops[index.byName['調布駅北口'][0]];
  assert.equal(s.n, '調布駅北口');
  assert(Math.abs(s.y - 35.652) < 1e-6);
});

test('停車順が同じ便はまとめる', () => {
  // T1 と T2 は同じ並びなので 1 つの系統にまとまる
  const k01 = patterns.find((p) => p.n === 'K01');
  assert(k01, 'K01 が無い');
  assert.equal(k01.t.length, 2, '2 便がまとまっていない');
  assert.deepEqual(k01.s.length, 3);
});

test('便は発車時刻の順に並べる', () => {
  const k01 = patterns.find((p) => p.n === 'K01');
  assert(k01.t[0][0] < k01.t[1][0], '時刻順になっていない');
  assert.equal(k01.t[1][0], 25 * 60 + 5, '深夜便が normalize されていない');
});

test('系統名が無ければ long name で補う', () => {
  const r2 = patterns.find((p) => p.c === 'WEEKEND');
  assert.equal(r2.n, '調布〜吉祥寺(直行)');
});

test('行き先を持つ', () => {
  assert.equal(patterns[0].d, '吉祥寺駅');
});

test('停留所に「通る系統」が入る', () => {
  const s1 = index.stops[index.byName['調布駅北口'][0]];
  assert.equal(s1.r.length, 2, '2 系統が通っているはず');
  const s2 = index.stops[index.byName['三鷹台駅'][0]];
  assert.equal(s2.r.length, 1);
});

test('運行日を曜日のビットにする', () => {
  // 月〜金 = ビット 1..5
  assert.equal(index.calendars.WEEKDAY.d, 0b0111110);
  assert.equal(index.calendars.WEEKEND.d, 0b1000001);
});

test('calendar_dates の例外を取り込む', () => {
  assert.deepEqual(index.calendars.WEEKDAY.del, ['2026-09-23']);
  assert.deepEqual(index.calendars.WEEKEND.add, ['2026-09-23']);
});

test('feed_info の有効期間を持つ', () => {
  assert.equal(index.feedStart, '2026-01-01');
  assert.equal(index.feedEnd, '2026-12-31');
});

test('取り込み元を記録する', () => {
  assert.equal(index.operator, 'KeioBus');
  assert.equal(index.generatedAt, '2026-09-10T00:00:00Z');
});

test('警告は出ていない', () => {
  assert.deepEqual(warnings, []);
});

test('必要なファイルが無ければ止める(空の索引を作らない)', () => {
  assert.throws(() => buildIndex({ 'stops.txt': FEED['stops.txt'] }, META), /routes\.txt/);
});

test('運行日の定義が無ければ警告し、毎日運行にはしない', () => {
  const noCal = { ...FEED };
  delete noCal['calendar.txt'];
  delete noCal['calendar_dates.txt'];
  const r = buildIndex(noCal, META);
  assert(r.warnings.length >= 1, '警告が出ていない');
  assert.equal(r.index.calendars.WEEKDAY.d, null, '定義が無いのに走らせようとしている');
});

test('全角英数をならす', () => {
  assert.equal(normalizeStopName('ＡＢＣ１２３'), 'ABC123');
  assert.equal(normalizeStopName('調布　駅'), '調布 駅');
  assert.equal(normalizeStopName('調布駅前'), '調布駅前', '意味のある語を消していない');
});

/* ================================================================== */
console.log('\n配布用の分割');

test('索引と系統を別ファイルに割る', () => {
  const files = splitForWeb(index, patterns, { perShard: 2 });
  assert(files['index.json'], 'index.json が無い');
  assert(files['patterns/0.json'], 'patterns/0.json が無い');
  const meta = JSON.parse(files['index.json']);
  assert.equal(meta.perShard, 2);
  assert.equal(meta.shardCount, Math.ceil(patterns.length / 2));
});

test('分割してもすべての系統が入る', () => {
  const files = splitForWeb(index, patterns, { perShard: 1 });
  const all = Object.entries(files)
    .filter(([k]) => k.startsWith('patterns/'))
    .flatMap(([, v]) => JSON.parse(v).patterns);
  assert.equal(all.length, patterns.length);
  assert.deepEqual(
    all.map((p) => p.i).sort((a, b) => a - b),
    patterns.map((p) => p.i)
  );
});

/* ================================================================== */
console.log('\n運行日の判定');

const D = (s) => new Date(`${s}T12:00:00`);

test('平日ダイヤは平日に走る', () => {
  assert.equal(runsOn(index.calendars.WEEKDAY, D('2026-09-10')), true); // 木
});
test('平日ダイヤは日曜に走らない', () => {
  assert.equal(runsOn(index.calendars.WEEKDAY, D('2026-09-13')), false); // 日
});
test('祝日は calendar_dates で差し替わる', () => {
  assert.equal(runsOn(index.calendars.WEEKDAY, D('2026-09-23')), false, '運休日なのに走っている');
  assert.equal(runsOn(index.calendars.WEEKEND, D('2026-09-23')), true, '臨時運行が反映されていない');
});
test('有効期間の外は走らない', () => {
  assert.equal(runsOn(index.calendars.WEEKDAY, D('2027-01-04')), false);
});
test('定義が無いものは走らせない(嘘の便を出さない)', () => {
  assert.equal(runsOn({ d: null, add: [], del: [] }, D('2026-09-10')), false);
  assert.equal(runsOn(undefined, D('2026-09-10')), false);
});

/* ================================================================== */
console.log('\n停留所の検索');

test('完全一致を優先する', () => {
  const hit = findStops(index, '調布駅北口');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].n, '調布駅北口');
});
test('前方一致でも見つかる', () => {
  const hit = findStops(index, '調布');
  assert(hit.some((s) => s.n === '調布駅北口'));
});
test('空文字では何も返さない', () => {
  assert.deepEqual(findStops(index, '  '), []);
});
test('無い名前では何も返さない', () => {
  assert.deepEqual(findStops(index, '存在しない停留所'), []);
});

/* ================================================================== *
 *  検索(索引ファイルを fetch で読むところまで通す)
 * ================================================================== */
console.log('\n経路の検索');

/** 生成した配布ファイルを fetch から返す */
function installFetch(files, { fail = [] } = {}) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (fail.some((f) => u.includes(f))) return { ok: false, status: 500 };
    for (const [name, body] of Object.entries(files)) {
      if (u.endsWith(name)) return { ok: true, status: 200, json: async () => JSON.parse(body) };
    }
    return { ok: false, status: 404 };
  };
}

const WEB = splitForWeb(index, patterns, { perShard: 2 });
const CATALOG = JSON.stringify({
  v: 1,
  operators: [{ id: 'KeioBus', title: '京王バス', dir: 'KeioBus', generatedAt: META.generatedAt }],
});
const FILES = { 'catalog.json': CATALOG };
for (const [k, v] of Object.entries(WEB)) FILES[`KeioBus/${k}`] = v;

async function asyncTest(name, fn) {
  try {
    resetGtfsCache();
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}\n       ${e.message}`);
    process.exitCode = 1;
  }
}

await asyncTest('平日の直通バスが出る', async () => {
  installFetch(FILES);
  const r = await findGtfsBusRoutes('KeioBus', '調布駅北口', '吉祥寺駅', {
    departAt: 8 * 60,
    serviceDate: D('2026-09-10'),
  });
  assert.equal(r.routes.length, 1, `件数が違う: ${r.routes.length}`);
  const route = r.routes[0];
  assert.equal(route.departure, 9 * 60);
  assert.equal(route.arrival, 9 * 60 + 20);
  assert.equal(route.legs[0].lineTitle, 'K01');
  assert.equal(route.legs[0].stops, 2, '停留所数が違う');
  assert.equal(route.source, 'gtfs');
});

await asyncTest('出発時刻より前の便は出さない', async () => {
  installFetch(FILES);
  const r = await findGtfsBusRoutes('KeioBus', '調布駅北口', '吉祥寺駅', {
    departAt: 9 * 60 + 30,
    serviceDate: D('2026-09-10'),
  });
  // 平日の残りは 25:05 の深夜便だけ
  assert.equal(r.routes.length, 1);
  assert.equal(r.routes[0].departure, 25 * 60 + 5);
});

await asyncTest('土日ダイヤの日には平日便を出さない', async () => {
  installFetch(FILES);
  const r = await findGtfsBusRoutes('KeioBus', '調布駅北口', '吉祥寺駅', {
    departAt: 8 * 60,
    serviceDate: D('2026-09-13'), // 日曜
  });
  assert.equal(r.routes.length, 1);
  assert.equal(r.routes[0].departure, 10 * 60, '土日便になっていない');
});

await asyncTest('逆方向(降車が乗車より手前)は出さない', async () => {
  installFetch(FILES);
  const r = await findGtfsBusRoutes('KeioBus', '吉祥寺駅', '調布駅北口', {
    departAt: 0,
    serviceDate: D('2026-09-10'),
  });
  assert.deepEqual(r.routes, [], '逆走する経路を出している');
});

await asyncTest('途中の停留所からでも乗れる', async () => {
  installFetch(FILES);
  const r = await findGtfsBusRoutes('KeioBus', '三鷹台駅', '吉祥寺駅', {
    departAt: 8 * 60,
    serviceDate: D('2026-09-10'),
  });
  assert.equal(r.routes.length, 1);
  assert.equal(r.routes[0].departure, 9 * 60 + 12);
  assert.equal(r.routes[0].legs[0].stops, 1);
});

await asyncTest('停留所が見つからなければ系統ファイルを取りに行かない', async () => {
  let asked = 0;
  installFetch(FILES);
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/patterns/')) asked += 1;
    return real(url);
  };
  const r = await findGtfsBusRoutes('KeioBus', '調布駅北口', '存在しない停留所', {
    departAt: 8 * 60,
    serviceDate: D('2026-09-10'),
  });
  assert.deepEqual(r.routes, []);
  assert.equal(asked, 0, '無駄に系統ファイルを読んでいる');
});

await asyncTest('同じ停留所どうしでは経路を出さない', async () => {
  installFetch(FILES);
  const r = await findGtfsBusRoutes('KeioBus', '三鷹台駅', '三鷹台駅', {
    departAt: 8 * 60,
    serviceDate: D('2026-09-10'),
  });
  assert.deepEqual(r.routes, [], '同じ停留所で乗り降りする経路を出している');
});

await asyncTest('系統ファイルは必要なぶんだけ読む', async () => {
  const asked = new Set();
  installFetch(FILES);
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/patterns/')) asked.add(u);
    return real(u);
  };
  await findGtfsBusRoutes('KeioBus', '三鷹台駅', '吉祥寺駅', {
    departAt: 8 * 60,
    serviceDate: D('2026-09-10'),
  });
  // 三鷹台駅を通るのは 1 系統だけ。全部のファイルを読んではいけない。
  assert.equal(asked.size, 1, `読みすぎている: ${asked.size} ファイル`);
});

await asyncTest('目録が無ければ静かに 0 件(まだ取り込んでいない状態)', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  const r = await findAllGtfsRoutes('調布駅北口', '吉祥寺駅', {
    departAt: 8 * 60,
    serviceDate: D('2026-09-10'),
  });
  assert.deepEqual(r.routes, []);
  assert.deepEqual(r.warnings, [], 'まだ取り込んでいないだけなのに警告を出している');
});

await asyncTest('索引が壊れていれば警告として伝える', async () => {
  installFetch(FILES, { fail: ['KeioBus/index.json'] });
  const r = await findAllGtfsRoutes('調布駅北口', '吉祥寺駅', {
    departAt: 8 * 60,
    serviceDate: D('2026-09-10'),
  });
  assert.deepEqual(r.routes, []);
  assert.equal(r.warnings.length, 1, '黙って 0 件にしている');
  assert(/京王バス/.test(r.warnings[0].message));
});

await asyncTest('全事業者を横断して探し、バス停の座標も返す', async () => {
  installFetch(FILES);
  const r = await findAllGtfsRoutes('調布駅北口', '吉祥寺駅', {
    departAt: 8 * 60,
    serviceDate: D('2026-09-10'),
  });
  assert.equal(r.routes.length, 1);
  assert.equal(r.operators[0].title, '京王バス');
  assert(r.stops.some((s) => s.title === '調布駅北口' && s.lat));
});

/* ================================================================== *
 *  地図に出すバス停(範囲検索)
 * ================================================================== */
console.log('\n表示範囲のバス停');

// 3 停留所すべてを含む範囲 / 調布だけを含む範囲
const ALL = { north: 35.75, south: 35.60, east: 139.60, west: 139.50 };
const NARROW = { north: 35.66, south: 35.64, east: 139.55, west: 139.53 };

await asyncTest('表示範囲にある停留所を返す', async () => {
  installFetch(FILES);
  const r = await stopsInBounds(ALL, { zoom: 15 });
  const names = r.stops.map((s) => s.title).sort();
  assert.deepEqual(names, ['三鷹台駅', '吉祥寺駅', '調布駅北口']);
  assert.equal(r.empty, false);
  assert.equal(r.tooWide, false);
});

await asyncTest('範囲の外の停留所は返さない', async () => {
  installFetch(FILES);
  const r = await stopsInBounds(NARROW, { zoom: 15 });
  assert.deepEqual(r.stops.map((s) => s.title), ['調布駅北口']);
});

await asyncTest('広すぎる表示では出さない(点で埋まるのを防ぐ)', async () => {
  installFetch(FILES);
  const r = await stopsInBounds(ALL, { zoom: STOP_MIN_ZOOM - 1 });
  assert.deepEqual(r.stops, []);
  assert.equal(r.tooWide, true, '理由を伝えていない');
});

await asyncTest('件数の上限で打ち切り、打ち切ったことを伝える', async () => {
  installFetch(FILES);
  const r = await stopsInBounds(ALL, { zoom: 15, limit: 2 });
  assert.equal(r.stops.length, 2);
  assert.equal(r.truncated, true);
});

await asyncTest('まだ取り込んでいなければ empty を返す', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  const r = await stopsInBounds(ALL, { zoom: 15 });
  assert.deepEqual(r.stops, []);
  assert.equal(r.empty, true, '未取り込みだと判る形になっていない');
});

await asyncTest('返す停留所は地図にそのまま渡せる形', async () => {
  installFetch(FILES);
  const r = await stopsInBounds(ALL, { zoom: 15 });
  for (const s of r.stops) {
    assert(s.id && s.title, 'id と名前が要る');
    assert(Number.isFinite(s.lat) && Number.isFinite(s.lon), '座標が要る');
    assert.equal(s.operatorTitle, '京王バス');
  }
});

/* ================================================================== *
 *  取り込み元の設定
 * ================================================================== */
console.log('\n取り込み元の設定');

const { loadSources } = await import('../tools/build-gtfs-index.mjs').catch(() => ({}));
const { readFile } = await import('node:fs/promises');

await asyncTest('同梱の gtfs-sources.json は妥当', async () => {
  const body = JSON.parse(await readFile('tools/gtfs-sources.json', 'utf8'));
  assert(Array.isArray(body.sources) && body.sources.length, 'sources が無い');
  for (const src of body.sources) {
    assert(src.id && /^[A-Za-z0-9_-]+$/.test(src.id), `id が不正: ${src.id}`);
    assert(src.title, `${src.id}: title が無い`);
    assert(src.license, `${src.id}: license が無い(再配布の可否が判らない)`);
    assert(['odpt', 'url'].includes(src.kind), `${src.id}: kind が不正`);
    if (src.kind === 'odpt') assert(src.dataset, `${src.id}: dataset が無い`);
    if (src.kind === 'url') assert(/^https?:\/\//.test(src.url), `${src.id}: url が不正`);
  }
});

await asyncTest('id が重複していない', async () => {
  const body = JSON.parse(await readFile('tools/gtfs-sources.json', 'utf8'));
  const ids = body.sources.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'id が重複している');
});

console.log(`\n${passed} 件のテストが成功${process.exitCode ? '(失敗あり)' : ''}\n`);
