/**
 * 遠回りの経路を出してしまう問題のテスト
 *   node tests/detour.test.mjs
 *
 * 【何が起きていたか】
 * 「本厚木 → 外苑前」で、代々木上原まで乗り通さず途中で乗り換える経路が出た。
 *
 * 原因は候補を選ぶ段階の見積りが **駅数 × 一律の分数** だったこと。
 * 本厚木〜代々木上原は約 30 駅なので 30 × 2.2 = 66 分と値付けされるが、
 * 実際の快速急行は約 45 分。21 分も高いので、駅数の少ない別経路へ
 * 乗り換える案の方が安く見えてしまう。
 *
 * さらに代々木上原の小田急↔千代田線は**同じ電車のまま**走る直通運転だが、
 * 乗換時間の表に無いため「事業者をまたぐ乗換 7 分」が足されていた。
 *
 * ここでは同じ形の路線図を合成して、両方を固定する。
 */

import assert from 'node:assert/strict';
import { TransitNetwork, operatorSignature, loadNetwork } from '../transit/js/network.js';
import { findCandidateRoutes } from '../transit/js/router.js';

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
async function asyncTest(name, fn) {
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
 *  合成した路線図(本厚木 → 外苑前 と同じ形)
 * ================================================================== *
 *  私鉄 P  郊外0 …(21 区間・1 区間 2km)… 乗継点        ← 優等が走る長距離路線
 *  地下鉄 S 乗継点 → 都心A → 到着地                     ← 乗継点で P と直通
 *  別社 Q  郊外5 …(3 区間・1 区間 13km)… 都心A         ← 駅数は少ないが遠回り
 *
 *  「郊外0 → 到着地」の正解は P を乗り通して S に直通すること。
 *  Q は駅数が少ないので、駅数で値付けすると安く見える。
 */
const P = 'odpt.Railway:Odakyu.Odawara';
const S = 'odpt.Railway:TokyoMetro.Chiyoda';
const Q = 'odpt.Railway:Keio.Inokashira';

const HOPS_P = 21;
/** 1 区間 2km。21 区間で 42km(実際の本厚木〜代々木上原に近い) */
const KM_PER_HOP_P = 2;

function station(id, title, railway, lat, lon) {
  return { id, title, railway, lat, lon, connecting: [] };
}

/** 緯度を 1 度 ≒ 111km として、南北に並べる */
function latFor(km) {
  return 35.0 + km / 111;
}

function buildRaw() {
  const stations = [];
  const pStations = [];
  for (let i = 0; i <= HOPS_P; i += 1) {
    const title = i === HOPS_P ? '乗継点' : `郊外${i}`;
    const id = `${P}.${title}`;
    stations.push(station(id, title, P, latFor(i * KM_PER_HOP_P), 139.5));
    pStations.push(id);
  }

  // 地下鉄 S。乗継点 → 都心A → 到着地。1 区間 1km。
  const sStations = [
    `${P}.乗継点`, // 同じ場所にある駅としてグループにまとめたいので座標を合わせる
  ];
  const sIds = [];
  const sTitles = ['乗継点', '都心A', '到着地'];
  sTitles.forEach((title, i) => {
    const id = `${S}.${title}`;
    stations.push(station(id, title, S, latFor(HOPS_P * KM_PER_HOP_P + i * 1), 139.5));
    sIds.push(id);
  });
  sStations.length = 0;

  // 別社 Q。郊外5 → 中継1 → 中継2 → 都心A。駅数 3 だが 1 区間 13km(遠回り)。
  const qIds = [];
  const qTitles = ['郊外5', 'Q中継1', 'Q中継2', '都心A'];
  qTitles.forEach((title, i) => {
    const id = `${Q}.${title}`;
    // 大きく西へ迂回してから都心Aへ戻る、という形にする
    const lat = i === 0 ? latFor(5 * KM_PER_HOP_P) : i === 3 ? latFor(HOPS_P * KM_PER_HOP_P + 1) : latFor(5 * KM_PER_HOP_P + i * 13);
    const lon = i === 0 || i === 3 ? 139.5 : 139.5 - 0.15;
    stations.push(station(id, title, Q, lat, lon));
    qIds.push(id);
  });

  return {
    fetchedAt: '2026-10-02T00:00:00Z',
    operators: [{ id: 'Odakyu' }, { id: 'TokyoMetro' }, { id: 'Keio' }],
    railways: [
      { id: P, title: '小田原線', operator: 'odpt.Operator:Odakyu', stations: pStations },
      { id: S, title: '千代田線', operator: 'odpt.Operator:TokyoMetro', stations: sIds },
      { id: Q, title: '井の頭線', operator: 'odpt.Operator:Keio', stations: qIds },
    ],
    stations,
  };
}

const CONFIG = {
  defaultHopMinutes: 2.2,
  defaultTransferMinutes: 4,
  defaultInterOperatorTransferMinutes: 7,
  minHopMinutes: 1,
  defaultSpeedKmPerHour: 35,
  speedByCategory: { JR: 38, 私鉄: 45, 地下鉄: 30, 'モノレール・新交通・路面電車': 25, その他: 35 },
  speedKmPerHour: { [P]: 48, [Q]: 28 },
  hopMinutes: { [S]: 2.2 },
  transfers: {
    // 直通運転。同じ電車のまま乗り入れるので 0 分。
    [`乗継点|${P}|${S}`]: 0,
  },
};

const net = new TransitNetwork(buildRaw(), CONFIG);

/* ================================================================== */
console.log('\n路線図の前提');

test('合成した路線図が組み立てられている', () => {
  assert.equal(net.railways.size, 3);
  assert(net.groups.has('乗継点'), '乗継点がグループになっていない');
  assert(net.groups.has('都心A'), '都心Aがグループになっていない');
  assert(net.groups.has('郊外0'));
  assert(net.groups.has('到着地'));
});

test('乗継点では私鉄と地下鉄が同じグループに入る(乗り換えられる)', () => {
  const g = net.groups.get('乗継点');
  const railways = new Set(g.members.map((m) => net.stations.get(m).railway));
  assert(railways.has(P) && railways.has(S), `同じ駅になっていない: ${[...railways].join(',')}`);
});

/* ================================================================== */
console.log('\n直通運転');

test('直通運転の地点は乗換 0 分', () => {
  assert.equal(net.transferMinutes(P, S, '乗継点'), 0);
});

test('直通でない組み合わせは既定どおり(事業者をまたぐので長め)', () => {
  assert.equal(net.transferMinutes(Q, S, '都心A'), 7);
});

test('同じ電車なので、待ち時間を足さない(0 分だと同じ分の発車に乗れる)', () => {
  // bindSchedule は「前のレグの到着 + 乗換分」以降の列車を選ぶ。
  // ここが 1 分でも入っていると、同じ電車の発車時刻に乗れず次の便まで待つ。
  assert.equal(net.transferMinutes(P, S, '乗継点'), 0, '0 分でないと直通を取り逃がす');
});

/* ================================================================== */
console.log('\n駅間の見積り');

test('hopMinutes に書いてある路線は、その値を使い続ける(既存の設定を壊さない)', () => {
  const edge = net.rideEdges.get(`${S}.乗継点`).find((e) => e.railway === S);
  assert.equal(edge.minutes, 2.2);
});

test('座標から出した見積りも辺に持っている', () => {
  const edge = net.rideEdges.get(`${P}.郊外0`).find((e) => e.railway === P);
  // 2km ÷ 48km/h = 2.5 分
  assert(Math.abs(edge.distanceMinutes - 2.5) < 0.1, `距離ベースの値が合わない: ${edge.distanceMinutes}`);
});

test('座標が無い駅は従来どおりの見積りに落ちる', () => {
  const raw = buildRaw();
  for (const s of raw.stations) {
    s.lat = null;
    s.lon = null;
  }
  const n2 = new TransitNetwork(raw, CONFIG);
  const edge = n2.rideEdges.get(`${P}.郊外0`).find((e) => e.railway === P);
  assert.equal(edge.distanceMinutes, edge.minutes, '座標が無いのに距離ベースの値が入っている');
});

test('下限を下回らない', () => {
  const cfg = { ...CONFIG, speedKmPerHour: { ...CONFIG.speedKmPerHour, [P]: 600 } };
  const n2 = new TransitNetwork(buildRaw(), cfg);
  const edge = n2.rideEdges.get(`${P}.郊外0`).find((e) => e.railway === P);
  assert.equal(edge.distanceMinutes, 1, `下限が効いていない: ${edge.distanceMinutes}`);
});

/* ================================================================== */
console.log('\n遠回りの再現と修正');

const routes = findCandidateRoutes(net, '郊外0', '到着地');

/** 経路が「乗り通し」か(私鉄を乗継点まで乗って地下鉄に直通) */
function isThrough(r) {
  const rides = r.legs.filter((l) => !l.transfer);
  return rides.length === 2 && rides[0].railway === P && rides[1].railway === S;
}
/** 経路が「迂回」か(途中で別社に乗り換える) */
function isDetour(r) {
  return r.legs.some((l) => !l.transfer && l.railway === Q);
}

test('候補に乗り通す経路が入っている', () => {
  assert(routes.some(isThrough), `乗り通す経路が候補に無い: ${routes.map((r) => r.signature).join(' / ')}`);
});

test('候補に迂回する経路も入っている(どちらが速いかは時刻表に決めさせる)', () => {
  assert(routes.some(isDetour), '迂回経路が候補から消えている');
});

// ここが問題の核心。駅数だけで見ると迂回の方が安く見える。
test('駅数で見ると迂回の方が安く見える(これが遠回りの原因だった)', () => {
  const through = routes.find(isThrough);
  const detour = routes.find(isDetour);
  assert(through && detour, '前提の経路が揃っていない');
  assert(
    detour.estimatedByHop < through.estimatedByHop,
    `前提が崩れている。駅数ベースで迂回が安くなっていない: 迂回 ${detour.estimatedByHop} / 乗り通し ${through.estimatedByHop}`
  );
});

test('距離で見ると乗り通しの方が安い', () => {
  const through = routes.find(isThrough);
  const detour = routes.find(isDetour);
  assert(
    through.estimatedByDistance < detour.estimatedByDistance,
    `距離ベースでも乗り通しが安くなっていない: 乗り通し ${through.estimatedByDistance} / 迂回 ${detour.estimatedByDistance}`
  );
});

// ここが肝。2 モデルで候補を出しても、最後に 1 つの見積りで並べて切ると
// 駅数ベースで安く見える迂回が上位を占め、乗り通しが時刻表を引く前に消える。
test('各モデルが推した経路は、必ず候補の先頭 2 件に残る', () => {
  const head = routes.slice(0, 2);
  assert(head.some(isThrough), `乗り通しが先頭に残っていない: ${head.map((r) => r.signature).join(' / ')}`);
  assert(head.some(isDetour), `駅数ベースの最良が先頭に残っていない: ${head.map((r) => r.signature).join(' / ')}`);
});

// 複合経路の中間区間は上位 2 件しか使わない(main.js の railSearch)。
// そこに両モデルの最良が入っていることが、この並びの目的。
test('候補の上限を 1 件にしても、距離ベースの最良は残る', () => {
  const through = routes.find(isThrough);
  const byDistance = routes.slice().sort((a, b) => a.estimatedByDistance - b.estimatedByDistance)[0];
  assert.equal(byDistance.signature, through.signature, '距離ベースの最良が乗り通しになっていない');
  assert(routes.includes(byDistance), '距離ベースの最良が候補から落ちている');
});

test('見積りは 2 つのモデルの甘い方を採る', () => {
  const through = routes.find(isThrough);
  assert.equal(through.estimatedMinutes, Math.min(through.estimatedByHop, through.estimatedByDistance));
});

test('乗り通す経路の乗換は 1 回だけ(直通地点)', () => {
  const through = routes.find(isThrough);
  assert.equal(through.transfers, 1);
  assert.equal(through.legs.find((l) => l.transfer).minutes, 0, '直通地点で待たされている');
});

test('除外の指定は引き続き効く', () => {
  const only = findCandidateRoutes(net, '郊外0', '到着地', { excludedRailways: new Set([Q]) });
  assert(only.length >= 1);
  assert(!only.some(isDetour), '除外した路線を使っている');
});

/* ================================================================== *
 *  キャッシュと対応事業者
 * ================================================================== */
console.log('\n保存した路線グラフの扱い');

test('対応事業者の並びを 1 本の文字列にできる', () => {
  const a = operatorSignature({ supported: [{ id: 'TokyoMetro' }, { id: 'Toei' }] });
  const b = operatorSignature({ supported: [{ id: 'Toei' }, { id: 'TokyoMetro' }] });
  assert.equal(a, b, '並び順で違う値になってはいけない');
  assert.notEqual(a, operatorSignature({ supported: [{ id: 'Toei' }] }));
  assert.equal(operatorSignature(null), '');
});

/** localStorage の代わり */
function installStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

const RAW = buildRaw();
function fakeApi(counter) {
  return {
    async network() {
      counter.n += 1;
      return { data: RAW, fetchedAt: RAW.fetchedAt };
    },
  };
}

await asyncTest('同じ事業者の構成なら、保存したものを使い回す', async () => {
  installStorage();
  const counter = { n: 0 };
  const api = fakeApi(counter);
  const sig = operatorSignature({ supported: [{ id: 'Odakyu' }, { id: 'TokyoMetro' }] });
  await loadNetwork(api, CONFIG, { signature: sig });
  const second = await loadNetwork(api, CONFIG, { signature: sig });
  assert.equal(counter.n, 1, '2 回取りに行っている');
  assert.equal(second.cached, true);
});

// チャレンジ2026 を有効にして 7 社 → 15 社になったとき、
// 画面に JR が 24 時間出てこなかった。その再発を防ぐ。
await asyncTest('事業者が増えたら、保存したものを捨てて取り直す', async () => {
  installStorage();
  const counter = { n: 0 };
  const api = fakeApi(counter);
  await loadNetwork(api, CONFIG, { signature: operatorSignature({ supported: [{ id: 'TokyoMetro' }] }) });
  const after = await loadNetwork(api, CONFIG, {
    signature: operatorSignature({ supported: [{ id: 'TokyoMetro' }, { id: 'JR-East' }] }),
  });
  assert.equal(counter.n, 2, '増えたのに取り直していない');
  assert.equal(after.cached, false);
});

await asyncTest('照合する材料が無いときは、従来どおり保存したものを使う', async () => {
  installStorage();
  const counter = { n: 0 };
  const api = fakeApi(counter);
  await loadNetwork(api, CONFIG, {});
  const second = await loadNetwork(api, CONFIG, {});
  assert.equal(counter.n, 1);
  assert.equal(second.cached, true);
});

console.log(`\n${passed} 件のテストが成功${process.exitCode ? '(失敗あり)' : ''}\n`);
