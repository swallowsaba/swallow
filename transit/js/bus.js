/**
 * バス経路の探索
 * ==================================================================
 * 【前提となる制約】
 * ODPT の API は 1 レスポンス 1000 件が上限で、ページングが無い。
 * 都営バスの停留所ポールはこれを大きく超えるため、鉄道のように
 * 「全バス停を取得してグラフを作る」ことができない。
 *
 * 【回避策】
 * バス停オブジェクトは「自分を通る系統の一覧」を持ち、
 * 系統オブジェクトは「停車順(停留所名つき)」を持っている。
 * この 2 つだけで、必要な範囲の経路網をその場で組み立てられる。
 *
 *   直通バス   : 両端のバス停の系統 ID の積集合をとる(通信ゼロで判定)
 *   バス→鉄道 : 出発バス停を通る系統の停車順から「◯◯駅前」を拾い、
 *                その駅名を鉄道の駅に突き合わせて乗り継ぎ地点にする
 *   鉄道→バス : 目的バス停を通る系統について、同じことを逆向きに行う
 *
 * 停留所名から駅名を引き当てる方式なので、バス停の座標も全件データも要らない。
 */

import { toMinutes, dateKey } from './time.js';
import { normalizeTitle } from './network.js';

/** 1 検索で扱う直通系統の上限 */
const MAX_PATTERNS = 6;
/** 乗り継ぎ検討のために取得する系統の上限(1 バッチ) */
const MAX_TRANSFER_PATTERNS = 20;
/** 1 系統あたり検討する便の本数 */
const RUNS_PER_PATTERN = 3;
/** 便別時刻が引けないときの、停留所 1 区間あたりの推定所要(分) */
const BUS_MINUTES_PER_STOP = 2.2;
/** バス停と駅の間の徒歩(分)。ODPT にこのデータは無いため既定値 */
const DEFAULT_BUS_STATION_WALK = 5;
/** 片側あたり採用する乗り継ぎ駅の数。増やすとリクエストが増える */
const MAX_TRANSFER_STATIONS = 2;

/* ================================================================== *
 *  名前の扱い
 * ================================================================== */

/**
 * バス停名の候補を作る。
 * 「渋谷」と入力されてもバス停の正式名は「渋谷駅前」のことが多い。
 * ODPT は部分一致検索に対応していないので、こちらで候補を並べて総当たりする。
 */
export function busStopNameCandidates(name) {
  const base = String(name || '').trim().replace(/\s+/g, '');
  if (!base) return [];
  const out = new Set([base]);
  if (base.endsWith('駅前')) {
    out.add(base.slice(0, -2)); // 渋谷駅前 → 渋谷
  } else if (base.endsWith('駅')) {
    out.add(`${base}前`); // 渋谷駅 → 渋谷駅前
    out.add(base.slice(0, -1)); // 渋谷駅 → 渋谷
  } else {
    out.add(`${base}駅前`); // 渋谷 → 渋谷駅前
  }
  // 候補数 × 事業者数がそのままサブリクエスト数になるので絞る
  return [...out].slice(0, 3);
}

/**
 * バス停名から駅名らしき部分を取り出す。
 *   「渋谷駅前」        → 「渋谷」
 *   「東京駅丸の内北口」 → 「東京」
 *   「大手町」          → 「大手町」(駅名と同じ停留所もある)
 */
export function busStopToStationName(name) {
  let s = String(name || '').trim().replace(/\s+/g, '');
  s = s.replace(/[（(].*?[)）]/g, '');
  const i = s.indexOf('駅');
  if (i > 0) s = s.slice(0, i);
  return s;
}

/** バス停名に対応する鉄道の駅グループを返す(見つからなければ null) */
export function stationGroupForBusStop(net, stopName) {
  const base = busStopToStationName(stopName);
  if (!base || base.length < 2) return null;
  const want = normalizeTitle(base);
  for (const g of net.searchGroups(base, 5)) {
    if (normalizeTitle(g.title) === want) return g;
  }
  return null;
}

/* ================================================================== *
 *  共通の下ごしらえ
 * ================================================================== */

/**
 * 出発地・目的地の名前からバス停を引く。1 リクエストで両方まとめて取る。
 * @returns {{originStops:Array, destStops:Array, fetchedAt:string|null, failed:boolean}}
 */
async function loadEndpointStops(api, fromLabel, toLabel) {
  const fromNames = busStopNameCandidates(fromLabel);
  const toNames = busStopNameCandidates(toLabel);
  if (!fromNames.length && !toNames.length) {
    return { originStops: [], destStops: [], fetchedAt: null, failed: false, errors: [] };
  }
  const names = [...new Set([...fromNames, ...toNames])].slice(0, 8);
  try {
    const res = await api.busStops(names);
    const stops = res.data.stops || [];
    const fromSet = new Set(fromNames);
    const toSet = new Set(toNames);
    return {
      originStops: stops.filter((s) => fromSet.has(s.query)),
      destStops: stops.filter((s) => toSet.has(s.query)),
      fetchedAt: res.fetchedAt || null,
      failed: false,
      errors: res.data.errors || [],
    };
  } catch {
    return { originStops: [], destStops: [], fetchedAt: null, failed: true, errors: [] };
  }
}

/** その日に適用されるカレンダーの集合(セッション中は使い回す) */
async function loadActiveCalendars(api, serviceDate, store, warnings) {
  if (!store.calendars) {
    try {
      const res = await api.busCalendars();
      store.calendars = res.data.calendars || [];
      store.calendarsFetchedAt = res.fetchedAt || null;
    } catch {
      store.calendars = [];
      warnings.push({ code: 'BUS_CALENDAR', message: 'バスのカレンダーを取得できませんでした' });
    }
  }
  const key = dateKey(serviceDate);
  return new Set(store.calendars.filter((c) => c.days.includes(key)).map((c) => c.id));
}

/** バス停時刻表を (ポール|系統) → 発車時刻[] の索引にする */
function buildDepartureIndex(timetables, activeCalendars) {
  const index = new Map();
  for (const tt of timetables) {
    if (activeCalendars.size && tt.calendar && !activeCalendars.has(tt.calendar)) continue;
    for (const row of tt.rows) {
      const m = toMinutes(row.time);
      if (m == null) continue;
      const k = `${tt.pole}|${row.pattern}`;
      if (!index.has(k)) index.set(k, []);
      index.get(k).push({ minutes: m, calendar: tt.calendar, destSign: row.destSign });
    }
  }
  for (const arr of index.values()) arr.sort((a, b) => a.minutes - b.minutes);
  return index;
}

/** 指定時刻に出発する便を特定し、到着時刻を返す */
function resolveRun(runs, fromPole, toPole, departureMinutes) {
  if (!runs || !runs.length) return null;
  for (const run of runs) {
    const f = run.stops.find((s) => s.pole === fromPole);
    if (!f) continue;
    const dep = toMinutes(f.dep) ?? toMinutes(f.arr);
    if (dep !== departureMinutes) continue;
    const t = run.stops.find((s) => s.pole === toPole);
    if (!t) continue;
    const arr = toMinutes(t.arr) ?? toMinutes(t.dep);
    if (arr == null || arr <= dep) continue;
    return { departure: dep, arrival: arr, estimated: false };
  }
  return null;
}

/**
 * 1 本のバス乗車を確定する。
 * 実時刻が判る便を優先し、無い場合だけ停留所数からの推定にフォールバックする。
 * (推定値と実測値を同じ土俵で比べると、実在しない速い便が選ばれてしまう)
 */
function pickBusRide(departures, runsByPattern, seg, notBefore) {
  const cands = (departures.get(`${seg.fromPole}|${seg.pattern.id}`) || []).filter((c) => c.minutes >= notBefore);
  if (!cands.length) return null;

  const exact = [];
  const estimated = [];
  for (const c of cands.slice(0, RUNS_PER_PATTERN)) {
    const r = resolveRun(runsByPattern.get(seg.pattern.id), seg.fromPole, seg.toPole, c.minutes);
    if (r) exact.push({ ...r, destSign: c.destSign });
    else {
      estimated.push({
        departure: c.minutes,
        arrival: c.minutes + Math.max(1, seg.stops) * BUS_MINUTES_PER_STOP,
        estimated: true,
        destSign: c.destSign,
      });
    }
  }
  const pool = exact.length ? exact : estimated;
  return pool.reduce((a, b) => (a && a.arrival <= b.arrival ? a : b), null);
}

/** バスのレグ(表示用の名前を埋め込んでおく。ID から名前を復元できないため) */
function busLeg(seg, ride) {
  return {
    bus: true,
    from: seg.fromPole,
    to: seg.toPole,
    fromTitle: seg.fromTitle,
    toTitle: seg.toTitle,
    lineTitle: seg.pattern.title || seg.pattern.busroute || 'バス',
    operatorTitle: '都営バス',
    stops: seg.stops,
    departure: ride.departure,
    arrival: ride.arrival,
    destination: ride.destSign || null,
    estimated: Boolean(ride.estimated),
  };
}

/** 徒歩のレグ */
function walkLeg(from, to, fromTitle, toTitle, minutes, at) {
  return { transfer: true, kind: 'walk', from, to, fromTitle, toTitle, minutes, at };
}

/* ================================================================== *
 *  1) 直通バス
 * ================================================================== */

/**
 * 乗り換えなしで行けるバス便を探す。
 * @returns {Promise<{routes:Array, warnings:Array, fetchedAt:string|null, searched:boolean, context:object}>}
 */
export async function findBusRoutes(api, fromLabel, toLabel, { departAt, serviceDate, store, context }) {
  const warnings = [];
  let fetchedAt = null;

  const ctx = context || (await loadEndpointStops(api, fromLabel, toLabel));
  fetchedAt = ctx.fetchedAt || fetchedAt;
  if (ctx.failed) {
    warnings.push({ code: 'BUS_UNAVAILABLE', message: 'バス停の情報を取得できませんでした' });
    return { routes: [], warnings, fetchedAt, searched: true, context: ctx };
  }
  for (const e of ctx.errors || []) {
    warnings.push({ code: 'BUS_STOP_PARTIAL', message: `バス停「${e.query}」を取得できませんでした` });
  }
  if (!ctx.originStops.length || !ctx.destStops.length) {
    return { routes: [], warnings, fetchedAt, searched: true, context: ctx };
  }

  /* --- 系統 ID の積集合(通信ゼロ) --- */
  const toPatterns = new Map();
  for (const s of ctx.destStops) {
    for (const p of s.patterns) {
      if (!toPatterns.has(p)) toPatterns.set(p, []);
      toPatterns.get(p).push(s);
    }
  }
  const common = new Map();
  for (const s of ctx.originStops) {
    for (const p of s.patterns) {
      if (!toPatterns.has(p)) continue;
      if (!common.has(p)) common.set(p, { fromStops: [], toStops: toPatterns.get(p) });
      common.get(p).fromStops.push(s);
    }
  }
  if (!common.size) return { routes: [], warnings, fetchedAt, searched: true, context: ctx };

  const patternIds = [...common.keys()].slice(0, MAX_PATTERNS);

  /* --- 系統の停車順 --- */
  let patterns;
  try {
    const res = await api.busPatterns(patternIds);
    fetchedAt = res.fetchedAt || fetchedAt;
    patterns = res.data.patterns || [];
  } catch {
    warnings.push({ code: 'BUS_UNAVAILABLE', message: 'バス系統の情報を取得できませんでした' });
    return { routes: [], warnings, fetchedAt, searched: true, context: ctx };
  }

  const segments = [];
  for (const pat of patterns) {
    const indexOf = new Map(pat.order.map((o) => [o.pole, o.i]));
    const entry = common.get(pat.id);
    if (!entry) continue;
    for (const f of entry.fromStops) {
      const fi = indexOf.get(f.id);
      if (fi === undefined) continue;
      for (const t of entry.toStops) {
        const ti = indexOf.get(t.id);
        if (ti === undefined || ti <= fi) continue; // 逆方向は除外
        segments.push({
          pattern: pat,
          fromPole: f.id,
          toPole: t.id,
          fromTitle: f.title,
          toTitle: t.title,
          stops: ti - fi,
        });
      }
    }
  }
  if (!segments.length) return { routes: [], warnings, fetchedAt, searched: true, context: ctx };

  /* --- カレンダー・時刻表・便 --- */
  const activeCalendars = await loadActiveCalendars(api, serviceDate, store, warnings);

  let timetables = [];
  try {
    const poles = [...new Set(segments.map((s) => s.fromPole))].slice(0, 20);
    const res = await api.busTimetables(poles);
    fetchedAt = res.fetchedAt || fetchedAt;
    timetables = res.data.timetables || [];
  } catch {
    warnings.push({ code: 'BUS_UNAVAILABLE', message: 'バスの時刻表を取得できませんでした' });
    return { routes: [], warnings, fetchedAt, searched: true, context: ctx };
  }

  // バス停時刻表を出していない事業者もあるので、ここが空でも打ち切らない
  // (loadRuns が便別時刻表から発車時刻を復元する)
  const departures = buildDepartureIndex(timetables, activeCalendars);
  if (!departures.size && !activeCalendars.size) {
    warnings.push({ code: 'BUS_CALENDAR', message: 'この日に適用されるバスのダイヤを特定できませんでした。' });
  }

  const runsByPattern = await loadRuns(api, departures, segments, departAt, activeCalendars, warnings, (at) => {
    fetchedAt = at || fetchedAt;
  });

  /* --- 経路を組み立てる --- */
  const routes = [];
  for (const seg of segments) {
    const ride = pickBusRide(departures, runsByPattern, seg, departAt);
    if (!ride) continue;
    routes.push(makeRoute([busLeg(seg, ride)], departAt, 'bus'));
  }

  return { routes: dedupe(routes).slice(0, 4), warnings, fetchedAt, searched: true, context: ctx };
}

/* ================================================================== *
 *  2) バス ⇄ 鉄道 の複合経路
 * ================================================================== */

/**
 * バスと鉄道を乗り継ぐ経路を探す。
 *
 * 対応するのは「バス→鉄道」と「鉄道→バス」の 2 通り(バスは 1 本)。
 * 「バス→鉄道→バス」はリクエスト数が倍になるため対象外。
 *
 * @param {object} deps { api, net, railSearch }
 *   railSearch(fromGroupId, toGroupId, departAt) → Promise<{routes, fetchedAt, warnings}>
 */
export async function findIntermodalRoutes(
  { api, net, railSearch },
  fromLabel,
  toLabel,
  { fromGroupId, toGroupId, departAt, serviceDate, store, context }
) {
  const warnings = [];
  let fetchedAt = null;
  const walkMinutes = net.config?.busStationWalkMinutes ?? DEFAULT_BUS_STATION_WALK;

  const ctx = context || (await loadEndpointStops(api, fromLabel, toLabel));
  fetchedAt = ctx.fetchedAt || fetchedAt;
  if (ctx.failed || (!ctx.originStops.length && !ctx.destStops.length)) {
    return { routes: [], warnings, fetchedAt, context: ctx };
  }

  /* --- 乗り継ぎ候補になりうる系統をまとめて取得(1 リクエスト) --- */
  const patternIds = [
    ...new Set([
      ...ctx.originStops.flatMap((s) => s.patterns),
      ...ctx.destStops.flatMap((s) => s.patterns),
    ]),
  ].slice(0, MAX_TRANSFER_PATTERNS);
  if (!patternIds.length) return { routes: [], warnings, fetchedAt, context: ctx };

  let patterns = [];
  try {
    const res = await api.busPatterns(patternIds);
    fetchedAt = res.fetchedAt || fetchedAt;
    patterns = res.data.patterns || [];
  } catch {
    warnings.push({ code: 'BUS_UNAVAILABLE', message: 'バス系統の情報を取得できませんでした' });
    return { routes: [], warnings, fetchedAt, context: ctx };
  }
  const patternById = new Map(patterns.map((p) => [p.id, p]));

  /* --- バス→鉄道: 出発バス停から乗って、駅で降りる区間 --- */
  const outbound = collectTransfers(net, ctx.originStops, patternById, 'after', fromGroupId, toGroupId);
  /* --- 鉄道→バス: 駅から乗って、目的バス停で降りる区間 --- */
  const inbound = collectTransfers(net, ctx.destStops, patternById, 'before', toGroupId, fromGroupId);

  if (!outbound.length && !inbound.length) {
    return { routes: [], warnings, fetchedAt, context: ctx };
  }

  /* --- 時刻表(1 リクエスト) --- */
  const activeCalendars = await loadActiveCalendars(api, serviceDate, store, warnings);
  const poles = [...new Set([...outbound.map((s) => s.fromPole), ...inbound.map((s) => s.fromPole)])].slice(0, 20);
  let timetables = [];
  try {
    const res = await api.busTimetables(poles);
    fetchedAt = res.fetchedAt || fetchedAt;
    timetables = res.data.timetables || [];
  } catch {
    warnings.push({ code: 'BUS_UNAVAILABLE', message: 'バスの時刻表を取得できませんでした' });
    return { routes: [], warnings, fetchedAt, context: ctx };
  }
  const departures = buildDepartureIndex(timetables, activeCalendars);

  const allSegments = [...outbound, ...inbound];
  const runsByPattern = await loadRuns(api, departures, allSegments, departAt, activeCalendars, warnings, (at) => {
    fetchedAt = at || fetchedAt;
  });

  const routes = [];

  /* ---- パターン A: バス → 徒歩 → 鉄道 ---- */
  // 目的地が駅でなければ鉄道で締めくくれないので A は成立しない
  for (const seg of toGroupId ? pickBest(outbound, departures, runsByPattern, departAt) : []) {
    const ride = pickBusRide(departures, runsByPattern, seg, departAt);
    if (!ride) continue;
    const railFrom = seg.stationGroup.id;
    if (railFrom === toGroupId) continue; // 直通バスで完結。ここでは扱わない
    const rail = await railSearch(railFrom, toGroupId, ride.arrival + walkMinutes);
    fetchedAt = rail.fetchedAt || fetchedAt;
    for (const w of rail.warnings || []) warnings.push(w);
    const best = (rail.routes || [])[0];
    if (!best) continue;
    const legs = [
      busLeg(seg, ride),
      walkLeg(seg.toPole, best.legs[0]?.from ?? railFrom, seg.toTitle, net.stationTitle(best.legs[0]?.from), walkMinutes, ride.arrival + walkMinutes),
      ...best.legs,
    ];
    routes.push(makeRoute(legs, departAt, 'mixed', best.warnings));
  }

  /* ---- パターン B: 鉄道 → 徒歩 → バス ---- */
  // 出発地が駅でなければ鉄道から始められないので B は成立しない
  for (const seg of fromGroupId ? inbound.slice(0, MAX_TRANSFER_STATIONS) : []) {
    const railTo = seg.stationGroup.id;
    if (railTo === fromGroupId) continue;
    const rail = await railSearch(fromGroupId, railTo, departAt);
    fetchedAt = rail.fetchedAt || fetchedAt;
    for (const w of rail.warnings || []) warnings.push(w);
    const best = (rail.routes || [])[0];
    if (!best) continue;
    const ride = pickBusRide(departures, runsByPattern, seg, best.arrival + walkMinutes);
    if (!ride) continue;
    const lastRail = best.legs.filter((l) => !l.transfer).slice(-1)[0];
    const legs = [
      ...best.legs,
      walkLeg(lastRail?.to ?? railTo, seg.fromPole, net.stationTitle(lastRail?.to), seg.fromTitle, walkMinutes, best.arrival + walkMinutes),
      busLeg(seg, ride),
    ];
    routes.push(makeRoute(legs, departAt, 'mixed', best.warnings));
  }

  return { routes: dedupe(routes).slice(0, 4), warnings, fetchedAt, context: ctx };
}

/**
 * バス停を通る系統から「駅に対応する停留所」を拾って乗り継ぎ区間を作る。
 * @param {'after'|'before'} side  出発側なら after(バス停より後の停留所)、
 *                                 到着側なら before(バス停より前の停留所)
 */
function collectTransfers(net, stops, patternById, side, ownGroupId, otherGroupId) {
  const found = new Map(); // 駅グループID → 最良の区間
  for (const stop of stops) {
    for (const pid of stop.patterns) {
      const pat = patternById.get(pid);
      if (!pat) continue;
      const idx = pat.order.findIndex((o) => o.pole === stop.id);
      if (idx < 0) continue;
      const range = side === 'after' ? pat.order.slice(idx + 1) : pat.order.slice(0, idx);
      for (const o of range) {
        const group = stationGroupForBusStop(net, o.note || '');
        if (!group) continue;
        if (group.id === ownGroupId || group.id === otherGroupId) continue;
        const stopsCount = Math.abs(o.i - pat.order[idx].i);
        if (!stopsCount) continue;
        const seg =
          side === 'after'
            ? {
                pattern: pat,
                fromPole: stop.id,
                toPole: o.pole,
                fromTitle: stop.title,
                toTitle: o.note || '',
                stops: stopsCount,
                stationGroup: group,
              }
            : {
                pattern: pat,
                fromPole: o.pole,
                toPole: stop.id,
                fromTitle: o.note || '',
                toTitle: stop.title,
                stops: stopsCount,
                stationGroup: group,
              };
        const prev = found.get(group.id);
        if (!prev || seg.stops < prev.stops) found.set(group.id, seg);
      }
    }
  }
  // 乗車停留所数が少ない順 = 早く鉄道に乗り継げる順
  return [...found.values()].sort((a, b) => a.stops - b.stops).slice(0, MAX_TRANSFER_STATIONS);
}

/** 実際に便がある区間だけを、時刻の早い順に返す */
function pickBest(segments, departures, runsByPattern, departAt) {
  return segments
    .map((seg) => ({ seg, ride: pickBusRide(departures, runsByPattern, seg, departAt) }))
    .filter((x) => x.ride)
    .sort((a, b) => a.ride.arrival - b.ride.arrival)
    .slice(0, MAX_TRANSFER_STATIONS)
    .map((x) => x.seg);
}

/* ================================================================== *
 *  共通
 * ================================================================== */

/**
 * 便別時刻表を取得し、必要なら発車時刻もそこから組み立てる。
 *
 * バス停時刻表(odpt:BusstopPoleTimetable)を出しているのは都営バスと東急バスだけで、
 * 西武バス・相鉄バス・横浜市営バス・神奈中などは便別時刻表しか無い。
 * そこで、バス停時刻表から発車時刻が拾えなかった区間については
 * カレンダーを指定せずに便別時刻表を引き、その停車時刻から発車時刻を復元する。
 */
async function loadRuns(api, departures, segments, departAt, activeCalendars, warnings, onFetchedAt) {
  const requests = [];
  const seen = new Set();
  /** 発車時刻が判らず、便別時刻表から復元する必要がある区間 */
  const needsDerive = [];

  for (const seg of segments) {
    const cands = (departures.get(`${seg.fromPole}|${seg.pattern.id}`) || []).filter((c) => c.minutes >= departAt);
    if (!cands.length) {
      const k = `derive|${seg.pattern.id}`;
      needsDerive.push(seg);
      if (!seen.has(k)) {
        seen.add(k);
        requests.push({ pattern: seg.pattern.id }); // カレンダー指定なし = 全ダイヤ
      }
      continue;
    }
    for (const c of cands.slice(0, RUNS_PER_PATTERN)) {
      const k = `${seg.pattern.id}|${c.calendar}`;
      if (seen.has(k)) continue;
      seen.add(k);
      requests.push({ pattern: seg.pattern.id, calendar: c.calendar });
    }
  }

  const byPattern = new Map();
  if (!requests.length) return byPattern;
  try {
    const res = await api.busRuns(requests.slice(0, 10));
    onFetchedAt(res.fetchedAt);
    for (const r of res.data.runs || []) {
      if (!byPattern.has(r.pattern)) byPattern.set(r.pattern, []);
      byPattern.get(r.pattern).push(r);
    }
  } catch {
    warnings.push({ code: 'BUS_ESTIMATED', message: 'バスの便別時刻を取得できず、所要時間を推定しています。' });
    return byPattern;
  }

  // 便別時刻表から発車時刻を復元する
  for (const seg of needsDerive) {
    const key = `${seg.fromPole}|${seg.pattern.id}`;
    if (departures.has(key) && departures.get(key).length) continue;
    const list = [];
    for (const run of byPattern.get(seg.pattern.id) || []) {
      if (activeCalendars.size && run.calendar && !activeCalendars.has(run.calendar)) continue;
      const stop = run.stops.find((x) => x.pole === seg.fromPole);
      if (!stop) continue;
      const m = toMinutes(stop.dep) ?? toMinutes(stop.arr);
      if (m == null) continue;
      list.push({ minutes: m, calendar: run.calendar, destSign: null });
    }
    if (list.length) {
      list.sort((a, b) => a.minutes - b.minutes);
      departures.set(key, list);
    }
  }

  return byPattern;
}

/** レグの並びから経路オブジェクトを作る */
function makeRoute(legs, departAt, kind, inheritedWarnings) {
  const rides = legs.filter((l) => !l.transfer);
  const departure = rides[0].departure;
  const arrival = rides[rides.length - 1].arrival;
  const transfers = legs.filter((l) => l.transfer).length;
  const signature = legs
    .map((l) => (l.transfer ? `W:${l.from}>${l.to}` : `${l.bus ? 'B' : 'R'}:${l.lineTitle || l.railway}:${l.from}>${l.to}`))
    .join('|');
  return {
    id: `${kind}:${signature}:${departure}`,
    signature,
    kind,
    legs,
    transfers,
    departure,
    arrival,
    totalMinutes: arrival - departAt,
    rideMinutes: arrival - departure,
    waitMinutes: departure - departAt,
    estimatedOnly: legs.some((l) => l.estimated),
    warnings: inheritedWarnings || [],
  };
}

/** 同じ経路は最速の 1 本だけ残す */
function dedupe(routes) {
  const best = new Map();
  for (const r of routes) {
    const prev = best.get(r.signature);
    if (!prev || r.arrival < prev.arrival) best.set(r.signature, r);
  }
  return [...best.values()].sort((a, b) => a.arrival - b.arrival);
}
