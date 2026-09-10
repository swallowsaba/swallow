/**
 * GTFS 由来のバス検索
 * ==================================================================
 * ODPT が API 形式の提供をやめた事業者(京王バス・小田急バス・西東京バス)は、
 * GitHub Actions が作った索引 transit/data/gtfs/ を読んで検索する。
 *
 * 【ODPT の API 版と違うところ】
 * ・データは**スナップショット**。取り込んだ日のダイヤで、その後の変更は入らない。
 *   取り込み日を必ず画面に出すこと。
 * ・Worker を通さない。GitHub Pages 上の静的ファイルを直接読む。
 *   したがってトークンも要らず、Worker の無料枠も消費しない。
 *
 * 【読み込み方】
 * 索引(index.json)は事業者ごとに 1 ファイル。停留所名で引けるようになっている。
 * 系統の時刻表は分割してあり、必要なものだけを取りに行く。
 */

const BASE = './data/gtfs';

/** 事業者ごとの索引と、取りに行った系統ファイルを覚えておく */
const cache = {
  catalog: null,
  index: new Map(), // operatorId → index.json
  shards: new Map(), // `${op}:${shard}` → Map<patternId, pattern>
};

/* ------------------------------------------------------------------ *
 *  読み込み
 * ------------------------------------------------------------------ */

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} を読めませんでした (HTTP ${res.status})`);
  return res.json();
}

/** どの事業者の索引があるか。無ければ null(この機能は使えない)。 */
export async function loadCatalog() {
  if (cache.catalog !== null) return cache.catalog;
  try {
    cache.catalog = await getJson(`${BASE}/catalog.json`);
  } catch {
    // 索引がまだ作られていない状態。エラーではなく「未導入」として扱う。
    cache.catalog = { operators: [], missing: true };
  }
  return cache.catalog;
}

async function loadIndex(operatorId) {
  if (cache.index.has(operatorId)) return cache.index.get(operatorId);
  const idx = await getJson(`${BASE}/${operatorId}/index.json`);
  cache.index.set(operatorId, idx);
  return idx;
}

async function loadPattern(operatorId, index, patternId) {
  const shard = Math.floor(patternId / (index.perShard || 40));
  const key = `${operatorId}:${shard}`;
  if (!cache.shards.has(key)) {
    const body = await getJson(`${BASE}/${operatorId}/patterns/${shard}.json`);
    cache.shards.set(key, new Map((body.patterns || []).map((p) => [p.i, p])));
  }
  return cache.shards.get(key).get(patternId) || null;
}

/* ------------------------------------------------------------------ *
 *  運行日
 * ------------------------------------------------------------------ */

/**
 * その日に走る運行日(service_id)かどうか。
 * @param {object} cal 索引の calendars[serviceId]
 * @param {Date} serviceDate 営業日
 */
export function runsOn(cal, serviceDate) {
  if (!cal) return false;
  const iso = isoDate(serviceDate);
  if (cal.del?.includes(iso)) return false;
  if (cal.add?.includes(iso)) return true;
  if (cal.d == null) return false; // 定義が無いものは走らせない(嘘の便を出さないため)
  if (cal.from && iso < cal.from) return false;
  if (cal.to && iso > cal.to) return false;
  return Boolean(cal.d & (1 << serviceDate.getDay()));
}

function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ------------------------------------------------------------------ *
 *  検索
 * ------------------------------------------------------------------ */

/** 名前でバス停を探す(完全一致 → 前方一致 → 部分一致) */
export function findStops(index, name) {
  const q = String(name || '').trim();
  if (!q) return [];
  if (index.byName[q]) return index.byName[q].map((i) => index.stops[i]);

  const names = Object.keys(index.byName);
  const starts = names.filter((n) => n.startsWith(q));
  const contains = starts.length ? [] : names.filter((n) => n.includes(q));
  const hit = starts.length ? starts : contains;
  return hit.slice(0, 8).flatMap((n) => index.byName[n].map((i) => index.stops[i]));
}

/**
 * 1 事業者ぶんの直通バスを探す。
 *
 * @param {string} operatorId
 * @param {string} fromName 出発のバス停名
 * @param {string} toName   到着のバス停名
 * @param {{departAt:number, serviceDate:Date, limit?:number}} opts
 * @returns {Promise<{routes:Array, warnings:Array, context:object}>}
 */
export async function findGtfsBusRoutes(operatorId, fromName, toName, opts) {
  const { departAt, serviceDate, limit = 3 } = opts;
  const index = await loadIndex(operatorId);

  const originStops = findStops(index, fromName);
  const destStops = findStops(index, toName);
  if (!originStops.length || !destStops.length) {
    return { routes: [], warnings: [], context: { index, originStops, destStops } };
  }

  // 両方の停留所を通る系統だけを候補にする(ここまで通信は index の 1 回だけ)
  const originPatterns = new Set(originStops.flatMap((s) => s.r));
  const destPatterns = new Set(destStops.flatMap((s) => s.r));
  const common = [...originPatterns].filter((p) => destPatterns.has(p));
  if (!common.length) {
    return { routes: [], warnings: [], context: { index, originStops, destStops } };
  }

  const originIds = new Set(originStops.map((s) => s.i));
  const destIds = new Set(destStops.map((s) => s.i));
  const routes = [];
  const warnings = [];

  for (const pid of common.slice(0, 24)) {
    let pattern;
    try {
      pattern = await loadPattern(operatorId, index, pid);
    } catch (e) {
      warnings.push({ message: `${index.title}: 系統の時刻表を読めませんでした(${e.message})` });
      continue;
    }
    if (!pattern) continue;
    if (!runsOn(index.calendars[pattern.c], serviceDate)) continue;

    // 乗る位置と降りる位置。順方向(乗る < 降りる)だけを採る。
    const fi = pattern.s.findIndex((si) => originIds.has(si));
    if (fi < 0) continue;
    const ti = pattern.s.findIndex((si, i) => i > fi && destIds.has(si));
    if (ti < 0) continue;

    const ride = pattern.t.find((times) => times[fi] != null && times[fi] >= departAt);
    if (!ride) continue;
    const dep = ride[fi];
    const arr = ride[ti];
    if (arr == null || arr < dep) continue;

    routes.push(buildRoute(index, pattern, { fi, ti, dep, arr, operatorId }));
  }

  routes.sort((a, b) => a.arrival - b.arrival || a.rideMinutes - b.rideMinutes);
  return {
    routes: routes.slice(0, limit),
    warnings,
    context: { index, originStops, destStops },
  };
}

function buildRoute(index, pattern, { fi, ti, dep, arr, operatorId }) {
  const fromStop = index.stops[pattern.s[fi]];
  const toStop = index.stops[pattern.s[ti]];
  return {
    kind: 'bus',
    source: 'gtfs',
    operator: operatorId,
    operatorTitle: index.title,
    generatedAt: index.generatedAt,
    departure: dep,
    arrival: arr,
    rideMinutes: arr - dep,
    transfers: 0,
    waitMinutes: 0,
    estimatedOnly: false,
    warnings: [],
    legs: [
      {
        bus: true,
        pattern: `gtfs:${operatorId}:${pattern.i}`,
        from: `gtfs:${operatorId}:${fromStop.i}`,
        to: `gtfs:${operatorId}:${toStop.i}`,
        fromTitle: fromStop.n,
        toTitle: toStop.n,
        lineTitle: pattern.n,
        operatorTitle: index.title,
        destination: pattern.d || null,
        departure: dep,
        arrival: arr,
        stops: ti - fi,
      },
    ],
  };
}

/**
 * 索引にある全事業者を横断して直通バスを探す。
 * 索引が無い(まだ取り込んでいない)場合は静かに空を返す。
 */
export async function findAllGtfsRoutes(fromName, toName, opts) {
  const catalog = await loadCatalog();
  const ops = catalog.operators || [];
  if (!ops.length) return { routes: [], warnings: [], stops: [], operators: [] };

  const routes = [];
  const warnings = [];
  const stops = [];
  const used = [];

  for (const op of ops) {
    try {
      const r = await findGtfsBusRoutes(op.id, fromName, toName, opts);
      if (r.routes.length) used.push(op);
      routes.push(...r.routes);
      warnings.push(...r.warnings);
      for (const s of [...(r.context.originStops || []), ...(r.context.destStops || [])]) {
        stops.push({ id: `gtfs:${op.id}:${s.i}`, title: s.n, lat: s.y, lon: s.x });
      }
    } catch (e) {
      warnings.push({ message: `${op.title} の索引を読めませんでした(${e.message})` });
    }
  }

  routes.sort((a, b) => a.arrival - b.arrival);
  return { routes, warnings, stops, operators: used, catalog };
}

/** 名前の候補(入力補助用)。索引が無ければ空。 */
export async function suggestGtfsStops(query) {
  const catalog = await loadCatalog();
  const out = [];
  for (const op of catalog.operators || []) {
    try {
      const index = await loadIndex(op.id);
      for (const s of findStops(index, query).slice(0, 5)) {
        out.push({ operator: op.id, operatorTitle: op.title, title: s.n, lat: s.y, lon: s.x });
      }
    } catch {
      /* 索引が読めなければその事業者は候補に出さない */
    }
  }
  return out;
}

/** テスト用に読み込み済みのものを捨てる */
export function resetGtfsCache() {
  cache.catalog = null;
  cache.index.clear();
  cache.shards.clear();
}
