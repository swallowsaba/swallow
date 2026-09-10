/**
 * 経由地のテスト
 *   node tests/via.test.mjs
 */

import assert from 'node:assert/strict';
import { combineSegments, mergeRoutes, buildPoints, validatePoints } from '../transit/js/via.js';

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

const RW = 'odpt.Railway:TokyoMetro.Ginza';

/** 検索結果 1 本ぶんの最小形 */
function route({ dep, arr, transfers = 0, bus = false, wait = 0, warnings = [], estimated = false }) {
  return {
    departure: dep,
    arrival: arr,
    rideMinutes: arr - dep,
    transfers,
    waitMinutes: wait,
    estimatedOnly: estimated,
    warnings,
    kind: bus ? 'bus' : undefined,
    legs: [
      bus
        ? { bus: true, from: 'pole:A', to: 'pole:B', fromTitle: 'A', toTitle: 'B', departure: dep, arrival: arr, stops: 4 }
        : { railway: RW, from: 'st:A', to: 'st:B', departure: dep, arrival: arr, stops: 3 },
    ],
  };
}

console.log('\n地点の組み立て');
test('経由地が未確定なら地点に含めない', () => {
  const { points, vias } = buildPoints(
    { groupId: 'g1', label: '渋谷' },
    [{ id: 'v1', spec: null, stay: 10 }, { id: 'v2', spec: { groupId: 'g2', label: '上野' }, stay: 30 }],
    { groupId: 'g3', label: '大手町' }
  );
  assert.deepEqual(points.map((p) => p.label), ['渋谷', '上野', '大手町']);
  assert.deepEqual(vias, [{ label: '上野', stay: 30 }]);
});

test('滞在時間は 0 未満にならない', () => {
  const { vias } = buildPoints({ label: 'A' }, [{ spec: { label: 'B' }, stay: -5 }], { label: 'C' });
  assert.equal(vias[0].stay, 0);
});

console.log('\n地点の検証');
test('同じ駅が連続していたら弾く', () => {
  const msg = validatePoints([{ groupId: 'g1', label: '渋谷' }, { groupId: 'g1', label: '渋谷' }, { groupId: 'g2', label: '上野' }]);
  assert(msg && msg.includes('渋谷'), `メッセージが不正: ${msg}`);
});
test('離れていれば同じ駅を 2 回通ってもよい', () => {
  assert.equal(
    validatePoints([{ groupId: 'g1', label: '渋谷' }, { groupId: 'g2', label: '上野' }, { groupId: 'g1', label: '渋谷' }]),
    null
  );
});
test('未確定の地点があれば弾く', () => {
  assert(validatePoints([{ groupId: 'g1', label: '渋谷' }, null]));
});

console.log('\n区間の結合');
const VIAS = [{ label: '上野', stay: 30 }];

test('滞在時間を守った組み合わせだけを使う', () => {
  const segs = [
    { routes: [route({ dep: 540, arr: 560 })] }, // 09:00 → 09:20
    {
      routes: [
        route({ dep: 585, arr: 600 }), // 09:45 発 — 滞在30分だと 09:50 以降でないと乗れない
        route({ dep: 595, arr: 610 }), // 09:55 発 — こちらが正しい
      ],
    },
  ];
  const out = combineSegments(segs, VIAS, 540, 1);
  assert.equal(out.length, 1);
  const r = out[0];
  assert.equal(r.departure, 540);
  assert.equal(r.arrival, 610);
  assert.equal(r.rideMinutes, 70, '所要時間は滞在も含めた通し時間');
});

test('滞在時間ぴったりの便は使える', () => {
  const segs = [{ routes: [route({ dep: 540, arr: 560 })] }, { routes: [route({ dep: 590, arr: 600 })] }];
  const out = combineSegments(segs, VIAS, 540, 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].arrival, 600);
});

test('経由地のレグに指定滞在と実際の滞在の両方が入る', () => {
  const segs = [{ routes: [route({ dep: 540, arr: 560 })] }, { routes: [route({ dep: 600, arr: 620 })] }];
  const [r] = combineSegments(segs, VIAS, 540, 1);
  const via = r.legs.find((l) => l.via);
  assert(via, '経由レグが無い');
  assert.equal(via.label, '上野');
  assert.equal(via.plannedStay, 30);
  assert.equal(via.actualStay, 40, '次の便まで実際にあく時間');
  assert.equal(r.stayMinutes, 40);
  assert.equal(r.viaCount, 1);
});

test('乗換回数は区間ごとの合計', () => {
  const segs = [
    { routes: [route({ dep: 540, arr: 560, transfers: 1 })] },
    { routes: [route({ dep: 600, arr: 620, transfers: 2 })] },
  ];
  const [r] = combineSegments(segs, VIAS, 540, 1);
  assert.equal(r.transfers, 3);
});

test('バスと鉄道が混ざれば mixed になる', () => {
  const segs = [
    { routes: [route({ dep: 540, arr: 560, bus: true })] },
    { routes: [route({ dep: 600, arr: 620 })] },
  ];
  const [r] = combineSegments(segs, VIAS, 540, 1);
  assert.equal(r.kind, 'mixed');
});

test('すべてバスなら bus のまま', () => {
  const segs = [
    { routes: [route({ dep: 540, arr: 560, bus: true })] },
    { routes: [route({ dep: 600, arr: 620, bus: true })] },
  ];
  const [r] = combineSegments(segs, VIAS, 540, 1);
  assert.equal(r.kind, 'bus');
});

test('一部でも推定なら経路全体を推定扱いにする', () => {
  const segs = [
    { routes: [route({ dep: 540, arr: 560, estimated: true })] },
    { routes: [route({ dep: 600, arr: 620 })] },
  ];
  const [r] = combineSegments(segs, VIAS, 540, 1);
  assert.equal(r.estimatedOnly, true);
});

test('後の区間に乗れる便が無ければ経路を作らない', () => {
  const segs = [
    { routes: [route({ dep: 540, arr: 560 })] },
    { routes: [route({ dep: 570, arr: 580 })] }, // 滞在30分に間に合わない
  ];
  assert.deepEqual(combineSegments(segs, VIAS, 540, 3), []);
});

test('区間のどれかが空なら経路を作らない', () => {
  assert.deepEqual(combineSegments([{ routes: [route({ dep: 540, arr: 560 })] }, { routes: [] }], VIAS, 540), []);
});

test('複数案を作るが、同じ組み合わせは重複させない', () => {
  const segs = [
    { routes: [route({ dep: 540, arr: 560 }), route({ dep: 545, arr: 570 })] },
    { routes: [route({ dep: 600, arr: 620 }), route({ dep: 610, arr: 625 })] },
  ];
  const out = combineSegments(segs, VIAS, 540, 3);
  assert(out.length >= 2, `案が足りない: ${out.length}`);
  const sigs = new Set(out.map((r) => `${r.departure}-${r.arrival}`));
  assert.equal(sigs.size, out.length, '同じ案が重複している');
});

test('警告は区間をまたいで重複させない', () => {
  const w = { railway: RW, severity: 'delay', text: '遅延' };
  const segs = [
    { routes: [route({ dep: 540, arr: 560, warnings: [w] })] },
    { routes: [route({ dep: 600, arr: 620, warnings: [{ ...w }] })] },
  ];
  const [r] = combineSegments(segs, VIAS, 540, 1);
  assert.equal(r.warnings.length, 1);
});

test('経由地が 2 か所でも順番どおりにつながる', () => {
  const vias = [{ label: '上野', stay: 10 }, { label: '浅草', stay: 20 }];
  const segs = [
    { routes: [route({ dep: 540, arr: 560 })] },
    { routes: [route({ dep: 575, arr: 590 })] },
    { routes: [route({ dep: 615, arr: 640 })] },
  ];
  const [r] = combineSegments(segs, vias, 540, 1);
  assert.equal(r.viaCount, 2);
  assert.equal(r.departure, 540);
  assert.equal(r.arrival, 640);
  const labels = r.legs.filter((l) => l.via).map((l) => l.label);
  assert.deepEqual(labels, ['上野', '浅草']);
});

test('滞在 0 分でも到着より前の便は選ばない', () => {
  const vias = [{ label: '上野', stay: 0 }];
  const segs = [
    { routes: [route({ dep: 540, arr: 560 })] },
    { routes: [route({ dep: 555, arr: 570 }), route({ dep: 562, arr: 578 })] },
  ];
  const [r] = combineSegments(segs, vias, 540, 1);
  assert.equal(r.arrival, 578);
});

console.log('\nmergeRoutes 単体');
test('区間が 1 つだけなら経由レグは入らない', () => {
  const r = mergeRoutes([route({ dep: 540, arr: 560 })], []);
  assert.equal(r.legs.filter((l) => l.via).length, 0);
  assert.equal(r.viaCount, 0);
  assert.equal(r.stayMinutes, 0);
});

console.log(`\n${passed} 件のテストが成功${process.exitCode ? '(失敗あり)' : ''}\n`);
