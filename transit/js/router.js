/**
 * 経路探索(ブラウザ内で実行)
 * ------------------------------------------------------------------
 * なぜブラウザ側なのか:
 *   Cloudflare Workers 無料プランの CPU は 1 リクエスト 10ms。
 *   ダイクストラを回すには足りない。一方ブラウザ側は 1 ユーザー分の
 *   計算しかしないため制約がない。除外区間を変えての再探索も
 *   ネットワーク往復なしで即座に終わる。
 *
 * 二段構え:
 *   1) 静的な路線グラフ上で候補経路(駅の並び)を列挙する … 通信ゼロ
 *   2) 候補の乗車駅ぶんだけ時刻表を取りに行き、実時刻を確定する … 通信あり
 */

import { toMinutes, calendarAliases } from './time.js';

/** 候補経路の上限。増やすほど時刻表の取得件数が増える。 */
const MAX_ROUTES = 5;
/** 1 レグあたり検討する列車の本数 */
const TRAINS_PER_LEG = 3;
/** 1 バッチの上限(Worker 側と揃える) */
const BATCH = 20;

/* ================================================================== *
 *  1) 候補経路の列挙(通信なし)
 * ================================================================== */

/**
 * @param {import('./network.js').TransitNetwork} net
 * @param {string} fromGroupId
 * @param {string} toGroupId
 * @param {{excludedRailways?:Set<string>, excludedEdges?:Set<string>}} opts
 */
export function findCandidateRoutes(net, fromGroupId, toGroupId, opts = {}) {
  const excludedRailways = opts.excludedRailways || new Set();
  const excludedEdges = opts.excludedEdges || new Set();

  const found = new Map(); // signature → route

  const collect = (penalty, bannedRailways) => {
    const path = dijkstra(net, fromGroupId, toGroupId, {
      transferPenalty: penalty,
      excludedRailways: new Set([...excludedRailways, ...bannedRailways]),
      excludedEdges,
    });
    if (!path) return null;
    const route = toRoute(net, path);
    if (!route) return null;
    if (!found.has(route.signature)) found.set(route.signature, route);
    return route;
  };

  // 乗換ペナルティを変えて「速い経路」と「乗換が少ない経路」の両方を拾う
  const seeds = [];
  for (const penalty of [0, 5, 12]) {
    const r = collect(penalty, new Set());
    if (r) seeds.push(r);
  }
  // 見つかった経路が使っている路線を 1 本ずつ禁止して、別ルートを探す
  const usedRailways = new Set();
  for (const r of seeds) for (const leg of r.legs) usedRailways.add(leg.railway);
  for (const rw of usedRailways) {
    if (found.size >= MAX_ROUTES + 3) break;
    collect(5, new Set([rw]));
  }

  const routes = [...found.values()];
  routes.sort((a, b) => a.estimatedMinutes - b.estimatedMinutes || a.transfers - b.transfers);
  return routes.slice(0, MAX_ROUTES);
}

function dijkstra(net, fromGroupId, toGroupId, { transferPenalty, excludedRailways, excludedEdges }) {
  const fromGroup = net.groups.get(fromGroupId);
  const toGroup = net.groups.get(toGroupId);
  if (!fromGroup || !toGroup) return null;

  const goal = new Set(toGroup.members);
  const dist = new Map();
  const prev = new Map();
  const heap = new MinHeap();

  for (const sid of fromGroup.members) {
    const st = net.stations.get(sid);
    if (!st || excludedRailways.has(st.railway)) continue;
    dist.set(sid, 0);
    heap.push(0, sid);
  }
  if (heap.size === 0) return null;

  let goalNode = null;
  const visited = new Set();

  while (heap.size) {
    const { key: node, priority: d } = heap.pop();
    if (visited.has(node)) continue;
    visited.add(node);
    if (d > (dist.get(node) ?? Infinity)) continue;
    if (goal.has(node)) {
      goalNode = node;
      break;
    }

    // --- 乗車 ---
    for (const e of net.rideEdges.get(node) || []) {
      if (excludedRailways.has(e.railway)) continue;
      if (excludedEdges.has(edgeKey(e.railway, node, e.to)) || excludedEdges.has(edgeKey(e.railway, e.to, node))) {
        continue;
      }
      relax(node, e.to, d + e.minutes, { type: 'ride', railway: e.railway });
    }

    // --- 同一駅での乗換 ---
    const gid = net.groupOf.get(node);
    const group = gid ? net.groups.get(gid) : null;
    const fromRailway = net.stations.get(node)?.railway;
    if (group) {
      for (const other of group.members) {
        if (other === node) continue;
        const otherRailway = net.stations.get(other)?.railway;
        if (!otherRailway || otherRailway === fromRailway) continue;
        if (excludedRailways.has(otherRailway)) continue;
        const cost = net.transferMinutes(fromRailway, otherRailway, gid) + transferPenalty;
        relax(node, other, d + cost, { type: 'transfer', at: gid });
      }
      // --- 別駅への徒歩連絡 ---
      for (const otherGid of net.walkLinks.get(gid) || []) {
        const og = net.groups.get(otherGid);
        if (!og) continue;
        for (const other of og.members) {
          const otherRailway = net.stations.get(other)?.railway;
          if (!otherRailway || excludedRailways.has(otherRailway)) continue;
          const cost = net.walkMinutes(gid, otherGid) + transferPenalty;
          relax(node, other, d + cost, { type: 'walk', from: gid, to: otherGid });
        }
      }
    }
  }

  if (!goalNode) return null;
  const path = [];
  let cur = goalNode;
  while (cur) {
    const p = prev.get(cur);
    path.push({ station: cur, via: p ? p.via : null });
    cur = p ? p.from : null;
  }
  path.reverse();
  return path;

  function relax(from, to, nd, via) {
    if (nd < (dist.get(to) ?? Infinity)) {
      dist.set(to, nd);
      prev.set(to, { from, via });
      heap.push(nd, to);
    }
  }
}

/** 駅の並びを「レグ(連続乗車区間)」に畳む */
function toRoute(net, path) {
  const legs = [];
  let current = null;
  let estimated = 0;
  let transfers = 0;

  for (let i = 1; i < path.length; i += 1) {
    const step = path[i];
    const prevStation = path[i - 1].station;
    const via = step.via;
    if (!via) return null;

    if (via.type === 'ride') {
      if (!current || current.railway !== via.railway) {
        current = { railway: via.railway, from: prevStation, to: step.station, stops: 1 };
        legs.push(current);
      } else {
        current.to = step.station;
        current.stops += 1;
      }
      const hop = net.config.hopMinutes?.[via.railway] ?? net.config.defaultHopMinutes ?? 2.2;
      estimated += hop;
    } else if (via.type === 'transfer' || via.type === 'walk') {
      const cost =
        via.type === 'transfer'
          ? net.transferMinutes(net.stations.get(prevStation)?.railway, net.stations.get(step.station)?.railway, via.at)
          : net.walkMinutes(via.from, via.to);
      legs.push({ transfer: true, kind: via.type, from: prevStation, to: step.station, minutes: cost });
      estimated += cost;
      transfers += 1;
      current = null;
    }
  }

  const rideLegs = legs.filter((l) => !l.transfer);
  if (!rideLegs.length) return null;

  const signature = legs
    .map((l) => (l.transfer ? `T:${l.from}>${l.to}` : `R:${l.railway}:${l.from}>${l.to}`))
    .join('|');

  return {
    id: signature,
    signature,
    legs,
    rideLegs,
    transfers,
    estimatedMinutes: estimated,
    origin: path[0].station,
    destination: path[path.length - 1].station,
  };
}

export function edgeKey(railway, a, b) {
  return `${railway}::${a}::${b}`;
}

/* ================================================================== *
 *  2) 時刻表のバインド(通信あり)
 * ================================================================== */

/**
 * 候補経路に実時刻を割り当てる。
 * @returns {Promise<{routes:Array, warnings:Array, fetchedAt:string|null}>}
 */
export async function bindSchedule(routes, { api, net, calendarUrn, departAt, stores }) {
  const warnings = [];
  const timetableStore = stores.timetables; // Map<stationId, StationTimetable[]>
  const trainStore = stores.trains; // Map<trainId, TrainTimetable>
  let fetchedAt = null;

  // --- 乗車駅の時刻表をまとめて取得 ---
  const needed = new Set();
  for (const r of routes) for (const leg of r.rideLegs) if (!timetableStore.has(leg.from)) needed.add(leg.from);

  const neededList = [...needed];
  if (neededList.length > BATCH * 2) {
    warnings.push({
      code: 'ROUTES_TRIMMED',
      message: '候補経路が多いため、上位のみ時刻を確定しました。',
    });
  }
  for (const batch of chunkArray(neededList.slice(0, BATCH * 2), BATCH)) {
    const res = await api.timetables(batch, calendarUrn);
    fetchedAt = res.fetchedAt || fetchedAt;
    for (const tt of res.data.timetables || []) {
      if (!timetableStore.has(tt.station)) timetableStore.set(tt.station, []);
      timetableStore.get(tt.station).push(tt);
    }
    for (const b of batch) if (!timetableStore.has(b)) timetableStore.set(b, []);
    for (const e of res.data.errors || []) {
      warnings.push({ code: 'TIMETABLE_PARTIAL', message: `${net.stationTitle(e.station)}の時刻表を取得できませんでした` });
    }
  }

  // --- レグを段階的に解決(次のレグの出発は前のレグの到着に依存する) ---
  const state = routes.map((r) => ({ route: r, cursor: departAt, legIndex: 0, resolved: [], failed: false }));
  const maxLegs = Math.max(...routes.map((r) => r.legs.length), 0);

  for (let level = 0; level < maxLegs; level += 1) {
    // (a) この段で必要な列車 ID を集める
    const wanted = new Map(); // trainId → [{stateRef, leg, row}]
    for (const s of state) {
      if (s.failed) continue;
      const leg = s.route.legs[s.legIndex];
      if (!leg) continue;
      if (leg.transfer) {
        s.cursor += leg.minutes;
        s.resolved.push({ ...leg, at: s.cursor });
        s.legIndex += 1;
        continue;
      }
      const rows = pickDepartures(net, timetableStore, leg, calendarUrn, s.cursor);
      s.pending = { leg, rows };
      for (const row of rows) {
        if (!row.train) continue;
        if (trainStore.has(row.train)) continue;
        if (!wanted.has(row.train)) wanted.set(row.train, true);
      }
    }

    // (b) 列車時刻表をまとめて取得
    const ids = [...wanted.keys()].slice(0, BATCH * 2);
    for (const batch of chunkArray(ids, BATCH)) {
      try {
        const res = await api.trains(batch);
        fetchedAt = res.fetchedAt || fetchedAt;
        for (const t of res.data.trains || []) trainStore.set(t.id, t);
        // ID が引けなかったものは推定にフォールバックさせる
        for (const b of batch) if (!trainStore.has(b)) trainStore.set(b, null);
      } catch (e) {
        for (const b of batch) trainStore.set(b, null);
        warnings.push({ code: 'TRAIN_PARTIAL', message: '列車時刻表を取得できず、一部区間は所要時間を推定しています。' });
      }
    }

    // (c) 各経路の当該レグを確定
    for (const s of state) {
      if (s.failed || !s.pending) continue;
      const { leg, rows } = s.pending;
      s.pending = null;
      const best = chooseTrain(net, leg, rows, trainStore, s.cursor);
      if (!best) {
        s.failed = true;
        continue;
      }
      s.resolved.push({ ...leg, ...best });
      s.cursor = best.arrival;
      s.legIndex += 1;
    }
  }

  const out = [];
  for (const s of state) {
    if (s.failed || !s.resolved.length) continue;
    const rides = s.resolved.filter((l) => !l.transfer);
    if (!rides.length) continue;
    const departure = rides[0].departure;
    const arrival = rides[rides.length - 1].arrival;
    out.push({
      ...s.route,
      legs: s.resolved,
      departure,
      arrival,
      totalMinutes: arrival - departAt,
      rideMinutes: arrival - departure,
      waitMinutes: departure - departAt,
      estimatedOnly: s.resolved.some((l) => l.estimated),
    });
  }

  out.sort((a, b) => a.arrival - b.arrival || a.transfers - b.transfers);
  return { routes: out, warnings, fetchedAt };
}

/** 指定レグの出発候補(時刻順に TRAINS_PER_LEG 本) */
function pickDepartures(net, timetableStore, leg, calendarUrn, notBefore) {
  const tables = timetableStore.get(leg.from) || [];
  const direction = net.directionFor(leg.railway, leg.from, leg.to);
  const aliases = new Set(calendarAliases(calendarUrn));

  const rows = [];
  for (const tt of tables) {
    if (tt.railway !== leg.railway) continue;
    if (tt.calendar && !aliases.has(tt.calendar)) continue;
    if (direction && tt.direction && tt.direction !== direction) continue;
    for (const r of tt.rows) {
      const m = toMinutes(r.time);
      if (m == null) continue;
      // 深夜帯(営業日 24 時以降)の便は分数がそのまま 24 時間を超える
      if (m < notBefore) continue;
      rows.push({ ...r, minutes: m, direction: tt.direction });
    }
  }
  rows.sort((a, b) => a.minutes - b.minutes);
  return rows.slice(0, TRAINS_PER_LEG);
}

/** 候補列車から、目的駅に最も早く着くものを選ぶ */
function chooseTrain(net, leg, rows, trainStore, notBefore) {
  let best = null;

  for (const row of rows) {
    const tt = row.train ? trainStore.get(row.train) : null;
    if (tt) {
      const dep = findStopTime(tt, leg.from, 'dep');
      const arr = findStopTime(tt, leg.to, 'arr');
      if (dep != null && arr != null && arr > dep) {
        if (!best || arr < best.arrival) {
          best = {
            departure: dep,
            arrival: arr,
            trainNo: tt.no || row.no,
            trainType: tt.type || row.type,
            destination: (tt.dest && tt.dest[0]) || (row.dest && row.dest[0]) || null,
            estimated: false,
          };
        }
        continue;
      }
      // その列車は目的駅に停まらない(通過・別方面)
      continue;
    }
    // 列車時刻表が引けない場合は駅数×平均所要で推定する
    const hop = net.config.hopMinutes?.[leg.railway] ?? net.config.defaultHopMinutes ?? 2.2;
    const arrival = row.minutes + Math.max(1, leg.stops) * hop;
    if (!best || arrival < best.arrival) {
      best = {
        departure: row.minutes,
        arrival,
        trainNo: row.no,
        trainType: row.type,
        destination: (row.dest && row.dest[0]) || null,
        estimated: true,
      };
    }
  }

  if (best && best.departure < notBefore) return null;
  return best;
}

function findStopTime(trainTimetable, stationId, prefer) {
  for (const s of trainTimetable.stops || []) {
    const isHere = s.depSt === stationId || s.arrSt === stationId;
    if (!isHere) continue;
    const dep = toMinutes(s.dep);
    const arr = toMinutes(s.arr);
    if (prefer === 'dep') return dep ?? arr;
    return arr ?? dep;
  }
  return null;
}

function chunkArray(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/* ------------------------------------------------------------------ *
 *  最小ヒープ
 * ------------------------------------------------------------------ */
class MinHeap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(priority, key) {
    this.items.push({ priority, key });
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].priority <= this.items[i].priority) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }
  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.items[l].priority < this.items[m].priority) m = l;
        if (r < this.items.length && this.items[r].priority < this.items[m].priority) m = r;
        if (m === i) break;
        [this.items[m], this.items[i]] = [this.items[i], this.items[m]];
        i = m;
      }
    }
    return top;
  }
}
