/**
 * 到着時刻から逆向きに探すテスト
 *   node tests/arrive.test.mjs
 *
 * 「○時までに着きたい」は前向きの探索では答えが出ない。
 * 前向きに解くと「指定時刻以降でいちばん早く着く便」になり、
 * もっと遅く出ても間に合うのに早い便を出してしまう。
 *
 * ここで固定するのは次の 3 点。
 *   1. 締切までに着く便のうち、いちばん遅く出るものを選ぶ
 *   2. 締切を 1 分でも過ぎる便は選ばない
 *   3. 乗り換えの時間ぶん、1 つ前の区間の締切が早まる
 *
 * ODPT は呼ばない。時刻表を返す偽の api を渡して、選び方だけを見る。
 */

import assert from 'node:assert/strict';
import { bindScheduleBackward } from '../transit/js/router.js';

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

const net = {
  stationTitle: (id) => String(id),
  directionFor: () => null,
  config: { hopMinutes: {}, defaultHopMinutes: 3 },
};

/**
 * 偽の api。
 * @param {Array} trains [{id, from, dep, to, arr, railway}]
 */
function fakeApi(trains, { dropTrainTimetable = false } = {}) {
  const calls = { timetables: 0, trains: 0 };
  const byStation = new Map();
  for (const t of trains) {
    if (!byStation.has(t.from)) byStation.set(t.from, []);
    byStation.get(t.from).push(t);
  }
  return {
    calls,
    async timetables(stations) {
      calls.timetables += 1;
      const timetables = [];
      for (const st of stations) {
        for (const t of byStation.get(st) || []) {
          let tt = timetables.find((x) => x.station === st && x.railway === t.railway);
          if (!tt) {
            tt = { station: st, railway: t.railway, calendar: 'odpt.Calendar:Weekday', direction: null, rows: [] };
            timetables.push(tt);
          }
          tt.rows.push({ time: hhmm(t.dep), train: dropTrainTimetable ? null : t.id, no: t.id, type: null, dest: [t.to] });
        }
      }
      return { fetchedAt: '2026-10-21T10:00:00Z', data: { timetables, errors: [] } };
    },
    async trains(ids) {
      calls.trains += 1;
      const out = [];
      for (const id of ids) {
        const t = trains.find((x) => x.id === id);
        if (!t) continue;
        out.push({
          id: t.id, no: t.id, type: null, dest: [t.to],
          stops: [
            { depSt: t.from, dep: hhmm(t.dep) },
            { arrSt: t.to, arr: hhmm(t.arr) },
          ],
        });
      }
      return { fetchedAt: '2026-10-21T10:00:00Z', data: { trains: out } };
    },
  };
}

const ride = (railway, from, to, stops = 3) => ({ railway, from, to, stops });
const route = (legs) => ({ id: legs.map((l) => l.from + '>' + l.to).join('|'), legs, rideLegs: legs.filter((l) => !l.transfer), transfers: legs.filter((l) => l.transfer).length });
const stores = () => ({ timetables: new Map(), trains: new Map() });

/* ------------------------------------------------------------------ *
 *  1 区間
 * ------------------------------------------------------------------ */

await test('締切までに着く便のうち、いちばん遅く出るものを選ぶ', async () => {
  const api = fakeApi([
    { id: 'a', railway: 'L', from: 'A', to: 'B', dep: T('09:00'), arr: T('09:30') },
    { id: 'b', railway: 'L', from: 'A', to: 'B', dep: T('09:20'), arr: T('09:50') },
    { id: 'c', railway: 'L', from: 'A', to: 'B', dep: T('09:40'), arr: T('10:10') }, // 間に合わない
  ]);
  const res = await bindScheduleBackward([route([ride('L', 'A', 'B')])], {
    api, net, calendarUrn: 'odpt.Calendar:Weekday', arriveBy: T('10:00'), stores: stores(),
  });
  assert.equal(res.routes.length, 1);
  assert.equal(hhmm(res.routes[0].departure), '09:20', '9:00 発ではなく 9:20 発を選ぶ');
  assert.equal(hhmm(res.routes[0].arrival), '09:50');
});

await test('締切を過ぎる便しか無ければ、その経路は出さない', async () => {
  const api = fakeApi([
    { id: 'c', railway: 'L', from: 'A', to: 'B', dep: T('09:40'), arr: T('10:10') },
  ]);
  const res = await bindScheduleBackward([route([ride('L', 'A', 'B')])], {
    api, net, calendarUrn: 'odpt.Calendar:Weekday', arriveBy: T('10:00'), stores: stores(),
  });
  assert.equal(res.routes.length, 0, '間に合わないものを「間に合う」と出さない');
});

await test('締切ちょうどに着く便は使う', async () => {
  const api = fakeApi([
    { id: 'a', railway: 'L', from: 'A', to: 'B', dep: T('09:30'), arr: T('10:00') },
  ]);
  const res = await bindScheduleBackward([route([ride('L', 'A', 'B')])], {
    api, net, calendarUrn: 'odpt.Calendar:Weekday', arriveBy: T('10:00'), stores: stores(),
  });
  assert.equal(res.routes.length, 1);
  assert.equal(hhmm(res.routes[0].arrival), '10:00');
});

await test('着いてから締切までの余裕を slackMinutes に入れる', async () => {
  const api = fakeApi([
    { id: 'a', railway: 'L', from: 'A', to: 'B', dep: T('09:00'), arr: T('09:45') },
  ]);
  const res = await bindScheduleBackward([route([ride('L', 'A', 'B')])], {
    api, net, calendarUrn: 'odpt.Calendar:Weekday', arriveBy: T('10:00'), stores: stores(),
  });
  assert.equal(res.routes[0].slackMinutes, 15);
  assert.equal(res.routes[0].waitMinutes, 0, '前向きの「待ち」は逆向きには存在しない');
});

/* ------------------------------------------------------------------ *
 *  乗り換えをはさむ
 * ------------------------------------------------------------------ */

await test('乗り換えの時間ぶん、1 つ前の区間の締切が早まる', async () => {
  const api = fakeApi([
    // B → C。10:00 までに着くのは 9:40 発
    { id: 'y1', railway: 'M', from: 'B', to: 'C', dep: T('09:40'), arr: T('09:55') },
    { id: 'y2', railway: 'M', from: 'B', to: 'C', dep: T('09:50'), arr: T('10:05') },
    // A → B。乗り換え 5 分なので 9:35 までに B へ着く必要がある
    { id: 'x1', railway: 'L', from: 'A', to: 'B', dep: T('09:00'), arr: T('09:30') },
    { id: 'x2', railway: 'L', from: 'A', to: 'B', dep: T('09:10'), arr: T('09:40') }, // 5 分前に間に合わない
  ]);
  const legs = [ride('L', 'A', 'B'), { transfer: true, kind: 'transfer', from: 'B', to: 'B', minutes: 5 }, ride('M', 'B', 'C')];
  const res = await bindScheduleBackward([route(legs)], {
    api, net, calendarUrn: 'odpt.Calendar:Weekday', arriveBy: T('10:00'), stores: stores(),
  });
  assert.equal(res.routes.length, 1);
  const r = res.routes[0];
  assert.equal(hhmm(r.departure), '09:00', '乗り換えに間に合う 9:00 発を選ぶ');
  assert.equal(hhmm(r.arrival), '09:55');
});

await test('前の区間の到着が、次の区間の出発を追い越さない', async () => {
  const api = fakeApi([
    { id: 'y1', railway: 'M', from: 'B', to: 'C', dep: T('09:40'), arr: T('09:55') },
    { id: 'x1', railway: 'L', from: 'A', to: 'B', dep: T('09:00'), arr: T('09:30') },
  ]);
  const legs = [ride('L', 'A', 'B'), { transfer: true, kind: 'transfer', from: 'B', to: 'B', minutes: 5 }, ride('M', 'B', 'C')];
  const res = await bindScheduleBackward([route(legs)], {
    api, net, calendarUrn: 'odpt.Calendar:Weekday', arriveBy: T('10:00'), stores: stores(),
  });
  const rides = res.routes[0].legs.filter((l) => !l.transfer);
  assert.ok(rides[0].arrival + 5 <= rides[1].departure, `${hhmm(rides[0].arrival)} 着 → ${hhmm(rides[1].departure)} 発`);
});

await test('乗り換えレグにも時刻が入る', async () => {
  const api = fakeApi([
    { id: 'y1', railway: 'M', from: 'B', to: 'C', dep: T('09:40'), arr: T('09:55') },
    { id: 'x1', railway: 'L', from: 'A', to: 'B', dep: T('09:00'), arr: T('09:30') },
  ]);
  const legs = [ride('L', 'A', 'B'), { transfer: true, kind: 'transfer', from: 'B', to: 'B', minutes: 5 }, ride('M', 'B', 'C')];
  const res = await bindScheduleBackward([route(legs)], {
    api, net, calendarUrn: 'odpt.Calendar:Weekday', arriveBy: T('10:00'), stores: stores(),
  });
  const tr = res.routes[0].legs.find((l) => l.transfer);
  assert.ok(Number.isFinite(tr.at), '乗り換えの時刻が入っていない');
});

/* ------------------------------------------------------------------ *
 *  列車時刻表が引けないとき
 * ------------------------------------------------------------------ */

await test('列車時刻表が無いときは駅数から推定し、推定でも締切を守る', async () => {
  // 既定 3 分/駅 × 4 駅 = 12 分。9:50 発は 10:02 着になるので使えない。
  const api = fakeApi([
    { id: 'a', railway: 'L', from: 'A', to: 'B', dep: T('09:30'), arr: 0 },
    { id: 'b', railway: 'L', from: 'A', to: 'B', dep: T('09:50'), arr: 0 },
  ], { dropTrainTimetable: true });
  const res = await bindScheduleBackward([route([ride('L', 'A', 'B', 4)])], {
    api, net, calendarUrn: 'odpt.Calendar:Weekday', arriveBy: T('10:00'), stores: stores(),
  });
  assert.equal(res.routes.length, 1);
  assert.equal(hhmm(res.routes[0].departure), '09:30');
  assert.equal(res.routes[0].estimatedOnly, true, '推定したことを隠さない');
});

/* ------------------------------------------------------------------ *
 *  並び順
 * ------------------------------------------------------------------ */

await test('いちばん遅く出られる案を先頭にする', async () => {
  const api = fakeApi([
    { id: 'p', railway: 'L', from: 'A', to: 'B', dep: T('09:00'), arr: T('09:30') },
    { id: 'q', railway: 'M', from: 'A', to: 'B', dep: T('09:25'), arr: T('09:55') },
  ]);
  const res = await bindScheduleBackward([route([ride('L', 'A', 'B')]), route([ride('M', 'A', 'B')])], {
    api, net, calendarUrn: 'odpt.Calendar:Weekday', arriveBy: T('10:00'), stores: stores(),
  });
  assert.equal(res.routes.length, 2);
  assert.equal(hhmm(res.routes[0].departure), '09:25');
});

await test('時刻表が空でも落ちない', async () => {
  const api = fakeApi([]);
  const res = await bindScheduleBackward([route([ride('L', 'A', 'B')])], {
    api, net, calendarUrn: 'odpt.Calendar:Weekday', arriveBy: T('10:00'), stores: stores(),
  });
  assert.equal(res.routes.length, 0);
  assert.ok(Array.isArray(res.warnings));
});

await test('同じ駅の時刻表を 2 度取りに行かない', async () => {
  const api = fakeApi([
    { id: 'a', railway: 'L', from: 'A', to: 'B', dep: T('09:00'), arr: T('09:30') },
    { id: 'b', railway: 'M', from: 'A', to: 'B', dep: T('09:10'), arr: T('09:40') },
  ]);
  const st = stores();
  await bindScheduleBackward([route([ride('L', 'A', 'B')]), route([ride('M', 'A', 'B')])], {
    api, net, calendarUrn: 'odpt.Calendar:Weekday', arriveBy: T('10:00'), stores: st,
  });
  assert.equal(api.calls.timetables, 1, '駅 A は 1 回だけ');
});

console.log(`\n${passed} 件のテストが成功`);
