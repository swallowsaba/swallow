/**
 * ODPT クライアント
 * ------------------------------------------------------------------
 * ・アクセストークンは Worker Secrets からのみ読み、レスポンスにもログにも出さない。
 * ・無料プランのサブリクエスト上限(50/リクエスト)を超えないよう、
 *   呼び出し側から渡された Budget オブジェクトで残数を管理する。
 * ・ODPT の JSON-LD をそのまま返さず、必要フィールドだけに間引く
 *   (転送量削減 + 上流スキーマ変更の吸収)。
 */

import { HOSTS, getOperator, tokenForHost } from './operators.js';

/** 1 Worker リクエストあたりのサブリクエスト上限(無料プランは 50)。安全側に倒す。 */
export const SUBREQUEST_CAP = 40;

export class Budget {
  constructor(cap = SUBREQUEST_CAP) {
    this.cap = cap;
    this.used = 0;
  }
  take(n = 1) {
    if (this.used + n > this.cap) return false;
    this.used += n;
    return true;
  }
  get remaining() {
    return this.cap - this.used;
  }
}

export class OdptError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const TIMEOUT_MS = 8000;

/**
 * ODPT の 1 エンドポイントを叩く。
 * @param {object} env      Worker の環境(Secrets を含む)
 * @param {string} hostKey  'public' | 'basic'
 * @param {string} type     'odpt:Station' など
 * @param {object} params   クエリパラメータ
 * @param {Budget} budget   サブリクエスト残数
 */
export async function fetchOdpt(env, hostKey, type, params, budget) {
  if (!budget.take(1)) {
    throw new OdptError('BUDGET_EXHAUSTED', 'サブリクエストの上限に達しました', 503);
  }

  const base = HOSTS[hostKey];
  const url = new URL(`${base}/${type}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  if (hostKey === 'basic' || hostKey === 'challenge') {
    // 前後の空白・改行を必ず落とす。混入したまま送ると ODPT に弾かれ、
    // 「取れたり取れなかったり」に見える厄介な不具合になる。
    const token = tokenForHost(env, hostKey);
    if (!token) {
      const name = hostKey === 'challenge' ? 'ODPT_CHALLENGE_TOKEN' : 'ODPT_TOKEN';
      throw new OdptError('UNAUTHORIZED', `${name} が設定されていません`, 401);
    }
    url.searchParams.set('acl:consumerKey', token);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      // Workers Cache が Cache-Control を見て面倒を見るため cf.cacheTtl は使わない
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      throw new OdptError('UPSTREAM_TIMEOUT', 'ODPT の応答がありません', 504);
    }
    throw new OdptError('UPSTREAM_ERROR', 'ODPT への接続に失敗しました', 502);
  }
  clearTimeout(timer);

  if (res.status === 401 || res.status === 403) {
    throw new OdptError('UNAUTHORIZED', 'ODPT のアクセストークンが拒否されました', 401);
  }
  if (res.status === 429) {
    throw new OdptError('RATE_LIMITED', 'ODPT 側のレート制限に達しました', 429);
  }
  if (!res.ok) {
    throw new OdptError('UPSTREAM_ERROR', `ODPT が HTTP ${res.status} を返しました`, 502);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

/* ------------------------------------------------------------------ *
 *  整形(必要フィールドのみ抽出)
 * ------------------------------------------------------------------ */

const idOf = (v) => (typeof v === 'string' ? v : v && v['owl:sameAs']) || null;

export function shapeRailway(r) {
  const order = (r['odpt:stationOrder'] || [])
    .map((s) => ({ i: s['odpt:index'], station: idOf(s['odpt:station']) }))
    .filter((s) => s.station != null)
    .sort((a, b) => a.i - b.i);
  return {
    id: r['owl:sameAs'],
    title: r['odpt:railwayTitle']?.ja || r['dc:title'] || r['owl:sameAs'],
    operator: idOf(r['odpt:operator']),
    code: r['odpt:lineCode'] || null,
    color: r['odpt:color'] || null,
    ascending: idOf(r['odpt:ascendingRailDirection']),
    descending: idOf(r['odpt:descendingRailDirection']),
    stations: order.map((s) => s.station),
  };
}

export function shapeStation(s) {
  return {
    id: s['owl:sameAs'],
    title: s['odpt:stationTitle']?.ja || s['dc:title'] || s['owl:sameAs'],
    titleEn: s['odpt:stationTitle']?.en || null,
    railway: idOf(s['odpt:railway']),
    operator: idOf(s['odpt:operator']),
    code: s['odpt:stationCode'] || null,
    lat: typeof s['geo:lat'] === 'number' ? s['geo:lat'] : null,
    lon: typeof s['geo:long'] === 'number' ? s['geo:long'] : null,
    connecting: (s['odpt:connectingRailway'] || []).map(idOf).filter(Boolean),
  };
}

export function shapeStationTimetable(t) {
  const rows = (t['odpt:stationTimetableObject'] || []).map((o) => ({
    time: o['odpt:departureTime'] || null,
    type: idOf(o['odpt:trainType']),
    no: o['odpt:trainNumber'] || null,
    dest: (o['odpt:destinationStation'] || []).map(idOf).filter(Boolean),
    train: idOf(o['odpt:train']) || null,
    isLast: o['odpt:isLast'] === true,
  }));
  return {
    id: t['owl:sameAs'],
    station: idOf(t['odpt:station']),
    railway: idOf(t['odpt:railway']),
    direction: idOf(t['odpt:railDirection']),
    calendar: idOf(t['odpt:calendar']),
    rows,
  };
}

export function shapeTrainTimetable(t) {
  const stops = (t['odpt:trainTimetableObject'] || []).map((o) => ({
    dep: o['odpt:departureTime'] || null,
    depSt: idOf(o['odpt:departureStation']),
    arr: o['odpt:arrivalTime'] || null,
    arrSt: idOf(o['odpt:arrivalStation']),
  }));
  return {
    id: t['owl:sameAs'],
    railway: idOf(t['odpt:railway']),
    direction: idOf(t['odpt:railDirection']),
    calendar: idOf(t['odpt:calendar']),
    no: t['odpt:trainNumber'] || null,
    type: idOf(t['odpt:trainType']),
    dest: (t['odpt:destinationStation'] || []).map(idOf).filter(Boolean),
    stops,
  };
}

export function shapeTrainInformation(t) {
  return {
    id: t['owl:sameAs'],
    date: t['dc:date'] || null,
    operator: idOf(t['odpt:operator']),
    railway: idOf(t['odpt:railway']),
    status: t['odpt:trainInformationStatus']?.ja || null,
    text: t['odpt:trainInformationText']?.ja || t['odpt:trainInformationText'] || null,
  };
}

/**
 * odpt.Station:TokyoMetro.Ginza.Shibuya → 'TokyoMetro'
 * 事業者 ID にはハイフンを含むもの(JR-East など)があるので許可する。
 */
export function operatorOfUrn(urn) {
  const m = /^odpt\.[A-Za-z]+:([A-Za-z0-9-]+)\./.exec(urn || '');
  return m ? m[1] : null;
}

/** URN からその事業者のホスト種別を求める。未対応なら null。 */
export function hostForUrn(urn) {
  const op = getOperator(operatorOfUrn(urn));
  return op ? op.host : null;
}
