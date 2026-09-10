/**
 * バス経路探索のユニットテスト(モック API)
 *   node tests/bus.test.mjs
 *
 * 確認すること:
 *   - 両端のバス停が同じ系統にあるとき、直通便を実時刻つきで出せる
 *   - 逆方向(到着が出発より手前)は候補にしない
 *   - 共通の系統が無ければ 0 件(通信も最小限)
 *   - その日に適用されないダイヤの便を拾わない
 *   - 便別時刻が取れないときは推定にフォールバックし、そう明示する
 *   - サブリクエスト予算を守る(1 検索で Worker 5 リクエスト以内)
 */

import assert from 'node:assert/strict';
import { findBusRoutes, busStopNameCandidates } from '../transit/js/bus.js';

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

/* ================================================================== *
 *  モックデータ
 *   渋８８: 渋谷駅前 → 六本木通り → 新橋駅前
 * ================================================================== */

const P1 = 'odpt.BusroutePattern:Toei.Shibu88.8206.1';
const P_REV = 'odpt.BusroutePattern:Toei.Shibu88.8206.2'; // 逆方向
const POLE_SHIBUYA = 'odpt.BusstopPole:Toei.ShibuyaStation.636.1';
const POLE_MID = 'odpt.BusstopPole:Toei.RoppongiDori.700.1';
const POLE_SHIMBASHI = 'odpt.BusstopPole:Toei.ShimbashiStation.737.2';
const CAL = 'odpt.Calendar:Specific.Toei.09-100';
const OTHER_CAL = 'odpt.Calendar:Specific.Toei.09-999';

const SERVICE_DATE = new Date(2026, 8, 2); // 2026-09-02
const DATE_KEY = '2026-09-02';

const STOPS = {
  渋谷駅前: [{ id: POLE_SHIBUYA, title: '渋谷駅前', operator: 'Toei', lat: 35.6585, lon: 139.7002, patterns: [P1] }],
  新橋駅前: [{ id: POLE_SHIMBASHI, title: '新橋駅前', operator: 'Toei', lat: 35.6665, lon: 139.7583, patterns: [P1, P_REV] }],
};

const PATTERN = {
  id: P1,
  title: '渋８８ 新橋駅前行',
  busroute: 'odpt.Busroute:Toei.Shibu88',
  direction: '1',
  operator: 'Toei',
  order: [
    { i: 1, pole: POLE_SHIBUYA, note: '渋谷駅前' },
    { i: 2, pole: POLE_MID, note: '六本木通り' },
    { i: 3, pole: POLE_SHIMBASHI, note: '新橋駅前' },
  ],
};

const TIMETABLE = {
  id: 'tt1',
  pole: POLE_SHIBUYA,
  calendar: CAL,
  operator: 'Toei',
  rows: [
    { time: '09:00', pattern: P1, destPole: POLE_SHIMBASHI, destSign: '新橋駅前', order: 1, isMidnight: false },
    { time: '09:20', pattern: P1, destPole: POLE_SHIMBASHI, destSign: '新橋駅前', order: 1, isMidnight: false },
  ],
};

const RUN = {
  id: 'run1',
  pattern: P1,
  calendar: CAL,
  operator: 'Toei',
  stops: [
    { i: 1, pole: POLE_SHIBUYA, arr: '09:00', dep: '09:00' },
    { i: 2, pole: POLE_MID, arr: '09:12', dep: '09:12' },
    { i: 3, pole: POLE_SHIMBASHI, arr: '09:28', dep: '09:28' },
  ],
};

const CALENDARS = [
  { id: CAL, title: '平日', operator: 'Toei', days: ['2026-09-01', DATE_KEY, '2026-09-03'] },
  { id: OTHER_CAL, title: '休日', operator: 'Toei', days: ['2026-09-05', '2026-09-06'] },
];

function mockApi(overrides = {}, counters = {}) {
  counters.calls = 0;
  const wrap = (fn) => async (...args) => {
    counters.calls += 1;
    return fn(...args);
  };
  return {
    busStops: wrap(async (names) => {
      const stops = [];
      for (const n of names) for (const s of STOPS[n] || []) stops.push({ ...s, query: n });
      return { data: { stops, errors: [] }, fetchedAt: '2026-09-02T09:00:00+09:00' };
    }),
    busPatterns: wrap(async (ids) => ({
      data: { patterns: ids.includes(P1) ? [PATTERN] : [], errors: [] },
      fetchedAt: null,
    })),
    busCalendars: wrap(async () => ({ data: { calendars: CALENDARS, errors: [] }, fetchedAt: null })),
    busTimetables: wrap(async () => ({ data: { timetables: [TIMETABLE], errors: [] }, fetchedAt: null })),
    busRuns: wrap(async () => ({ data: { runs: [RUN], errors: [] }, fetchedAt: null })),
    ...overrides,
  };
}

const opts = () => ({ departAt: 8 * 60 + 45, serviceDate: SERVICE_DATE, store: {} });

/* ================================================================== */
console.log('\nバス停名の候補');
await test('駅名からバス停名の候補を作れる', () => {
  const c = busStopNameCandidates('渋谷');
  assert(c.includes('渋谷'));
  assert(c.includes('渋谷駅前'));
  const d = busStopNameCandidates('渋谷駅');
  assert(d.includes('渋谷駅前'));
  assert(d.includes('渋谷'));
  assert.deepEqual(busStopNameCandidates('  '), []);
});

console.log('\n直通バスの探索');
await test('同じ系統上にある区間を実時刻つきで返す', async () => {
  const c = {};
  const res = await findBusRoutes(mockApi({}, c), '渋谷', '新橋', opts());
  assert.equal(res.routes.length, 1, `件数が想定と違う: ${res.routes.length}`);
  const r = res.routes[0];
  assert.equal(r.kind, 'bus');
  assert.equal(r.transfers, 0);
  assert.equal(r.departure, 9 * 60 + 0);
  assert.equal(r.arrival, 9 * 60 + 28);
  assert.equal(r.rideMinutes, 28);
  assert.equal(r.waitMinutes, 15);
  assert.equal(r.estimatedOnly, false);
  const leg = r.legs[0];
  assert.equal(leg.bus, true);
  assert.equal(leg.fromTitle, '渋谷駅前');
  assert.equal(leg.toTitle, '新橋駅前');
  assert.equal(leg.stops, 2);
  assert.equal(leg.lineTitle, '渋８８ 新橋駅前行');
});

await test('1 検索の Worker リクエストは 5 回以内', async () => {
  const c = {};
  await findBusRoutes(mockApi({}, c), '渋谷', '新橋', opts());
  assert(c.calls <= 5, `リクエストが多すぎる: ${c.calls}`);
  console.log(`       (Worker リクエスト ${c.calls} 回)`);
});

await test('逆方向(到着が出発より手前)は候補にしない', async () => {
  const c = {};
  const res = await findBusRoutes(mockApi({}, c), '新橋', '渋谷', opts());
  assert.equal(res.routes.length, 0);
});

await test('共通の系統が無ければ 0 件、系統の取得もしない', async () => {
  const c = {};
  let patternCalls = 0;
  const api = mockApi(
    {
      busStops: async (names) => {
        const stops = [];
        for (const n of names) {
          if (n === '渋谷' || n === '渋谷駅前') stops.push({ id: POLE_SHIBUYA, title: '渋谷駅前', patterns: [P1], query: n });
          if (n === '練馬' || n === '練馬駅前') stops.push({ id: 'odpt.BusstopPole:Toei.Nerima.1.1', title: '練馬駅前', patterns: ['odpt.BusroutePattern:Toei.Other.1.1'], query: n });
        }
        return { data: { stops, errors: [] }, fetchedAt: null };
      },
      busPatterns: async (ids) => {
        patternCalls += 1;
        return { data: { patterns: [], errors: [] }, fetchedAt: null };
      },
    },
    c
  );
  const res = await findBusRoutes(api, '渋谷', '練馬', opts());
  assert.equal(res.routes.length, 0);
  assert.equal(patternCalls, 0, '共通系統が無いのに系統を取得している');
  assert.equal(res.searched, true);
});

await test('その日に適用されないダイヤの便は拾わない', async () => {
  const c = {};
  // バス停時刻表も便別時刻表も、その日に適用されないカレンダーにする
  const api = mockApi(
    {
      busTimetables: async () => ({ data: { timetables: [{ ...TIMETABLE, calendar: OTHER_CAL }], errors: [] }, fetchedAt: null }),
      busRuns: async () => ({ data: { runs: [{ ...RUN, calendar: OTHER_CAL }], errors: [] }, fetchedAt: null }),
    },
    c
  );
  const res = await findBusRoutes(api, '渋谷', '新橋', opts());
  assert.equal(res.routes.length, 0, '別カレンダーの便を拾っている');
});

await test('バス停時刻表が無い事業者でも、便別時刻表から発車時刻を復元する', async () => {
  const c = {};
  // 西武バス・相鉄バス・横浜市営バス・神奈中はバス停時刻表を出していない
  const api = mockApi({ busTimetables: async () => ({ data: { timetables: [], errors: [] }, fetchedAt: null }) }, c);
  const res = await findBusRoutes(api, '渋谷', '新橋', opts());
  assert.equal(res.routes.length, 1, 'バス停時刻表が無いと経路が出せていない');
  const r = res.routes[0];
  assert.equal(r.departure, 9 * 60 + 0);
  assert.equal(r.arrival, 9 * 60 + 28);
  assert.equal(r.estimatedOnly, false, '実時刻が使われていない');
});

await test('出発時刻より前の便は拾わない', async () => {
  const c = {};
  const res = await findBusRoutes(mockApi({}, c), '渋谷', '新橋', {
    ...opts(),
    departAt: 9 * 60 + 10, // 09:00 の便は過ぎている
  });
  assert.equal(res.routes.length, 1);
  assert.equal(res.routes[0].departure, 9 * 60 + 20);
});

await test('便別時刻が取れないときは推定にフォールバックし、そう明示する', async () => {
  const c = {};
  const api = mockApi({ busRuns: async () => ({ data: { runs: [], errors: [] }, fetchedAt: null }) }, c);
  const res = await findBusRoutes(api, '渋谷', '新橋', opts());
  assert.equal(res.routes.length, 1);
  assert.equal(res.routes[0].estimatedOnly, true);
  assert.equal(res.routes[0].legs[0].estimated, true);
  assert(res.routes[0].arrival > res.routes[0].departure);
});

await test('バス停の取得に失敗しても例外を投げず、警告で返す', async () => {
  const c = {};
  const api = mockApi({ busStops: async () => { throw new Error('boom'); } }, c);
  const res = await findBusRoutes(api, '渋谷', '新橋', opts());
  assert.equal(res.routes.length, 0);
  assert(res.warnings.some((w) => w.code === 'BUS_UNAVAILABLE'));
});

await test('カレンダーはセッション中に使い回す', async () => {
  const c = {};
  let calendarCalls = 0;
  const api = mockApi(
    {
      busCalendars: async () => {
        calendarCalls += 1;
        return { data: { calendars: CALENDARS, errors: [] }, fetchedAt: null };
      },
    },
    c
  );
  const store = {};
  await findBusRoutes(api, '渋谷', '新橋', { ...opts(), store });
  await findBusRoutes(api, '渋谷', '新橋', { ...opts(), store });
  assert.equal(calendarCalls, 1, `カレンダーを毎回取得している: ${calendarCalls}`);
});



/* ================================================================== *
 *  バス ⇄ 鉄道 の乗り継ぎ
 * ================================================================== */
console.log('\nバスと鉄道の乗り継ぎ');

const { TransitNetwork } = await import('../transit/js/network.js');
const { findIntermodalRoutes, busStopToStationName, stationGroupForBusStop } = await import('../transit/js/bus.js');

const RW = 'odpt.Railway:TokyoMetro.LineA';
const ST = (n) => `odpt.Station:TokyoMetro.LineA.${n}`;
const NET = new TransitNetwork(
  {
    fetchedAt: null,
    operators: [{ id: 'TokyoMetro', title: '東京メトロ' }],
    railways: [
      {
        id: RW,
        title: 'A線',
        operator: 'TokyoMetro',
        ascending: 'odpt.RailDirection:TokyoMetro.East',
        descending: 'odpt.RailDirection:TokyoMetro.West',
        stations: [ST('Chuo'), ST('Higashi'), ST('Minato')],
      },
    ],
    stations: [
      { id: ST('Chuo'), title: '中央', railway: RW, operator: 'TokyoMetro', lat: 35.68, lon: 139.75, connecting: [] },
      { id: ST('Higashi'), title: '東橋', railway: RW, operator: 'TokyoMetro', lat: 35.69, lon: 139.78, connecting: [] },
      { id: ST('Minato'), title: '湊', railway: RW, operator: 'TokyoMetro', lat: 35.7, lon: 139.8, connecting: [] },
    ],
    errors: [],
  },
  { busStationWalkMinutes: 5 }
);

const G_CHUO = NET.groupOf.get(ST('Chuo'));
const G_MINATO = NET.groupOf.get(ST('Minato'));

const POLE_ORIGIN = 'odpt.BusstopPole:Toei.Sakuradai.100.1';
const POLE_CHUO = 'odpt.BusstopPole:Toei.ChuoStation.200.1';
const P_MIX = 'odpt.BusroutePattern:Toei.Mix01.1.1';

const MIX_PATTERN = {
  id: P_MIX,
  title: '桜０１ 中央駅前行',
  busroute: 'odpt.Busroute:Toei.Sakura01',
  operator: 'Toei',
  order: [
    { i: 1, pole: POLE_ORIGIN, note: '桜台三丁目' },
    { i: 2, pole: 'odpt.BusstopPole:Toei.Mid.150.1', note: '桜台一丁目' },
    { i: 3, pole: POLE_CHUO, note: '中央駅前' },
  ],
};

const MIX_TT = {
  id: 'mtt', pole: POLE_ORIGIN, calendar: CAL, operator: 'Toei',
  rows: [{ time: '09:00', pattern: P_MIX, destPole: POLE_CHUO, destSign: '中央駅前', order: 1, isMidnight: false }],
};

const MIX_RUN = {
  id: 'mrun', pattern: P_MIX, calendar: CAL, operator: 'Toei',
  stops: [
    { i: 1, pole: POLE_ORIGIN, arr: '09:00', dep: '09:00' },
    { i: 2, pole: 'odpt.BusstopPole:Toei.Mid.150.1', arr: '09:05', dep: '09:05' },
    { i: 3, pole: POLE_CHUO, arr: '09:10', dep: '09:10' },
  ],
};

function mixApi(counters = {}) {
  counters.calls = 0;
  const wrap = (fn) => async (...a) => { counters.calls += 1; return fn(...a); };
  return {
    busStops: wrap(async (names) => {
      const stops = [];
      for (const n of names) {
        if (n === '桜台三丁目') stops.push({ id: POLE_ORIGIN, title: '桜台三丁目', patterns: [P_MIX], query: n });
      }
      return { data: { stops, errors: [] }, fetchedAt: null };
    }),
    busPatterns: wrap(async () => ({ data: { patterns: [MIX_PATTERN], errors: [] }, fetchedAt: null })),
    busCalendars: wrap(async () => ({ data: { calendars: CALENDARS, errors: [] }, fetchedAt: null })),
    busTimetables: wrap(async () => ({ data: { timetables: [MIX_TT], errors: [] }, fetchedAt: null })),
    busRuns: wrap(async () => ({ data: { runs: [MIX_RUN], errors: [] }, fetchedAt: null })),
  };
}

/** 中央 → 湊 の鉄道を返すモック */
const railSearchMock = async (fromGroupId, toGroupId, at) => {
  if (fromGroupId !== G_CHUO || toGroupId !== G_MINATO) return { routes: [], warnings: [], fetchedAt: null };
  const dep = Math.max(at, 9 * 60 + 20);
  return {
    routes: [
      {
        legs: [
          { railway: RW, from: ST('Chuo'), to: ST('Minato'), departure: dep, arrival: dep + 6, stops: 2, trainNo: 'A1' },
        ],
        transfers: 0,
        departure: dep,
        arrival: dep + 6,
        warnings: [],
      },
    ],
    warnings: [],
    fetchedAt: null,
  };
};

await test('バス停名から駅名を取り出せる', () => {
  assert.equal(busStopToStationName('渋谷駅前'), '渋谷');
  assert.equal(busStopToStationName('東京駅丸の内北口'), '東京');
  assert.equal(busStopToStationName('大手町'), '大手町');
  assert.equal(stationGroupForBusStop(NET, '中央駅前'), NET.groups.get(G_CHUO));
  assert.equal(stationGroupForBusStop(NET, '存在しない停留所'), null);
});

await test('バス→徒歩→鉄道 の経路を組み立てられる', async () => {
  const c = {};
  const res = await findIntermodalRoutes(
    { api: mixApi(c), net: NET, railSearch: railSearchMock },
    '桜台三丁目',
    '湊',
    { fromGroupId: null, toGroupId: G_MINATO, departAt: 8 * 60 + 45, serviceDate: SERVICE_DATE, store: {} }
  );
  assert.equal(res.routes.length, 1, `件数が想定と違う: ${res.routes.length}`);
  const r = res.routes[0];
  assert.equal(r.kind, 'mixed');
  assert.equal(r.departure, 9 * 60 + 0);
  assert.equal(r.arrival, 9 * 60 + 26); // 09:10 着 → 徒歩5分 → 09:20 発 → 09:26 着
  const kinds = r.legs.map((l) => (l.transfer ? 'walk' : l.bus ? 'bus' : 'rail'));
  assert.deepEqual(kinds, ['bus', 'walk', 'rail']);
  assert.equal(r.transfers, 1);
  assert.equal(r.legs[1].minutes, 5);
  assert.equal(r.legs[0].toTitle, '中央駅前');
});

await test('鉄道が乗り継ぎ駅から目的地へ行けなければ経路を出さない', async () => {
  const c = {};
  const res = await findIntermodalRoutes(
    { api: mixApi(c), net: NET, railSearch: async () => ({ routes: [], warnings: [], fetchedAt: null }) },
    '桜台三丁目',
    '湊',
    { fromGroupId: null, toGroupId: G_MINATO, departAt: 8 * 60 + 45, serviceDate: SERVICE_DATE, store: {} }
  );
  assert.equal(res.routes.length, 0);
});

await test('乗り継ぎ探索の Worker リクエストは 5 回以内(鉄道分を除く)', async () => {
  const c = {};
  await findIntermodalRoutes(
    { api: mixApi(c), net: NET, railSearch: railSearchMock },
    '桜台三丁目',
    '湊',
    { fromGroupId: null, toGroupId: G_MINATO, departAt: 8 * 60 + 45, serviceDate: SERVICE_DATE, store: {} }
  );
  assert(c.calls <= 5, `リクエストが多すぎる: ${c.calls}`);
  console.log(`       (バス側 Worker リクエスト ${c.calls} 回)`);
});

console.log(`\n${passed} 件のテストが成功${process.exitCode ? '(失敗あり)' : ''}\n`);
