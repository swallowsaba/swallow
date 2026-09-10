/**
 * 任意地点からの徒歩接続のテスト
 *   node tests/walk.test.mjs
 */

import assert from 'node:assert/strict';
import { TransitNetwork } from '../transit/js/network.js';
import {
  walkSettings,
  walkMinutes,
  accessCandidates,
  accessCombos,
  attachWalk,
  accessLegFrom,
  accessLegTo,
  isPoint,
  farWalk,
  WALK_DEFAULTS,
} from '../transit/js/walk.js';

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
const ST = (n) => `odpt.Station:TokyoMetro.Ginza.${n}`;

const NET = new TransitNetwork(
  {
    railways: [{ id: RW, title: '銀座線', operator: 'TokyoMetro', stations: [ST('Shibuya'), ST('Omotesando'), ST('Ueno')] }],
    stations: [
      { id: ST('Shibuya'), title: '渋谷', railway: RW, lat: 35.658, lon: 139.7016, connecting: [] },
      { id: ST('Omotesando'), title: '表参道', railway: RW, lat: 35.6652, lon: 139.7124, connecting: [] },
      { id: ST('Ueno'), title: '上野', railway: RW, lat: 35.7141, lon: 139.7774, connecting: [] },
    ],
    errors: [],
  },
  {}
);

const S = walkSettings({});

console.log('\n徒歩時間の見積り');
test('1km は迂回込みで 17 分', () => {
  // 1000m × 1.3 ÷ 80 = 16.25 → 切り上げて 17
  assert.equal(walkMinutes(1, S), 17);
});
test('0km でも最低 1 分は見る', () => {
  assert.equal(walkMinutes(0, S), 1);
});
test('端数は切り上げる(短く見せない)', () => {
  assert.equal(walkMinutes(0.5, S), 9); // 500×1.3÷80 = 8.125 → 9
});
test('config で分速と迂回係数を変えられる', () => {
  const fast = walkSettings({ walkSpeedMetersPerMinute: 100, walkDetourFactor: 1 });
  assert.equal(walkMinutes(1, fast), 10);
});
test('おかしな設定値は既定値に戻す', () => {
  const s = walkSettings({ walkSpeedMetersPerMinute: 0, walkDetourFactor: -1 });
  assert.equal(s.speedMetersPerMinute, WALK_DEFAULTS.speedMetersPerMinute);
  assert.equal(s.detourFactor, WALK_DEFAULTS.detourFactor);
});

console.log('\n最寄駅の候補');
const NEAR_SHIBUYA = { kind: 'point', lat: 35.659, lon: 139.703, label: '地図で指定した地点' };

test('近い順に候補を返す', () => {
  const c = accessCandidates(NEAR_SHIBUYA, NET, S);
  assert.equal(c[0].title, '渋谷');
  assert(c[0].minutes >= 1);
});
test('候補数の上限を守る', () => {
  const c = accessCandidates(NEAR_SHIBUYA, NET, walkSettings({ walkMaxCandidates: 1 }));
  assert.equal(c.length, 1);
});
test('既定では距離で候補を切り捨てない', () => {
  // 遠くても「徒歩◯分」と出すだけ。勝手に検索を止めない。
  const far = { kind: 'point', lat: 36.5, lon: 140.5, label: '遠い地点' };
  const c = accessCandidates(far, NET, S);
  assert(c.length >= 1, '遠いだけで候補を消してはいけない');
  assert(c[0].minutes > 60, `徒歩時間が短すぎる: ${c[0].minutes}`);
});

test('config で明示したときだけ距離で切る', () => {
  const far = { kind: 'point', lat: 36.5, lon: 140.5, label: '遠い地点' };
  assert.deepEqual(accessCandidates(far, NET, walkSettings({ walkMaxKm: 2 })), []);
});

test('既定の上限は無制限', () => {
  assert.equal(walkSettings({}).maxKm, Infinity);
});

test('遠い徒歩は注意の対象にするが候補は残す', () => {
  const far = { kind: 'point', lat: 36.5, lon: 140.5, label: '遠い地点' };
  const c = accessCandidates(far, NET, S);
  const w = farWalk(c, S);
  assert(w, '注意が出ていない');
  assert(w.minutes > S.farWarningMinutes);
});

test('近ければ注意は出さない', () => {
  const c = accessCandidates(NEAR_SHIBUYA, NET, S);
  assert.equal(farWalk(c, S), null);
});
test('座標が無ければ候補は空', () => {
  assert.deepEqual(accessCandidates({ kind: 'point', label: 'x' }, NET, S), []);
});

console.log('\n地点かどうかの判定');
test('緯度経度つきの point だけを地点とみなす', () => {
  assert.equal(isPoint(NEAR_SHIBUYA), true);
  assert.equal(isPoint({ groupId: 'g1', label: '渋谷' }), false);
  assert.equal(isPoint({ kind: 'point', label: 'x' }), false);
  assert.equal(isPoint(null), false);
});

console.log('\n検索の組み合わせ');
test('駅どうしなら組み合わせは 1 通り(徒歩なし)', () => {
  const combos = accessCombos({ groupId: 'g1', label: '渋谷' }, { groupId: 'g2', label: '上野' }, NET, S);
  assert.equal(combos.length, 1);
  assert.equal(combos[0].fromLeg, null);
  assert.equal(combos[0].toLeg, null);
});

test('出発が地点なら候補の数だけ組み合わせを作る', () => {
  const combos = accessCombos(NEAR_SHIBUYA, { groupId: ST('Ueno'), label: '上野' }, NET, S);
  assert(combos.length >= 1 && combos.length <= S.maxCandidates);
  assert(combos[0].fromLeg, '徒歩レグが付いていない');
  assert.equal(combos[0].toLeg, null);
});

test('徒歩が短い組み合わせから試す', () => {
  const combos = accessCombos(NEAR_SHIBUYA, { groupId: ST('Ueno'), label: '上野' }, NET, S);
  const mins = combos.map((c) => c.fromLeg.minutes);
  assert.deepEqual(mins, [...mins].sort((a, b) => a - b));
});

test('組み合わせの上限を超えない(通信量の歯止め)', () => {
  const combos = accessCombos(NEAR_SHIBUYA, { kind: 'point', lat: 35.7143, lon: 139.777, label: '目的地' }, NET, S, 3);
  assert(combos.length <= 3, `組み合わせが多すぎる: ${combos.length}`);
});

test('同じ駅に歩いて戻るだけの組み合わせは作らない', () => {
  const a = { kind: 'point', lat: 35.658, lon: 139.7016, label: 'A' };
  const b = { kind: 'point', lat: 35.6581, lon: 139.7017, label: 'B' };
  const combos = accessCombos(a, b, NET, walkSettings({ walkMaxCandidates: 1 }));
  assert.equal(combos.length, 0);
});

test('遠くても組み合わせは作る(勝手に諦めない)', () => {
  const far = { kind: 'point', lat: 36.5, lon: 140.5, label: '遠い地点' };
  const combos = accessCombos(far, { groupId: ST('Ueno'), label: '上野' }, NET, S);
  assert(combos.length >= 1, '遠いだけで検索を諦めてはいけない');
});

test('対応範囲に駅が 1 つも無ければ組み合わせは作れない', () => {
  const empty = new TransitNetwork({ railways: [], stations: [], errors: [] }, {});
  const p = { kind: 'point', lat: 35.66, lon: 139.7, label: 'どこか' };
  assert.deepEqual(accessCombos(p, { groupId: 'g', label: 'x' }, empty, S), []);
});

console.log('\n徒歩を足した経路');
const BASE = {
  departure: 550,
  arrival: 580,
  rideMinutes: 30,
  transfers: 0,
  waitMinutes: 2,
  legs: [{ railway: RW, from: ST('Shibuya'), to: ST('Ueno'), departure: 550, arrival: 580, stops: 2 }],
};

test('出発側の徒歩は出発時刻を前に戻す', () => {
  const leg = accessLegFrom(NEAR_SHIBUYA, { groupId: ST('Shibuya'), title: '渋谷', km: 0.3, minutes: 5 });
  const r = attachWalk(BASE, leg, null);
  assert.equal(r.departure, 545, '地点を出る時刻になっていない');
  assert.equal(r.arrival, 580);
  assert.equal(r.rideMinutes, 35, '徒歩を含む通し時間になっていない');
  assert.equal(r.legs[0].walkAccess, true);
});

test('到着側の徒歩は到着時刻を後ろにずらす', () => {
  const leg = accessLegTo({ label: '目的地' }, { groupId: ST('Ueno'), title: '上野', km: 0.4, minutes: 7 });
  const r = attachWalk(BASE, null, leg);
  assert.equal(r.departure, 550);
  assert.equal(r.arrival, 587);
  assert.equal(r.legs[r.legs.length - 1].walkAccess, true);
});

test('両側に徒歩を足せる', () => {
  const f = accessLegFrom(NEAR_SHIBUYA, { groupId: ST('Shibuya'), title: '渋谷', km: 0.3, minutes: 5 });
  const t = accessLegTo({ label: '目的地' }, { groupId: ST('Ueno'), title: '上野', km: 0.4, minutes: 7 });
  const r = attachWalk(BASE, f, t);
  assert.equal(r.departure, 545);
  assert.equal(r.arrival, 587);
  assert.equal(r.walkMinutes, 12);
  assert.equal(r.legs.length, 3);
});

test('徒歩が無ければ経路をそのまま返す', () => {
  assert.equal(attachWalk(BASE, null, null), BASE);
});

test('徒歩レグは必ず推定と判るようにする', () => {
  const leg = accessLegFrom(NEAR_SHIBUYA, { groupId: ST('Shibuya'), title: '渋谷', km: 0.3, minutes: 5 });
  assert.equal(leg.estimated, true);
  assert.equal(leg.km, 0.3);
});

console.log(`\n${passed} 件のテストが成功${process.exitCode ? '(失敗あり)' : ''}\n`);
