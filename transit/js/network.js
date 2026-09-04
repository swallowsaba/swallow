/**
 * 路線ネットワーク(静的データ)の構築とキャッシュ
 * ------------------------------------------------------------------
 * ODPT の Railway / Station から、経路探索用のグラフを組み立てる。
 * 静的データなので localStorage に 24 時間保持し、Worker への往復を減らす。
 */

const STORAGE_KEY = 'kanto-transit:network:v1';
const STORAGE_TTL_MS = 24 * 60 * 60 * 1000;

/** 同一駅とみなす最大距離(km)。同名でもこれより離れていれば別駅扱い。 */
const SAME_STATION_KM = 0.9;

export class TransitNetwork {
  constructor(raw, config) {
    this.fetchedAt = raw.fetchedAt || null;
    this.operators = raw.operators || [];
    this.unsupported = raw.unsupported || [];
    this.errors = raw.errors || [];
    this.config = config || {};

    /** @type {Map<string, object>} 路線 ID → 路線 */
    this.railways = new Map();
    for (const r of raw.railways || []) this.railways.set(r.id, r);

    /** @type {Map<string, object>} 駅 ID → 駅 */
    this.stations = new Map();
    for (const s of raw.stations || []) this.stations.set(s.id, s);

    // 路線の stationOrder に含まれるのに Station に無い ID を補完
    for (const rw of this.railways.values()) {
      rw.indexOf = new Map();
      rw.stations.forEach((sid, i) => rw.indexOf.set(sid, i));
      for (const sid of rw.stations) {
        if (!this.stations.has(sid)) {
          this.stations.set(sid, {
            id: sid,
            title: guessTitle(sid),
            railway: rw.id,
            operator: rw.operator,
            lat: null,
            lon: null,
            connecting: [],
            synthetic: true,
          });
        }
      }
    }

    this.#buildGroups();
    this.#buildAdjacency();
  }

  /* ---------------- 駅グループ(乗換の単位) ---------------- */
  #buildGroups() {
    /** @type {Map<string,string>} 駅ID → グループID */
    this.groupOf = new Map();
    /** @type {Map<string,{id:string,title:string,members:string[],lat:number|null,lon:number|null}>} */
    this.groups = new Map();

    const byTitle = new Map();
    for (const st of this.stations.values()) {
      const t = normalizeTitle(st.title);
      if (!byTitle.has(t)) byTitle.set(t, []);
      byTitle.get(t).push(st);
    }

    for (const [title, list] of byTitle) {
      // 同名でも離れている駅があるので、距離でクラスタリングする
      const clusters = [];
      for (const st of list) {
        let placed = false;
        for (const c of clusters) {
          if (canJoin(c, st)) {
            c.members.push(st);
            if (st.lat != null && st.lon != null) {
              c.lat = c.lat == null ? st.lat : (c.lat + st.lat) / 2;
              c.lon = c.lon == null ? st.lon : (c.lon + st.lon) / 2;
            }
            placed = true;
            break;
          }
        }
        if (!placed) clusters.push({ members: [st], lat: st.lat, lon: st.lon });
      }
      clusters.forEach((c, i) => {
        const gid = clusters.length > 1 ? `${title}#${i}` : title;
        const g = {
          id: gid,
          title: c.members[0].title,
          members: c.members.map((m) => m.id),
          lat: c.lat,
          lon: c.lon,
        };
        this.groups.set(gid, g);
        for (const m of c.members) this.groupOf.set(m.id, gid);
      });
    }

    // 別名で結ばれた乗換(例: 有楽町 ⇄ 日比谷)を config から追加
    /** @type {Map<string, Set<string>>} グループID → 徒歩接続グループID */
    this.walkLinks = new Map();
    for (const link of this.config.walkLinks || []) {
      const a = this.#findGroupByTitle(link.a);
      const b = this.#findGroupByTitle(link.b);
      if (!a || !b) continue;
      if (!this.walkLinks.has(a.id)) this.walkLinks.set(a.id, new Set());
      if (!this.walkLinks.has(b.id)) this.walkLinks.set(b.id, new Set());
      this.walkLinks.get(a.id).add(b.id);
      this.walkLinks.get(b.id).add(a.id);
    }
  }

  #findGroupByTitle(title) {
    const t = normalizeTitle(title);
    for (const g of this.groups.values()) {
      if (normalizeTitle(g.title) === t) return g;
    }
    return null;
  }

  /* ---------------- 隣接(乗車区間) ---------------- */
  #buildAdjacency() {
    /** @type {Map<string, Array<{to:string, railway:string, minutes:number}>>} */
    this.rideEdges = new Map();
    const defaultHop = this.config.defaultHopMinutes ?? 2.2;

    for (const rw of this.railways.values()) {
      const hop = this.config.hopMinutes?.[rw.id] ?? defaultHop;
      for (let i = 0; i < rw.stations.length - 1; i += 1) {
        const a = rw.stations[i];
        const b = rw.stations[i + 1];
        this.#addRide(a, b, rw.id, hop);
        this.#addRide(b, a, rw.id, hop);
      }
    }
  }

  #addRide(from, to, railway, minutes) {
    if (!this.rideEdges.has(from)) this.rideEdges.set(from, []);
    this.rideEdges.get(from).push({ to, railway, minutes });
  }

  /* ---------------- 乗換コスト ---------------- */
  /** 同一グループ内での路線間乗換にかかる分数 */
  transferMinutes(fromRailway, toRailway, groupId) {
    if (fromRailway === toRailway) return 0;
    const g = this.groups.get(groupId);
    const title = g ? normalizeTitle(g.title) : '';
    const table = this.config.transfers || {};
    const key1 = `${title}|${fromRailway}|${toRailway}`;
    const key2 = `${title}|${toRailway}|${fromRailway}`;
    if (table[key1] != null) return table[key1];
    if (table[key2] != null) return table[key2];
    if (table[title] != null) return table[title];
    // 同一事業者内の乗換は短め、事業者をまたぐ場合は長めを既定にする
    const sameOperator = operatorOf(fromRailway) === operatorOf(toRailway);
    return sameOperator
      ? this.config.defaultTransferMinutes ?? 4
      : this.config.defaultInterOperatorTransferMinutes ?? 7;
  }

  /** グループ間の徒歩連絡(有楽町⇄日比谷 など) */
  walkMinutes(fromGroup, toGroup) {
    const key = `${fromGroup}|${toGroup}`;
    const rev = `${toGroup}|${fromGroup}`;
    const table = this.config.walkMinutes || {};
    return table[key] ?? table[rev] ?? this.config.defaultWalkMinutes ?? 8;
  }

  /* ---------------- 検索補助 ---------------- */

  /** 駅名の部分一致検索。グループ単位で返す。 */
  searchGroups(query, limit = 12) {
    const q = normalizeTitle(query);
    if (!q) return [];
    const scored = [];
    for (const g of this.groups.values()) {
      const t = normalizeTitle(g.title);
      let score = -1;
      if (t === q) score = 100;
      else if (t.startsWith(q)) score = 80 - t.length;
      else if (t.includes(q)) score = 50 - t.length;
      if (score > 0) scored.push({ group: g, score });
    }
    scored.sort((a, b) => b.score - a.score || a.group.title.localeCompare(b.group.title, 'ja'));
    return scored.slice(0, limit).map((s) => s.group);
  }

  /** 緯度経度から最寄りのグループを返す */
  nearestGroups(lat, lon, limit = 3) {
    const out = [];
    for (const g of this.groups.values()) {
      if (g.lat == null || g.lon == null) continue;
      out.push({ group: g, km: haversine(lat, lon, g.lat, g.lon) });
    }
    out.sort((a, b) => a.km - b.km);
    return out.slice(0, limit);
  }

  railwayTitle(id) {
    return this.railways.get(id)?.title || id;
  }

  stationTitle(id) {
    return this.stations.get(id)?.title || guessTitle(id);
  }

  /** 路線上での駅の並び順。含まれない場合は -1。 */
  indexOnRailway(railwayId, stationId) {
    const rw = this.railways.get(railwayId);
    if (!rw) return -1;
    const i = rw.indexOf.get(stationId);
    return i === undefined ? -1 : i;
  }

  /** from→to の進行方向(odpt:railDirection)を返す */
  directionFor(railwayId, fromStation, toStation) {
    const rw = this.railways.get(railwayId);
    if (!rw) return null;
    const a = this.indexOnRailway(railwayId, fromStation);
    const b = this.indexOnRailway(railwayId, toStation);
    if (a < 0 || b < 0 || a === b) return null;
    return b > a ? rw.ascending : rw.descending;
  }
}

/* ------------------------------------------------------------------ *
 *  取得とキャッシュ
 * ------------------------------------------------------------------ */

export async function loadNetwork(api, config, { force = false } = {}) {
  if (!force) {
    const cached = readCache();
    if (cached) return { network: new TransitNetwork(cached.raw, config), cached: true, fetchedAt: cached.raw.fetchedAt };
  }
  const { data, fetchedAt } = await api.network();
  writeCache(data);
  return { network: new TransitNetwork(data, config), cached: false, fetchedAt };
}

function readCache() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const parsed = JSON.parse(s);
    if (!parsed || !parsed.savedAt || Date.now() - parsed.savedAt > STORAGE_TTL_MS) return null;
    if (!parsed.raw || !Array.isArray(parsed.raw.railways) || !parsed.raw.railways.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(raw) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), raw }));
  } catch {
    /* 容量超過などは無視。キャッシュは最適化であって必須ではない */
  }
}

export function clearNetworkCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 *  ユーティリティ
 * ------------------------------------------------------------------ */

export function normalizeTitle(t) {
  return String(t || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[（(].*?[)）]/g, '')
    .replace(/駅$/, '');
}

/** odpt.Station:TokyoMetro.Ginza.Shibuya → 'Shibuya'(日本語名が無いときの保険) */
function guessTitle(urn) {
  const parts = String(urn || '').split('.');
  return parts[parts.length - 1] || urn;
}

function operatorOf(railwayId) {
  const m = /^odpt\.Railway:([A-Za-z0-9]+)\./.exec(railwayId || '');
  return m ? m[1] : null;
}

function canJoin(cluster, station) {
  if (station.lat == null || station.lon == null) return true;
  if (cluster.lat == null || cluster.lon == null) return true;
  return haversine(cluster.lat, cluster.lon, station.lat, station.lon) <= SAME_STATION_KM;
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
