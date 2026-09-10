/**
 * 運行情報の判定のテスト
 *   node tests/status.test.mjs
 *
 * ここは「誤った警告を出さない」ことが最重要。
 * 平常なのに遅延と出す、再開済みなのに運休と出す、
 * 昨日の情報を今の状況として出す — どれも実害がある。
 */

import assert from 'node:assert/strict';
import { TransitNetwork } from '../transit/js/network.js';
import {
  analyzeStatus,
  classify,
  stripNegations,
  extractDelayMinutes,
  ageInMinutes,
  warningsForRoute,
  delayEstimate,
  SEVERITY,
  STALE_AFTER_MINUTES,
} from '../transit/js/status.js';

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

const GINZA = 'odpt.Railway:TokyoMetro.Ginza';
const MARU = 'odpt.Railway:TokyoMetro.Marunouchi';
const ST = (rw, n) => `odpt.Station:${rw}.${n}`;

const NET = new TransitNetwork(
  {
    operators: [{ id: 'TokyoMetro', title: '東京メトロ' }],
    railways: [
      {
        id: GINZA,
        title: '銀座線',
        operator: 'TokyoMetro',
        stations: [ST('TokyoMetro.Ginza', 'Shibuya'), ST('TokyoMetro.Ginza', 'Omotesando'), ST('TokyoMetro.Ginza', 'Ueno')],
      },
      {
        id: MARU,
        title: '丸ノ内線',
        operator: 'TokyoMetro',
        stations: [ST('TokyoMetro.Marunouchi', 'Yotsuya'), ST('TokyoMetro.Marunouchi', 'Otemachi')],
      },
    ],
    stations: [
      { id: ST('TokyoMetro.Ginza', 'Shibuya'), title: '渋谷', railway: GINZA, connecting: [] },
      { id: ST('TokyoMetro.Ginza', 'Omotesando'), title: '表参道', railway: GINZA, connecting: [] },
      { id: ST('TokyoMetro.Ginza', 'Ueno'), title: '上野', railway: GINZA, connecting: [] },
      { id: ST('TokyoMetro.Marunouchi', 'Yotsuya'), title: '四ツ谷', railway: MARU, connecting: [] },
      { id: ST('TokyoMetro.Marunouchi', 'Otemachi'), title: '大手町', railway: MARU, connecting: [] },
    ],
    errors: [],
  },
  {}
);

const NOW = new Date('2026-09-10T12:00:00+09:00');
const minutesAgo = (n) => new Date(NOW.getTime() - n * 60000).toISOString();

/* ================================================================== */
console.log('\n否定形を遅延と誤判定しない');

test('「遅れはありません」は平常', () => {
  assert.equal(classify('', '現在、遅れはありません。'), SEVERITY.NORMAL);
});
test('「遅延は発生していません」は平常', () => {
  assert.equal(classify('', '平常どおり運転しています。遅延は発生していません。'), SEVERITY.NORMAL);
});
test('「遅れは解消しました」を遅延にしない', () => {
  assert.notEqual(classify('', '人身事故の影響による遅れは解消しました。'), SEVERITY.DELAY);
});
test('「運休はございません」を運休にしない', () => {
  assert.notEqual(classify('', '本日の運休はございません。'), SEVERITY.SUSPENDED);
});
test('「運転見合わせは解除されました」を運休にしない', () => {
  assert.notEqual(classify('', '大雨による運転見合わせは解除されました。'), SEVERITY.SUSPENDED);
});
test('否定を取り除いても本当の遅延は残る', () => {
  assert.equal(classify('', '銀座線で約10分の遅れが出ています。運休はありません。'), SEVERITY.DELAY);
});
test('stripNegations は否定部分だけを消す', () => {
  const out = stripNegations('約10分の遅れが出ています。運休はありません。');
  assert(out.includes('遅れ'), '本当の遅れまで消している');
  assert(!/運休はありません/.test(out), '否定が残っている');
});

/* ================================================================== */
console.log('\n再開・平常の優先');

test('「見合わせていましたが運転を再開しました」は運休にしない', () => {
  assert.equal(classify('', '信号故障のため運転を見合わせていましたが、11時50分に運転を再開しました。'), SEVERITY.INFO);
});
test('事業者が「平常運転」と言えば本文より優先する', () => {
  assert.equal(classify('平常運転', '昨日は大雨の影響で遅れが発生しました。'), SEVERITY.NORMAL);
});
test('status が「遅延」なら遅延', () => {
  assert.equal(classify('遅延', ''), SEVERITY.DELAY);
});
test('status が「運転見合わせ」なら運転見合わせ', () => {
  assert.equal(classify('運転見合わせ', ''), SEVERITY.SUSPENDED);
});
test('本文も status も空なら平常', () => {
  assert.equal(classify('', ''), SEVERITY.NORMAL);
});

/* ================================================================== */
console.log('\n遅れ時分の抽出');

test('「約10分の遅れ」から 10 を取る', () => {
  assert.equal(extractDelayMinutes('約10分の遅れが出ています'), 10);
});
test('「15分程度の遅れ」から 15 を取る', () => {
  assert.equal(extractDelayMinutes('15分程度の遅れがあります'), 15);
});
test('「遅れは約20分」の語順でも取れる', () => {
  assert.equal(extractDelayMinutes('現在の遅れは約20分です'), 20);
});
test('否定文からは取らない', () => {
  assert.equal(extractDelayMinutes('10分の遅れはありません'), null);
});
test('分数が書いていなければ null', () => {
  assert.equal(extractDelayMinutes('ダイヤが乱れています'), null);
});
test('現実的でない値は採らない', () => {
  assert.equal(extractDelayMinutes('999分の遅れ'), null);
});

/* ================================================================== */
console.log('\n情報の古さ');

test('日付が無ければ null', () => {
  assert.equal(ageInMinutes(null, NOW), null);
});
test('30分前なら 30', () => {
  assert.equal(ageInMinutes(minutesAgo(30), NOW), 30);
});
test('古い異常情報は現在の状況に含めない', () => {
  const a = analyzeStatus(
    [{ railway: GINZA, operator: 'odpt.Operator:TokyoMetro', status: '遅延', text: '約10分の遅れ', date: minutesAgo(STALE_AFTER_MINUTES + 60) }],
    NET,
    { now: NOW }
  );
  assert.equal(a.list.length, 0, '古い情報が現在の一覧に出ている');
  assert.equal(a.stale.length, 1, '古い情報が捨てられている(別枠に残すべき)');
  assert.equal(a.byRailway.size, 0, '古い情報が経路の警告に使われている');
});
test('新しい異常情報はそのまま使う', () => {
  const a = analyzeStatus(
    [{ railway: GINZA, operator: 'odpt.Operator:TokyoMetro', status: '遅延', text: '約10分の遅れ', date: minutesAgo(5) }],
    NET,
    { now: NOW }
  );
  assert.equal(a.list.length, 1);
  assert.equal(a.byRailway.get(GINZA).severity, SEVERITY.DELAY);
  assert.equal(a.byRailway.get(GINZA).delayMinutes, 10);
});
test('古くても平常運転の情報は消さない', () => {
  const a = analyzeStatus(
    [{ railway: GINZA, operator: 'odpt.Operator:TokyoMetro', status: '平常運転', text: '', date: minutesAgo(600) }],
    NET,
    { now: NOW }
  );
  assert.equal(a.list.length, 1);
  assert.equal(a.stale.length, 0);
});

/* ================================================================== */
console.log('\n路線の指定が無い情報');

test('事業者全体の情報はその事業者の全路線に反映する', () => {
  const a = analyzeStatus(
    [{ railway: null, operator: 'odpt.Operator:TokyoMetro', status: '遅延', text: '強風の影響で全線に遅れが出ています', date: minutesAgo(3) }],
    NET,
    { now: NOW }
  );
  assert.equal(a.byRailway.get(GINZA)?.severity, SEVERITY.DELAY, '銀座線に反映されていない');
  assert.equal(a.byRailway.get(MARU)?.severity, SEVERITY.DELAY, '丸ノ内線に反映されていない');
});

test('路線指定の情報のほうが強ければそちらを採る', () => {
  const a = analyzeStatus(
    [
      { railway: null, operator: 'odpt.Operator:TokyoMetro', status: '遅延', text: '遅れが出ています', date: minutesAgo(3) },
      { railway: GINZA, operator: 'odpt.Operator:TokyoMetro', status: '運転見合わせ', text: '運転を見合わせています', date: minutesAgo(2) },
    ],
    NET,
    { now: NOW }
  );
  assert.equal(a.byRailway.get(GINZA).severity, SEVERITY.SUSPENDED);
  assert.equal(a.byRailway.get(MARU).severity, SEVERITY.DELAY);
});

/* ================================================================== */
console.log('\n経路への反映');

const ROUTE = {
  departure: 540,
  arrival: 562,
  legs: [
    { railway: GINZA, from: ST('TokyoMetro.Ginza', 'Shibuya'), to: ST('TokyoMetro.Ginza', 'Ueno'), departure: 540, arrival: 562, stops: 2 },
  ],
};

test('平常運転の路線には警告を出さない', () => {
  const a = analyzeStatus(
    [{ railway: GINZA, operator: 'odpt.Operator:TokyoMetro', status: '平常運転', text: '遅れはありません', date: minutesAgo(2) }],
    NET,
    { now: NOW }
  );
  assert.deepEqual(warningsForRoute(ROUTE, a), []);
});

test('徒歩・経由のレグは警告の判定に使わない', () => {
  const a = analyzeStatus(
    [{ railway: GINZA, operator: 'odpt.Operator:TokyoMetro', status: '遅延', text: '約8分の遅れ', date: minutesAgo(2) }],
    NET,
    { now: NOW }
  );
  const withExtras = {
    ...ROUTE,
    legs: [{ walkAccess: true, kind: 'walk', minutes: 6 }, { via: true, label: '上野' }, ...ROUTE.legs],
  };
  assert.equal(warningsForRoute(withExtras, a).length, 1);
});

test('遅延分から到着見込みを出す', () => {
  const a = analyzeStatus(
    [{ railway: GINZA, operator: 'odpt.Operator:TokyoMetro', status: '遅延', text: '約12分の遅れが出ています', date: minutesAgo(2) }],
    NET,
    { now: NOW }
  );
  const r = { ...ROUTE, warnings: warningsForRoute(ROUTE, a) };
  const est = delayEstimate(r);
  assert(est, '見込みが出ていない');
  assert.equal(est.minutes, 12);
  assert.equal(est.arrival, 562 + 12);
});

test('分数が判らない遅延では到着見込みを出さない(嘘をつかない)', () => {
  const a = analyzeStatus(
    [{ railway: GINZA, operator: 'odpt.Operator:TokyoMetro', status: '遅延', text: 'ダイヤが乱れています', date: minutesAgo(2) }],
    NET,
    { now: NOW }
  );
  const r = { ...ROUTE, warnings: warningsForRoute(ROUTE, a) };
  assert.equal(delayEstimate(r), null);
});

test('複数路線が遅れているときは最大の遅れを採る', () => {
  const r = {
    ...ROUTE,
    warnings: [
      { severity: SEVERITY.DELAY, delayMinutes: 5, railwayTitle: '銀座線' },
      { severity: SEVERITY.DELAY, delayMinutes: 15, railwayTitle: '丸ノ内線' },
    ],
  };
  const est = delayEstimate(r);
  assert.equal(est.minutes, 15);
  assert.equal(est.lines.length, 2);
});

console.log(`\n${passed} 件のテストが成功${process.exitCode ? '(失敗あり)' : ''}\n`);
