/**
 * 経路探索のユニットテスト(モックデータ)
 *   node tests/router.test.mjs
 *
 * ODPT の実データが無くてもロジックを検証できるようにしている。
 * 実データでの検証は Phase 0(トークン取得後)に行う。
 */

import assert from 'node:assert/strict';
import { TransitNetwork } from '../transit/js/network.js';
import { findCandidateRoutes, bindSchedule, edgeKey } from '../transit/js/router.js';
import { toMinutes, toServiceTime, toClockTime, toServiceMoment, calendarFor } from '../transit/js/time.js';
import { analyzeStatus, warningsForRoute, SEVERITY } from '../transit/js/status.js';

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
async function testAsync(name, fn) {
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
 *
 *   A線(メトロ):  青山 - 中央 - 東橋 - 港南          ※ 中央で B線に乗換
 *   B線(都営):    北町 - 中央 - 西谷 - 湊              ※ 中央で A線に乗換
 *   C線(メトロ):  青山 - 迂回 - 湊                     ※ A/B を使わない迂回路
 * ================================================================== */

const RW_A = 'odpt.Railway:TokyoMetro.LineA';
const RW_B = 'odpt.Railway:Toei.LineB';
const RW_C = 'odpt.Railway:TokyoMetro.LineC';

const st = (rw, name) => `odpt.Station:${rw.split(':')[1]}.${name}`;

const A = ['Aoyama', 'Chuo', 'Higashibashi', 'Konan'].map((n) => st(RW_A, n));
const B = ['Kitamachi', 'Chuo', 'Nishitani', 'Minato'].map((n) => st(RW_B, n));
const C = ['Aoyama', 'Ukai', 'Minato'].map((n) => st(RW_C, n));

const TITLES = {
  Aoyama: '青山',
  Chuo: '中央',
  Higashibashi: '東橋',
  Konan: '港南',
  Kitamachi: '北町',
  Nishitani: '西谷',
  Minato: '湊',
  Ukai: '迂回',
};

function station(id, railway, lat, lon) {
  const key = id.split('.').pop();
  return { id, title: TITLES[key], railway, operator: railway.split(':')[1].split('.')[0], lat, lon, connecting: [] };
}

const rawNetwork = {
  fetchedAt: '2026-08-29T09:00:00+09:00',
  operators: [
    { id: 'TokyoMetro', title: '東京メトロ' },
    { id: 'Toei', title: '東京都交通局' },
  ],
  railways: [
    {
      id: RW_A,
      title: 'A線',
      operator: 'TokyoMetro',
      ascending: 'odpt.RailDirection:TokyoMetro.East',
      descending: 'odpt.RailDirection:TokyoMetro.West',
      stations: A,
    },
    {
      id: RW_B,
      title: 'B線',
      operator: 'Toei',
      ascending: 'odpt.RailDirection:Toei.South',
      descending: 'odpt.RailDirection:Toei.North',
      stations: B,
    },
    {
      id: RW_C,
      title: 'C線',
      operator: 'TokyoMetro',
      ascending: 'odpt.RailDirection:TokyoMetro.East',
      descending: 'odpt.RailDirection:TokyoMetro.West',
      stations: C,
    },
  ],
  stations: [
    station(A[0], RW_A, 35.67, 139.72),
    station(A[1], RW_A, 35.68, 139.75),
    station(A[2], RW_A, 35.69, 139.78),
    station(A[3], RW_A, 35.7, 139.8),
    station(B[0], RW_B, 35.72, 139.75),
    station(B[1], RW_B, 35.6801, 139.7502), // A線の中央とほぼ同じ位置 = 同一駅
    station(B[2], RW_B, 35.66, 139.76),
    station(B[3], RW_B, 35.64, 139.77),
    station(C[0], RW_C, 35.6701, 139.7201),
    station(C[1], RW_C, 35.65, 139.74),
    station(C[2], RW_C, 35.6401, 139.7701),
  ],
  errors: [],
};

const config = {
  defaultHopMinutes: 2,
  defaultTransferMinutes: 4,
  defaultInterOperatorTransferMinutes: 6,
  hopMinutes: { [RW_C]: 8 }, // C線は各駅間が長い = 迂回すると遅い
  transfers: {},
  walkLinks: [],
  walkMinutes: {},
};

const net = new TransitNetwork(rawNetwork, config);

/* ================================================================== *
 *  時刻ユーティリティ
 * ================================================================== */
console.log('\n時刻ユーティリティ');
test('toMinutes は 24 時以降の表記を扱える', () => {
  assert.equal(toMinutes('07:03'), 423);
  assert.equal(toMinutes('25:10'), 1510);
  assert.equal(toMinutes('bogus'), null);
  assert.equal(toMinutes('12:99'), null);
});
test('toServiceTime / toClockTime', () => {
  assert.equal(toServiceTime(1510), '25:10');
  assert.equal(toClockTime(1510), '01:10');
});
test('深夜は前日ダイヤ扱いになる', () => {
  // ローカル時刻で 2026-09-02 00:30(実行環境のタイムゾーンに依存しないように構築)
  const { serviceDate, minutes } = toServiceMoment(new Date(2026, 8, 2, 0, 30));
  assert.equal(serviceDate.getDate(), 1);
  assert.equal(minutes, 1470); // 24:30
});
test('土日と祝日は土休日ダイヤ', () => {
  const holidays = ['2026-09-21'];
  assert.equal(calendarFor(new Date(2026, 8, 21), holidays).urn, 'odpt.Calendar:SaturdayHoliday'); // 敬老の日(月)
  assert.equal(calendarFor(new Date(2026, 8, 19), holidays).urn, 'odpt.Calendar:SaturdayHoliday'); // 土
  assert.equal(calendarFor(new Date(2026, 8, 18), holidays).urn, 'odpt.Calendar:Weekday'); // 金
});

/* ================================================================== *
 *  ネットワーク構築
 * ================================================================== */
console.log('\nネットワーク構築');
test('同名かつ近接の駅は 1 つのグループにまとまる', () => {
  const g = net.groupOf.get(A[1]);
  assert.equal(net.groupOf.get(B[1]), g, '中央(A線)と中央(B線)は同一グループのはず');
  assert.equal(net.groups.get(g).members.length, 2);
});
test('同名でも離れていれば別グループ', () => {
  const gA = net.groupOf.get(A[0]); // 青山(A線)
  const gC = net.groupOf.get(C[0]); // 青山(C線) — 近いので同一になるはず
  assert.equal(gA, gC);
});
test('駅名検索', () => {
  const hits = net.searchGroups('中央');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].title, '中央');
});
test('最寄駅は距離順', () => {
  const near = net.nearestGroups(35.6799, 139.7501, 2);
  assert.equal(near[0].group.title, '中央');
  assert(near[0].km < near[1].km);
});
test('進行方向を駅順から決められる', () => {
  assert.equal(net.directionFor(RW_A, A[0], A[3]), 'odpt.RailDirection:TokyoMetro.East');
  assert.equal(net.directionFor(RW_A, A[3], A[0]), 'odpt.RailDirection:TokyoMetro.West');
});

/* ================================================================== *
 *  候補経路の列挙
 * ================================================================== */
console.log('\n候補経路の列挙');
const gAoyama = net.groupOf.get(A[0]);
const gMinato = net.groupOf.get(B[3]);

test('青山 → 湊 の候補が見つかる', () => {
  const routes = findCandidateRoutes(net, gAoyama, gMinato);
  assert(routes.length >= 1, '候補が 0 件');
  const best = routes[0];
  assert.equal(best.legs.filter((l) => !l.transfer).length >= 1, true);
});

test('最短は A線→B線 の乗換 1 回', () => {
  const routes = findCandidateRoutes(net, gAoyama, gMinato);
  const best = routes[0];
  assert.equal(best.transfers, 1, `乗換回数が想定と違う: ${best.transfers}`);
  const rails = best.legs.filter((l) => !l.transfer).map((l) => l.railway);
  assert.deepEqual(rails, [RW_A, RW_B]);
});

test('乗換なしの迂回路(C線)も候補に入る', () => {
  const routes = findCandidateRoutes(net, gAoyama, gMinato);
  const zero = routes.find((r) => r.transfers === 0);
  assert(zero, '乗換 0 回の C線ルートが候補に出ていない');
  assert.equal(zero.legs[0].railway, RW_C);
});

test('路線を除外すると、その路線を使わない経路になる', () => {
  const routes = findCandidateRoutes(net, gAoyama, gMinato, {
    excludedRailways: new Set([RW_B]),
  });
  assert(routes.length >= 1);
  for (const r of routes) {
    for (const leg of r.legs) {
      if (!leg.transfer) assert.notEqual(leg.railway, RW_B, 'B線が除外されていない');
    }
  }
});

test('区間を除外すると、その区間を通らない経路になる', () => {
  // B線 中央〜西谷 を封鎖 → A線→B線 の乗換ルートは通れなくなる
  const excludedEdges = new Set([edgeKey(RW_B, B[1], B[2]), edgeKey(RW_B, B[2], B[1])]);
  const routes = findCandidateRoutes(net, gAoyama, gMinato, { excludedEdges });
  assert(routes.length >= 1, '迂回路が出ていない');
  for (const r of routes) {
    const usesBlocked = r.legs.some(
      (l) => !l.transfer && l.railway === RW_B && net.indexOnRailway(RW_B, l.from) <= 1 && net.indexOnRailway(RW_B, l.to) >= 2
    );
    assert(!usesBlocked, '封鎖区間を通る経路が残っている');
  }
});

test('全部除外すれば経路は 0 件', () => {
  const routes = findCandidateRoutes(net, gAoyama, gMinato, {
    excludedRailways: new Set([RW_A, RW_B, RW_C]),
  });
  assert.equal(routes.length, 0);
});

/* ================================================================== *
 *  時刻表バインド
 * ================================================================== */
console.log('\n時刻表バインド');

const CAL = 'odpt.Calendar:Weekday';

/** 駅時刻表(A線 東行 / B線 南行 / C線 東行) */
function stationTimetable(railway, stationId, direction, rows) {
  return { id: `${railway}:${stationId}`, station: stationId, railway, direction, calendar: CAL, rows };
}

const MOCK_TIMETABLES = {
  [A[0]]: [
    stationTimetable(RW_A, A[0], 'odpt.RailDirection:TokyoMetro.East', [
      { time: '09:00', no: 'A100', train: 'odpt.TrainTimetable:TokyoMetro.LineA.A100', dest: [A[3]], type: 'odpt.TrainType:TokyoMetro.Local' },
      { time: '09:10', no: 'A102', train: 'odpt.TrainTimetable:TokyoMetro.LineA.A102', dest: [A[3]], type: 'odpt.TrainType:TokyoMetro.Local' },
    ]),
  ],
  [B[1]]: [
    stationTimetable(RW_B, B[1], 'odpt.RailDirection:Toei.South', [
      { time: '09:12', no: 'B200', train: 'odpt.TrainTimetable:Toei.LineB.B200', dest: [B[3]], type: 'odpt.TrainType:Toei.Local' },
      { time: '09:22', no: 'B202', train: 'odpt.TrainTimetable:Toei.LineB.B202', dest: [B[3]], type: 'odpt.TrainType:Toei.Local' },
    ]),
  ],
  [C[0]]: [
    stationTimetable(RW_C, C[0], 'odpt.RailDirection:TokyoMetro.East', [
      { time: '09:05', no: 'C300', train: 'odpt.TrainTimetable:TokyoMetro.LineC.C300', dest: [C[2]], type: 'odpt.TrainType:TokyoMetro.Local' },
    ]),
  ],
};

const MOCK_TRAINS = {
  'odpt.TrainTimetable:TokyoMetro.LineA.A100': {
    id: 'odpt.TrainTimetable:TokyoMetro.LineA.A100',
    railway: RW_A,
    no: 'A100',
    type: 'odpt.TrainType:TokyoMetro.Local',
    dest: [A[3]],
    stops: [
      { dep: '09:00', depSt: A[0] },
      { arr: '09:04', arrSt: A[1], dep: '09:05', depSt: A[1] },
      { arr: '09:09', arrSt: A[2] },
    ],
  },
  'odpt.TrainTimetable:TokyoMetro.LineA.A102': {
    id: 'odpt.TrainTimetable:TokyoMetro.LineA.A102',
    railway: RW_A,
    no: 'A102',
    type: 'odpt.TrainType:TokyoMetro.Local',
    dest: [A[3]],
    stops: [
      { dep: '09:10', depSt: A[0] },
      { arr: '09:14', arrSt: A[1] },
    ],
  },
  'odpt.TrainTimetable:Toei.LineB.B200': {
    id: 'odpt.TrainTimetable:Toei.LineB.B200',
    railway: RW_B,
    no: 'B200',
    type: 'odpt.TrainType:Toei.Local',
    dest: [B[3]],
    stops: [
      { dep: '09:12', depSt: B[1] },
      { arr: '09:16', arrSt: B[2], dep: '09:17', depSt: B[2] },
      { arr: '09:21', arrSt: B[3] },
    ],
  },
  'odpt.TrainTimetable:Toei.LineB.B202': {
    id: 'odpt.TrainTimetable:Toei.LineB.B202',
    railway: RW_B,
    no: 'B202',
    type: 'odpt.TrainType:Toei.Local',
    dest: [B[3]],
    stops: [
      { dep: '09:22', depSt: B[1] },
      { arr: '09:31', arrSt: B[3] },
    ],
  },
  'odpt.TrainTimetable:TokyoMetro.LineC.C300': {
    id: 'odpt.TrainTimetable:TokyoMetro.LineC.C300',
    railway: RW_C,
    no: 'C300',
    type: 'odpt.TrainType:TokyoMetro.Local',
    dest: [C[2]],
    stops: [
      { dep: '09:05', depSt: C[0] },
      { arr: '09:11', arrSt: C[1], dep: '09:12', depSt: C[1] },
      { arr: '09:40', arrSt: C[2] },
    ],
  },
};

function mockApi(counters) {
  return {
    async timetables(stations) {
      counters.timetableCalls += 1;
      counters.timetableStations += stations.length;
      assert(stations.length <= 20, 'バッチが 20 件を超えている');
      const out = [];
      for (const s of stations) out.push(...(MOCK_TIMETABLES[s] || []));
      return { data: { timetables: out, errors: [] }, fetchedAt: '2026-08-29T09:00:00+09:00' };
    },
    async trains(ids) {
      counters.trainCalls += 1;
      counters.trainIds += ids.length;
      assert(ids.length <= 20, 'バッチが 20 件を超えている');
      return {
        data: { trains: ids.map((i) => MOCK_TRAINS[i]).filter(Boolean), errors: [] },
        fetchedAt: '2026-08-29T09:00:00+09:00',
      };
    },
  };
}

await testAsync('実時刻を割り当て、到着時刻を確定できる', async () => {
  const counters = { timetableCalls: 0, timetableStations: 0, trainCalls: 0, trainIds: 0 };
  const candidates = findCandidateRoutes(net, gAoyama, gMinato);
  const res = await bindSchedule(candidates, {
    api: mockApi(counters),
    net,
    calendarUrn: CAL,
    departAt: 8 * 60 + 55, // 08:55
    stores: { timetables: new Map(), trains: new Map() },
  });

  assert(res.routes.length >= 1, '時刻付き経路が 0 件');
  const transferRoute = res.routes.find((r) => r.transfers === 1);
  assert(transferRoute, '乗換 1 回の経路が確定できていない');
  // 09:00 青山発 → 09:04 中央着 → 乗換 → 09:12 中央発 → 09:21 湊着
  assert.equal(transferRoute.departure, 9 * 60 + 0);
  assert.equal(transferRoute.arrival, 9 * 60 + 21);
  assert.equal(transferRoute.rideMinutes, 21);
  assert.equal(transferRoute.estimatedOnly, false);
});

await testAsync('乗換時間より前の列車には乗せない', async () => {
  const counters = { timetableCalls: 0, timetableStations: 0, trainCalls: 0, trainIds: 0 };
  // 乗換 6 分 → 09:04 着 + 6 分 = 09:10 以降。09:12 の B200 が最速で妥当。
  const candidates = findCandidateRoutes(net, gAoyama, gMinato);
  const res = await bindSchedule(candidates, {
    api: mockApi(counters),
    net,
    calendarUrn: CAL,
    departAt: 8 * 60 + 55,
    stores: { timetables: new Map(), trains: new Map() },
  });
  const r = res.routes.find((x) => x.transfers === 1);
  const secondRide = r.legs.filter((l) => !l.transfer)[1];
  assert.equal(secondRide.departure, 9 * 60 + 12);
});

await testAsync('サブリクエスト予算を超えるバッチを投げない', async () => {
  const counters = { timetableCalls: 0, timetableStations: 0, trainCalls: 0, trainIds: 0 };
  const candidates = findCandidateRoutes(net, gAoyama, gMinato);
  await bindSchedule(candidates, {
    api: mockApi(counters),
    net,
    calendarUrn: CAL,
    departAt: 8 * 60 + 55,
    stores: { timetables: new Map(), trains: new Map() },
  });
  assert(counters.timetableCalls <= 2, `時刻表リクエストが多すぎる: ${counters.timetableCalls}`);
  assert(counters.trainCalls <= 6, `列車リクエストが多すぎる: ${counters.trainCalls}`);
  console.log(
    `       (1 検索あたり Worker リクエスト: 時刻表 ${counters.timetableCalls} 回 / 列車 ${counters.trainCalls} 回)`
  );
});

await testAsync('列車時刻表が引けない場合は推定にフォールバックする', async () => {
  const counters = { timetableCalls: 0, timetableStations: 0, trainCalls: 0, trainIds: 0 };
  const brokenApi = {
    ...mockApi(counters),
    async trains(ids) {
      counters.trainCalls += 1;
      return { data: { trains: [], errors: ids.map((i) => ({ key: i, message: 'not found' })) }, fetchedAt: null };
    },
  };
  const candidates = findCandidateRoutes(net, gAoyama, gMinato);
  const res = await bindSchedule(candidates, {
    api: brokenApi,
    net,
    calendarUrn: CAL,
    departAt: 8 * 60 + 55,
    stores: { timetables: new Map(), trains: new Map() },
  });
  assert(res.routes.length >= 1, '推定でも経路を返すべき');
  assert(res.routes.every((r) => r.estimatedOnly), '推定フラグが立っていない');
});

/* ================================================================== *
 *  運行情報
 * ================================================================== */
console.log('\n運行情報');

test('平常/遅延/運転見合わせを分類できる', () => {
  const analysis = analyzeStatus(
    [
      { railway: RW_A, operator: 'odpt.Operator:TokyoMetro', status: '平常運転', text: '平常どおり運転しています。' },
      { railway: RW_B, operator: 'odpt.Operator:Toei', status: '運転見合わせ', text: '中央駅での人身事故の影響で、運転を見合わせています。' },
      { railway: RW_C, operator: 'odpt.Operator:TokyoMetro', status: '遅延', text: '約15分の遅れが出ています。' },
    ],
    net
  );
  const by = (rw) => analysis.list.find((e) => e.railway === rw);
  assert.equal(by(RW_A).severity, SEVERITY.NORMAL);
  assert.equal(by(RW_B).severity, SEVERITY.SUSPENDED);
  assert.equal(by(RW_C).severity, SEVERITY.DELAY);
  // 平常運転の路線は byRailway に入れない(経路の警告に使うのは異常だけ)
  assert.equal(analysis.byRailway.has(RW_A), false);
  assert.equal(analysis.byRailway.get(RW_B).severity, SEVERITY.SUSPENDED);
  assert.equal(analysis.byRailway.get(RW_C).severity, SEVERITY.DELAY);
});

test('本文中の駅名を手がかりとして抽出できる', () => {
  const analysis = analyzeStatus(
    [{ railway: RW_B, operator: 'odpt.Operator:Toei', status: '運転見合わせ', text: '中央駅〜西谷駅間で運転を見合わせています。' }],
    net
  );
  const hints = analysis.byRailway.get(RW_B).stationHints.map((h) => h.title);
  assert(hints.includes('中央'));
  assert(hints.includes('西谷'));
});

test('影響を受ける経路にだけ警告が付く', () => {
  const analysis = analyzeStatus(
    [{ railway: RW_B, operator: 'odpt.Operator:Toei', status: '運転見合わせ', text: '運転を見合わせています。' }],
    net
  );
  const routes = findCandidateRoutes(net, gAoyama, gMinato);
  const withB = routes.find((r) => r.legs.some((l) => !l.transfer && l.railway === RW_B));
  const withoutB = routes.find((r) => !r.legs.some((l) => !l.transfer && l.railway === RW_B));
  assert.equal(warningsForRoute(withB, analysis).length, 1);
  if (withoutB) assert.equal(warningsForRoute(withoutB, analysis).length, 0);
});

console.log(`\n${passed} 件のテストが成功${process.exitCode ? '(失敗あり)' : ''}\n`);
