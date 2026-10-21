/**
 * 「1 本前 / 1 本後」のテスト
 *   node tests/shift.test.mjs
 *
 * 2 とおりある。
 *   ・比較の画面 … 全体をずらす(最も早い出発時刻を基準に取り直す)
 *   ・選んだ案   … その経路だけ、1 本前/後の列車で組み直す
 *
 * 【1 本前がややこしい理由】
 * 後ろ向きの探索をそのまま使うと、**終点側の時刻が動く**。
 * 逆向きは「締切までに着く中でいちばん遅い便」を選ぶので、
 * 経路全体が後ろへ寄ってしまい「1 本前」にならない。
 *
 * そこで 2 段階にする。
 *   1. 最初の区間だけ逆向きに引いて、1 本前の発車時刻を出す
 *   2. その時刻から先は前向きに引き直す
 *
 * ここでは下ごしらえ(shift.js)と、その 2 段階が実際に 1 本前になることを見る。
 */

import assert from 'node:assert/strict';
import { firstRide, canShiftRoute, splitForShift } from '../transit/js/shift.js';
import { bindSchedule, bindScheduleBackward } from '../transit/js/router.js';

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
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
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const ride = (railway, from, to, dep, arr, stops = 3) => ({
  railway, from, to, fromTitle: from, toTitle: to, stops,
  departure: dep == null ? undefined : T(dep), arrival: arr == null ? undefined : T(arr),
});
const walkLeg = (side, a, b, minutes) => ({ walkAccess: true, kind: 'walk', side, fromTitle: a, toTitle: b, minutes });
const transferLeg = (minutes) => ({ transfer: true, kind: 'walk', from: 'B', to: 'B', minutes });

/* ------------------------------------------------------------------ *
 *  下ごしらえ
 * ------------------------------------------------------------------ */

await test('最初の乗車レグを見つける(先頭の徒歩は乗り物ではない)', () => {
  const route = { legs: [walkLeg('from', '現在地', 'A', 10), ride('L', 'A', 'B', '10:10', '10:40')] };
  assert.equal(firstRide(route).railway, 'L');
});

await test('時刻の入っていないレグは最初の乗車とみなさない', () => {
  const route = { legs: [{ railway: 'L', from: 'A', to: 'B' }, ride('M', 'B', 'C', '10:10', '10:40')] };
  assert.equal(firstRide(route).railway, 'M');
});

await test('乗り物が無ければ null', () => {
  assert.equal(firstRide({ legs: [walkLeg('from', 'A', 'B', 10)] }), null);
  assert.equal(firstRide(null), null);
});

await test('鉄道の経路はずらせる', () => {
  const route = { kind: 'rail', legs: [ride('L', 'A', 'B', '10:00', '10:30')] };
  assert.equal(canShiftRoute(route), true);
});

await test('経由地つきはずらせない(区間ごとに引き直す必要がある)', () => {
  const route = { kind: 'rail', viaCount: 1, legs: [ride('L', 'A', 'B', '10:00', '10:30')] };
  assert.equal(canShiftRoute(route), false);
});

await test('バス・バス+鉄道・徒歩のみはずらせない', () => {
  const legs = [ride('L', 'A', 'B', '10:00', '10:30')];
  assert.equal(canShiftRoute({ kind: 'bus', legs }), false);
  assert.equal(canShiftRoute({ kind: 'mixed', legs }), false);
  assert.equal(canShiftRoute({ kind: 'rail', walkOnly: true, legs }), false);
  assert.equal(canShiftRoute({ kind: 'rail', source: 'gtfs', legs }), false);
});

await test('両端の徒歩を外して本体だけにする', () => {
  const route = { legs: [
    walkLeg('from', '現在地', 'A', 10),
    ride('L', 'A', 'B', '10:10', '10:40'),
    transferLeg(5),
    ride('M', 'B', 'C', '10:45', '11:00'),
    walkLeg('to', 'C', '目的地', 8),
  ] };
  const { fromLeg, toLeg, core, rideLegs } = splitForShift(route);
  assert.equal(fromLeg.minutes, 10);
  assert.equal(toLeg.minutes, 8);
  assert.equal(core.length, 3, '乗車 2 + 乗り換え 1');
  assert.equal(rideLegs.length, 2);
  assert.ok(!core.some((l) => l.walkAccess), '徒歩が残っている');
});

/* ------------------------------------------------------------------ *
 *  実際に 1 本ずれるか
 * ------------------------------------------------------------------ */

const net = {
  stationTitle: (id) => String(id),
  directionFor: () => null,
  config: { hopMinutes: {}, defaultHopMinutes: 3 },
};

function fakeApi(trains) {
  const byStation = new Map();
  for (const t of trains) {
    if (!byStation.has(t.from)) byStation.set(t.from, []);
    byStation.get(t.from).push(t);
  }
  return {
    async timetables(stations) {
      const timetables = [];
      for (const st of stations) {
        for (const t of byStation.get(st) || []) {
          let tt = timetables.find((x) => x.station === st && x.railway === t.railway);
          if (!tt) {
            tt = { station: st, railway: t.railway, calendar: 'odpt.Calendar:Weekday', direction: null, rows: [] };
            timetables.push(tt);
          }
          tt.rows.push({ time: hhmm(t.dep), train: t.id, no: t.id, type: null, dest: [t.to] });
        }
      }
      return { fetchedAt: null, data: { timetables, errors: [] } };
    },
    async trains(ids) {
      const out = [];
      for (const id of ids) {
        const t = trains.find((x) => x.id === id);
        if (!t) continue;
        out.push({ id: t.id, no: t.id, type: null, dest: [t.to],
          stops: [{ depSt: t.from, dep: hhmm(t.dep) }, { arrSt: t.to, arr: hhmm(t.arr) }] });
      }
      return { fetchedAt: null, data: { trains: out } };
    },
  };
}

/** A→B 10 分間隔、B→C 10 分間隔 */
const TRAINS = [
  ...[0, 10, 20, 30, 40].map((m) => ({ id: `x${m}`, railway: 'L', from: 'A', to: 'B', dep: T('10:00') + m, arr: T('10:20') + m })),
  ...[0, 10, 20, 30, 40, 50].map((m) => ({ id: `y${m}`, railway: 'M', from: 'B', to: 'C', dep: T('10:25') + m, arr: T('10:45') + m })),
];
const CORE = [
  { railway: 'L', from: 'A', to: 'B', stops: 3 },
  { transfer: true, kind: 'transfer', from: 'B', to: 'B', minutes: 4 },
  { railway: 'M', from: 'B', to: 'C', stops: 3 },
];
const candidate = () => ({ id: 'r', legs: CORE.map((l) => ({ ...l })), rideLegs: CORE.filter((l) => !l.transfer).map((l) => ({ ...l })), transfers: 1 });
const opts = () => ({ api: fakeApi(TRAINS), net, calendarUrn: 'odpt.Calendar:Weekday', stores: { timetables: new Map(), trains: new Map() } });

await test('1 本後 = 最初の発車時刻 + 1 分から引き直す', async () => {
  const base = await bindSchedule([candidate()], { ...opts(), departAt: T('10:00') });
  assert.equal(hhmm(base.routes[0].departure), '10:00');
  const first = base.routes[0].legs.find((l) => !l.transfer);
  const next = await bindSchedule([candidate()], { ...opts(), departAt: first.departure + 1 });
  assert.equal(hhmm(next.routes[0].departure), '10:10', '1 本後の便に乗る');
});

await test('1 本前 = 最初の区間だけ逆向き → そこから前向きに引き直す', async () => {
  const base = await bindSchedule([candidate()], { ...opts(), departAt: T('10:20') });
  const first = base.routes[0].legs.find((l) => !l.transfer);
  assert.equal(hhmm(first.departure), '10:20');

  // 1 段階目: 最初の区間だけ「その到着より前に着く最後の便」
  const head = { id: 'h', legs: [{ ...CORE[0] }], rideLegs: [{ ...CORE[0] }], transfers: 0 };
  const back = await bindScheduleBackward([head], { ...opts(), arriveBy: first.arrival - 1 });
  assert.equal(hhmm(back.routes[0].departure), '10:10', '1 本前の発車時刻');

  // 2 段階目: そこから前向きに全体を引き直す
  const prev = await bindSchedule([candidate()], { ...opts(), departAt: back.routes[0].departure });
  assert.equal(hhmm(prev.routes[0].departure), '10:10');
  assert.ok(prev.routes[0].arrival <= base.routes[0].arrival, '終点も前にずれる(後ろへ動かない)');
});

await test('後ろ向きのまま引き直すと「1 本前」にならない(2 段階にした理由)', async () => {
  const base = await bindSchedule([candidate()], { ...opts(), departAt: T('10:20') });
  const first = base.routes[0].legs.find((l) => !l.transfer);
  // 経路全体を逆向きに引くと、終点の締切に合わせて後ろへ寄る
  const whole = await bindScheduleBackward([candidate()], { ...opts(), arriveBy: first.arrival - 1 });
  if (whole.routes.length) {
    assert.ok(hhmm(whole.routes[0].departure) !== '10:10' || whole.routes[0].arrival !== base.routes[0].arrival - 1,
      '全体を逆向きに引いても 1 本前と同じにはならない');
  }
});

await test('端まで来たら 1 本前は出ない', async () => {
  const base = await bindSchedule([candidate()], { ...opts(), departAt: T('10:00') });
  const first = base.routes[0].legs.find((l) => !l.transfer);
  const head = { id: 'h', legs: [{ ...CORE[0] }], rideLegs: [{ ...CORE[0] }], transfers: 0 };
  const back = await bindScheduleBackward([head], { ...opts(), arriveBy: first.arrival - 1 });
  assert.equal(back.routes.length, 0, 'これより前の便は無い');
});

await test('端まで来たら 1 本後も出ない', async () => {
  const base = await bindSchedule([candidate()], { ...opts(), departAt: T('10:40') });
  const first = base.routes[0].legs.find((l) => !l.transfer);
  const next = await bindSchedule([candidate()], { ...opts(), departAt: first.departure + 1 });
  assert.equal(next.routes.length, 0, 'これより後の便は無い');
});

console.log(`\n${passed} 件のテストが成功`);
