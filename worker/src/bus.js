/**
 * バス関連の ODPT クライアント
 * ==================================================================
 * 鉄道とはデータ構造が別なので、モジュールを分けている。
 *
 * 【設計上の最大の制約】
 * ODPT の API は 1 レスポンス 1000 件が上限で、ページングが無い。
 * 都営バスの停留所ポールは 1000 件を大きく超えるため、
 * 「全バス停を一括取得してグラフを作る」ことができない。
 * 全件 JSON は全国分になるためこれも使えない。
 *
 * そこで、バスは鉄道のようにグラフへ組み込まず、
 * 次の手順で「直通で行ける便」だけをその場で探す。
 *
 *   1. 出発バス停を名前で引く    → odpt:BusstopPole(その停留所を通る系統の一覧つき)
 *   2. 目的バス停を名前で引く    → 同上
 *   3. 両者の系統 ID の積集合をとる  ← ここが肝。通信ゼロで直通系統が判る
 *   4. 該当系統だけ経路パターンを取得 → 停車順で「出発が先、目的が後」を確認
 *   5. 出発ポールの時刻表を取得    → 発車時刻
 *   6. 該当便の全停車時刻を取得    → 目的バス停の到着時刻(推定不要)
 *
 * この方式なら 1 検索あたりのサブリクエストは十数回に収まる。
 */

import { fetchOdpt } from './odpt.js';

/**
 * バスを扱う事業者。
 *
 * hasPoleTimetable は odpt:BusstopPoleTimetable(バス停時刻表)を提供するかどうか。
 * 提供しない事業者は odpt:BusTimetable(便別時刻表)から発車時刻を組み立てる。
 * これを持つのは都営バスと東急バスだけで、他は BusTimetable のみ。
 */
export const BUS_OPERATORS = [
  {
    id: 'Toei',
    title: '東京都交通局',
    short: '都営バス',
    host: 'public',
    license: 'CC BY 4.0',
    hasPoleTimetable: true,
  },
  {
    id: 'TokyuBus',
    title: '東急バス',
    short: '東急バス',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    hasPoleTimetable: true,
  },
  {
    id: 'SeibuBus',
    title: '西武バス',
    short: '西武バス',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    hasPoleTimetable: false,
  },
  {
    id: 'SotetsuBus',
    title: '相鉄バス',
    short: '相鉄バス',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    hasPoleTimetable: false,
  },
  {
    id: 'YokohamaMunicipal',
    title: '横浜市交通局',
    short: '横浜市営バス',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    hasPoleTimetable: false,
  },
];

/**
 * チャレンジ限定ライセンスのバス事業者。
 * ENABLE_CHALLENGE=1 かつ ODPT_CHALLENGE_TOKEN があるときだけ有効になる。
 */
export const CHALLENGE_BUS_OPERATORS = [
  {
    id: 'Kanachu',
    title: '神奈川中央交通',
    short: 'かなちゅう',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    hasPoleTimetable: false,
  },
  {
    id: 'TobuBus',
    title: '東武バス',
    short: '東武バス',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    hasPoleTimetable: false,
  },
  {
    id: 'KokusaiKogyoBus',
    title: '国際興業',
    short: '国際興業バス',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    hasPoleTimetable: false,
  },
];

/**
 * ODPT が API 形式(odpt:BusstopPole など)の提供を終了した事業者。
 * 後継は GTFS(ZIP ファイル)のみ。このアプリは検索のたびに ODPT の
 * API を叩く作りで、GTFS の ZIP は
 *   ・Worker の CPU 10ms / メモリ 128MB では展開しきれない
 *   ・事前取得してリポジトリに置くことは要件で禁止されている
 * ため扱えない。黙って欠けさせず、理由をつけて画面に出す。
 */
export const DISCONTINUED_BUS_OPERATORS = [
  { id: 'KeioBus', title: '京王バス', endedOn: '2025-06', successor: 'GTFS' },
  { id: 'NishiTokyoBus', title: '西東京バス', endedOn: '2025-06', successor: 'GTFS' },
  { id: 'OdakyuBus', title: '小田急バス', endedOn: '2025-09', successor: 'GTFS' },
];

const ALL_BUS = [...BUS_OPERATORS, ...CHALLENGE_BUS_OPERATORS];

export function busOperator(id) {
  return ALL_BUS.find((o) => o.id === id) || null;
}

/**
 * 検索対象にする事業者。
 * トークンが無いホストの事業者は自動的に外れる(黙って空を返さないための前提)。
 * ENABLED_BUS_OPERATORS(カンマ区切り)で絞り込める。
 */
export function resolveBusOperators(env, { token, challenge } = {}) {
  const filter = (env.ENABLED_BUS_OPERATORS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const pool = challenge ? ALL_BUS : BUS_OPERATORS;
  return pool.filter((o) => {
    if (filter.length && !filter.includes(o.id)) return false;
    if (o.host === 'basic' && !token) return false;
    if (o.host === 'challenge' && !challenge) return false;
    return true;
  });
}

/* ------------------------------------------------------------------ *
 *  整形
 * ------------------------------------------------------------------ */

const busIdOf = (v) => (typeof v === 'string' ? v : v && v['owl:sameAs']) || null;

export function shapeBusstopPole(p) {
  return {
    id: p['owl:sameAs'],
    title: p['dc:title'] || p['odpt:busstopPoleNumber'] || p['owl:sameAs'],
    kana: p['odpt:kana'] || null,
    operator: busIdOf(p['odpt:operator']),
    poleNumber: p['odpt:busstopPoleNumber'] ?? null,
    lat: typeof p['geo:lat'] === 'number' ? p['geo:lat'] : null,
    lon: typeof p['geo:long'] === 'number' ? p['geo:long'] : null,
    patterns: (p['odpt:busroutePattern'] || []).map(busIdOf).filter(Boolean),
  };
}

export function shapeBusroutePattern(r) {
  const order = (r['odpt:busstopPoleOrder'] || [])
    .map((o) => ({ i: o['odpt:index'], pole: busIdOf(o['odpt:busstopPole']), note: o['odpt:note'] || null }))
    .filter((o) => o.pole)
    .sort((a, b) => a.i - b.i);
  return {
    id: r['owl:sameAs'],
    title: r['dc:title'] || r['owl:sameAs'],
    busroute: busIdOf(r['odpt:busroute']),
    direction: r['odpt:direction'] ?? null,
    pattern: r['odpt:pattern'] ?? null,
    operator: busIdOf(r['odpt:operator']),
    order,
  };
}

export function shapeBusstopPoleTimetable(t) {
  const rows = (t['odpt:busstopPoleTimetableObject'] || []).map((o) => ({
    time: o['odpt:departureTime'] || null,
    pattern: busIdOf(o['odpt:busroutePattern']),
    destPole: busIdOf(o['odpt:destinationBusstopPole']),
    destSign: o['odpt:destinationSign'] || null,
    order: o['odpt:busroutePatternOrder'] ?? null,
    isMidnight: o['odpt:isMidnight'] === true,
  }));
  return {
    id: t['owl:sameAs'],
    pole: busIdOf(t['odpt:busstopPole']),
    calendar: busIdOf(t['odpt:calendar']),
    busroute: busIdOf(t['odpt:busroute']),
    direction: t['odpt:busDirection'] ?? null,
    operator: busIdOf(t['odpt:operator']),
    rows,
  };
}

export function shapeBusTimetable(t) {
  const stops = (t['odpt:busTimetableObject'] || [])
    .map((o) => ({
      i: o['odpt:index'],
      pole: busIdOf(o['odpt:busstopPole']),
      arr: o['odpt:arrivalTime'] || null,
      dep: o['odpt:departureTime'] || null,
    }))
    .filter((o) => o.pole)
    .sort((a, b) => a.i - b.i);
  return {
    id: t['owl:sameAs'],
    pattern: busIdOf(t['odpt:busroutePattern']),
    calendar: busIdOf(t['odpt:calendar']),
    operator: busIdOf(t['odpt:operator']),
    stops,
  };
}

/**
 * バスのカレンダーは Weekday / SaturdayHoliday ではなく
 * odpt.Calendar:Specific.Toei.09-100 のような事業者固有のもので、
 * 適用日が YYYY-MM-DD の配列として列挙されている。
 */
export function shapeCalendar(c) {
  return {
    id: c['owl:sameAs'],
    title: c['dc:title'] || null,
    operator: busIdOf(c['odpt:operator']),
    days: Array.isArray(c['odpt:day']) ? c['odpt:day'] : [],
    duration: c['odpt:duration'] || null,
  };
}

/* ------------------------------------------------------------------ *
 *  取得
 * ------------------------------------------------------------------ */

/** バス停をピッタリの名前で引く(部分一致は API 側が対応していない) */
export async function fetchStopsByTitle(env, op, title, budget) {
  const rows = await fetchOdpt(
    env,
    op.host,
    'odpt:BusstopPole',
    { 'odpt:operator': `odpt.Operator:${op.id}`, 'dc:title': title },
    budget
  );
  return rows.map(shapeBusstopPole);
}

export async function fetchPattern(env, op, id, budget) {
  const rows = await fetchOdpt(env, op.host, 'odpt:BusroutePattern', { 'owl:sameAs': id }, budget);
  return rows.map(shapeBusroutePattern);
}

export async function fetchPoleTimetables(env, op, pole, budget) {
  const rows = await fetchOdpt(env, op.host, 'odpt:BusstopPoleTimetable', { 'odpt:busstopPole': pole }, budget);
  return rows.map(shapeBusstopPoleTimetable);
}

export async function fetchRuns(env, op, pattern, calendar, budget) {
  const params = { 'odpt:busroutePattern': pattern };
  if (calendar) params['odpt:calendar'] = calendar;
  const rows = await fetchOdpt(env, op.host, 'odpt:BusTimetable', params, budget);
  return rows.map(shapeBusTimetable);
}

/** 事業者のカレンダー一覧(都営で 49 件。1 リクエストで収まり 24h キャッシュできる) */
export async function fetchCalendars(env, op, budget) {
  const rows = await fetchOdpt(
    env,
    op.host,
    'odpt:Calendar',
    { 'odpt:operator': `odpt.Operator:${op.id}` },
    budget
  );
  return rows.map(shapeCalendar);
}
