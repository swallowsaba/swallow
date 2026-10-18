/**
 * 経路の比較チャートのテスト
 *   node tests/routechart.test.mjs
 *
 * このチャートは「縦軸 = 乗り換え回数 / 横軸 = 時刻」で、
 * **横に伸びている 1 本の直線 = 1 本の乗り物**という読み方に全部が乗っている。
 * ここが崩れると図の意味そのものが変わるので、値で固定しておく。
 *
 * 見た目(色・影・曲線の形)はスクリーンショットで見る。ここで見るのは
 *   ・段(乗り換え回数)の数え方
 *   ・線が途切れないこと(待ち時間を区間にしない)
 *   ・両端の徒歩に時刻を入れること(時刻表に入っていないため)
 *   ・到着ラベルが重ならず、かつ自分の線より上に出ないこと
 */

import assert from 'node:assert/strict';
import {
  toRuns, buildModel, layoutEndLabels, tickStep, trainTypeLabel, lineupOf, summaryOf,
} from '../transit/js/routechart.js';

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

const T = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

const net = {
  railways: new Map([
    ['A', { title: '小田急小田原線', color: '#2b95e0' }],
    ['B', { title: '東京メトロ千代田線', color: '#13c78e' }],
    ['C', { title: '東京メトロ銀座線', color: '#ffa023' }],
    ['N', { title: '色なし線' }],
  ]),
  stationTitle: (id) => String(id || ''),
};

const ride = (from, to, dep, arr, rw, extra = {}) => ({
  from, to, fromTitle: from, toTitle: to,
  departure: T(dep), arrival: T(arr), railway: rw, stops: 3, ...extra,
});
const walkLeg = (side, a, b, minutes) => ({
  walkAccess: true, kind: 'walk', side, fromTitle: a, toTitle: b, minutes,
});
const transferLeg = (minutes) => ({ transfer: true, kind: 'walk', minutes });

/** 歩き → A → 乗換 → B → C(直通)。乗り物は 3 本なので段は 0,1,2。 */
const route1 = {
  departure: T('10:00'), arrival: T('11:10'), transfers: 2,
  rideMinutes: 70, walkMinutes: 10, waitMinutes: 4, warnings: [], legs: [
    walkLeg('from', '現在地', '甲', 10),
    ride('甲', '乙', '10:10', '10:40', 'A'),
    transferLeg(4),
    ride('乙', '丙', '10:44', '11:00', 'B'),
    ride('丙', '丁', '11:00', '11:10', 'C'),
  ],
};

/* ------------------------------------------------------------------ *
 *  段の数え方
 * ------------------------------------------------------------------ */

test('乗り物 1 本ごとに段が 1 つ上がる', () => {
  const runs = toRuns(route1, net);
  const rides = runs.filter((r) => !r.walk);
  assert.deepEqual(rides.map((r) => r.level), [0, 1, 2]);
});

test('両端の徒歩では段を上げない(歩いても乗り換えではない)', () => {
  const runs = toRuns(route1, net);
  assert.equal(runs[0].walk, true);
  assert.equal(runs[0].level, 0, '出発前の徒歩は 0 段目');
});

test('待ち時間は区間にしない(線を途切れさせないため)', () => {
  const runs = toRuns(route1, net);
  // 乗換レグ(4分)は runs に入らず、前後をつなぐ「渡り」になる
  assert.equal(runs.length, 4, '徒歩1 + 乗り物3');
  assert.ok(runs.every((r) => r.at < r.off || r.minutes === 0));
});

test('直通(待ち 0 分)でも段は上がる', () => {
  const runs = toRuns(route1, net).filter((r) => !r.walk);
  assert.equal(runs[1].off, runs[2].at, '乙→丙 と 丙→丁 は間が空いていない');
  assert.equal(runs[2].level, 2, 'それでも別の乗り物なので段は上がる');
});

/* ------------------------------------------------------------------ *
 *  両端の徒歩の時刻
 * ------------------------------------------------------------------ */

test('出発側の徒歩は、経路の出発時刻から始まる', () => {
  const runs = toRuns(route1, net);
  assert.equal(runs[0].at, T('10:00'));
  assert.equal(runs[0].off, T('10:10'));
});

test('到着側の徒歩は、経路の到着時刻で終わる', () => {
  const r = {
    departure: T('10:00'), arrival: T('10:50'), legs: [
      ride('甲', '乙', '10:00', '10:35', 'A'),
      walkLeg('to', '乙', '目的地', 15),
    ],
  };
  const runs = toRuns(r, net);
  const w = runs[runs.length - 1];
  assert.equal(w.walk, true);
  assert.equal(w.off, T('10:50'), '到着時刻ちょうどに着く');
  assert.equal(w.at, T('10:35'), '降りた時刻から歩き始める');
});

test('時刻の入っていない乗車レグは捨てる(線が原点に飛ぶため)', () => {
  const r = { departure: T('10:00'), arrival: T('10:30'), legs: [
    { from: '甲', to: '乙', railway: 'A' },
    ride('乙', '丙', '10:10', '10:30', 'B'),
  ] };
  const runs = toRuns(r, net);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].level, 0);
});

/* ------------------------------------------------------------------ *
 *  路線の名前と色
 * ------------------------------------------------------------------ */

test('短い区間用に略称を持つ', () => {
  const runs = toRuns(route1, net).filter((r) => !r.walk);
  assert.equal(runs[1].name, '東京メトロ千代田線');
  assert.equal(runs[1].short, '千代田線');
});

test('路線色が無ければ既定の鉄道色にする(黒い線にしない)', () => {
  const r = { departure: T('10:00'), arrival: T('10:20'), legs: [ride('甲', '乙', '10:00', '10:20', 'N')] };
  assert.equal(toRuns(r, net)[0].color, 'var(--rail)');
});

test('バスはバスの色。路線色と混ぜない', () => {
  const r = { departure: T('10:00'), arrival: T('10:20'), legs: [
    { bus: true, from: '停A', to: '停B', fromTitle: '停A', toTitle: '停B',
      departure: T('10:00'), arrival: T('10:20'), lineTitle: '厚20', stops: 5 },
  ] };
  const run = toRuns(r, net)[0];
  assert.equal(run.color, 'var(--bus)');
  assert.equal(run.name, '厚20');
});

test('種別と駅数を補足に出す', () => {
  const r = { departure: T('10:00'), arrival: T('10:20'), legs: [
    ride('甲', '乙', '10:00', '10:20', 'A', { trainType: 'odpt.TrainType:Odakyu.RapidExpress', stops: 8 }),
  ] };
  assert.equal(toRuns(r, net)[0].sub, '快速急行・8駅');
});

test('知らない種別はそのまま出す(空欄にして隠さない)', () => {
  assert.equal(trainTypeLabel('odpt.TrainType:X.Something'), 'Something');
  assert.equal(trainTypeLabel(null), '');
});

/* ------------------------------------------------------------------ *
 *  まとめ
 * ------------------------------------------------------------------ */

test('段の最大値と時刻の幅を求める', () => {
  const m = buildModel([route1], net);
  assert.equal(m.maxLevel, 2);
  assert.ok(m.t0 < T('10:00'), '左右に余白を取る');
  assert.ok(m.t1 > T('11:10'));
});

test('案ごとに違う色を割り当てる', () => {
  const m = buildModel([route1, route1, route1], net);
  const colors = new Set(m.items.map((it) => it.color));
  assert.equal(colors.size, 3);
});

test('経路が無くても落ちない', () => {
  const m = buildModel([], net);
  assert.equal(m.items.length, 0);
  assert.ok(m.t1 > m.t0, '幅 0 で割らない');
});

test('乗り物の並びを出す(徒歩は入れない)', () => {
  const m = buildModel([route1], net);
  assert.deepEqual(lineupOf(m.items[0]), ['小田急小田原線', '千代田線', '銀座線']);
});

test('要約に運賃を出さない', () => {
  const m = buildModel([route1], net);
  const s = summaryOf(m.items[0]);
  assert.ok(!/円|運賃|料金/.test(s), s);
  assert.ok(s.includes('乗換2回'));
});

/* ------------------------------------------------------------------ *
 *  目盛
 * ------------------------------------------------------------------ */

test('目盛は多くなりすぎない', () => {
  for (const span of [20, 60, 125, 300, 600, 1200]) {
    const step = tickStep(span);
    assert.ok(span / step <= 8, `${span}分 で ${span / step} 本は多い`);
  }
});

/* ------------------------------------------------------------------ *
 *  到着ラベルの配置
 * ------------------------------------------------------------------ */

function fakeGeo({ H = 500, T = 40, items }) {
  // 縦長(時刻が下に流れる)の座標を模す
  return {
    H, T, W: 360, L: 48, iw: 294, ih: H - T - 42,
    px: (m, lv, i) => items[i].x,
    py: (m, lv, i) => items[i].y,
  };
}

test('到着が近い案どうしのラベルは重ならない', () => {
  const pos = [{ x: 200, y: 300 }, { x: 205, y: 304 }, { x: 210, y: 308 }];
  const model = { items: pos.map(() => ({ runs: [{ off: 0, level: 0 }] })) };
  const g = fakeGeo({ items: pos });
  const out = layoutEndLabels(model, g, true);
  const ys = [...out.values()].map((v) => v.y).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i += 1) {
    assert.ok(ys[i] - ys[i - 1] >= 18 - 0.01, `${ys[i - 1]} と ${ys[i]} が近すぎる`);
  }
});

test('下にあふれても、ラベルは自分の線より上に出ない', () => {
  // わざと下端すれすれに 6 件ならべる
  const pos = Array.from({ length: 6 }, (_, i) => ({ x: 200, y: 430 + i * 3 }));
  const model = { items: pos.map(() => ({ runs: [{ off: 0, level: 0 }] })) };
  const g = fakeGeo({ items: pos });
  const out = layoutEndLabels(model, g, true);
  for (const [i, v] of out) {
    assert.ok(v.y >= v.y0 - 0.01, `案${i + 1} のラベルが線より上(${v.y} < ${v.y0})`);
  }
});

test('離れた列のラベルは、別々に積む(無駄に下げない)', () => {
  const pos = [{ x: 80, y: 300 }, { x: 300, y: 300 }];
  const model = { items: pos.map(() => ({ runs: [{ off: 0, level: 0 }] })) };
  const g = fakeGeo({ items: pos });
  const out = layoutEndLabels(model, g, true);
  assert.equal(out.get(0).y, 300);
  assert.equal(out.get(1).y, 300, '列が違えば同じ高さでよい');
});

test('横長では右端に 1 列で積む', () => {
  const pos = [{ x: 80, y: 100 }, { x: 300, y: 103 }];
  const model = { items: pos.map(() => ({ runs: [{ off: 0, level: 0 }] })) };
  const g = fakeGeo({ items: pos });
  const out = layoutEndLabels(model, g, false);
  const ys = [...out.values()].map((v) => v.y).sort((a, b) => a - b);
  assert.ok(ys[1] - ys[0] >= 18 - 0.01, '横長でも重ねない');
});

test('線の無い案はラベルを出さない', () => {
  const model = { items: [{ runs: [] }] };
  const g = fakeGeo({ items: [{ x: 0, y: 0 }] });
  assert.equal(layoutEndLabels(model, g, true).size, 0);
});

console.log(`\n${passed} 件のテストが成功`);
