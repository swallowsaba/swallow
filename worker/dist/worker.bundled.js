/* ==================================================================
 * 首都圏ルート検索 — Cloudflare Worker(単一ファイル版)
 * ------------------------------------------------------------------
 * このファイルは worker/src/*.js から自動生成されています。
 * 直接編集せず、src/ を直して次を実行してください:
 *     node worker/build-single-file.mjs
 *
 * Cloudflare ダッシュボードの「Edit code」に丸ごと貼り付けて使えます。
 * 生成日時: 2026-09-10T11:39:27.672Z
 * ================================================================== */


/* ==================== operators.js ==================== */
/**
 * 対応事業者レジストリ
 * ------------------------------------------------------------------
 * ODPT は事業者ごとにライセンスが異なり、API ホストまで分かれている。
 *   - CC BY 4.0                 : api-public.odpt.org  (トークン不要)
 *   - 公共交通オープンデータ基本ライセンス : api.odpt.org         (トークン必須)
 *   - チャレンジ限定ライセンス          : api-challenge.odpt.org (コンテスト目的外は利用禁止)
 *
 * 既定では、一般公開できる上 2 つのライセンスの事業者だけを扱う。
 * チャレンジ限定ライセンスの事業者(JR東日本・東武・西武・京王・小田急・
 * 京急・東急・相鉄 など)は UNSUPPORTED_OPERATORS に理由とともに列挙し、
 * UI で「非対応」として明示する。
 *
 * ただし「公共交通オープンデータチャレンジ」に応募し、その作品として
 * 公開する場合に限り、環境変数 ENABLE_CHALLENGE=1 と Secret の
 * ODPT_CHALLENGE_TOKEN を設定することでチャレンジ事業者を有効化できる。
 *
 * 【重要】ENABLE_CHALLENGE を有効にしたアプリは、チャレンジの作品としてのみ
 * 公開できる。コンテスト終了後はトークンが失効し、機能も停止する前提で運用すること。
 */

const HOSTS = {
  public: 'https://api-public.odpt.org/api/v4',
  basic: 'https://api.odpt.org/api/v4',
  challenge: 'https://api-challenge.odpt.org/api/v4',
};

/** 対応事業者。id は ODPT の odpt.Operator: 以下の識別子。 */
const OPERATORS = [
  {
    id: 'Toei',
    title: '東京都交通局',
    short: '都営',
    host: 'public',
    license: 'CC BY 4.0',
    modes: ['地下鉄', '路面電車', '新交通'],
    note: '浅草線・三田線・新宿線・大江戸線 / 都電荒川線 / 日暮里・舎人ライナー',
  },
  {
    id: 'TokyoMetro',
    title: '東京メトロ',
    short: 'メトロ',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    modes: ['地下鉄'],
    note: '銀座・丸ノ内・日比谷・東西・千代田・有楽町・半蔵門・南北・副都心',
  },
  {
    id: 'TWR',
    title: '東京臨海高速鉄道',
    short: 'りんかい線',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    modes: ['鉄道'],
    note: 'りんかい線',
  },
  {
    id: 'MIR',
    title: '首都圏新都市鉄道',
    short: 'TX',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    modes: ['鉄道'],
    note: 'つくばエクスプレス',
  },
  {
    id: 'Yurikamome',
    title: 'ゆりかもめ',
    short: 'ゆりかもめ',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    modes: ['新交通'],
    note: '東京臨海新交通臨海線',
  },
  {
    id: 'TamaMonorail',
    title: '多摩都市モノレール',
    short: '多摩モノ',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    modes: ['モノレール'],
    note: '多摩都市モノレール線',
  },
  {
    id: 'YokohamaMunicipal',
    title: '横浜市交通局',
    short: '横浜市営',
    host: 'basic',
    license: '公共交通オープンデータ基本ライセンス',
    modes: ['地下鉄'],
    note: 'ブルーライン / グリーンライン',
  },
];

/**
 * チャレンジ限定ライセンスの鉄道事業者。
 * ENABLE_CHALLENGE=1 かつ ODPT_CHALLENGE_TOKEN が設定されているときだけ有効になる。
 * データ構造は基本ライセンスの事業者と同じなので、経路探索側の変更は不要。
 */
const CHALLENGE_OPERATORS = [
  {
    id: 'JR-East',
    title: 'JR東日本',
    short: 'JR東',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '山手線・中央線・京浜東北線 ほか',
  },
  {
    id: 'Tobu',
    title: '東武鉄道',
    short: '東武',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: 'スカイツリーライン・東上線 ほか',
  },
  {
    id: 'Seibu',
    title: '西武鉄道',
    short: '西武',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '池袋線・新宿線 ほか',
  },
  {
    id: 'Keio',
    title: '京王電鉄',
    short: '京王',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '京王線・井の頭線 ほか',
  },
  {
    id: 'Odakyu',
    title: '小田急電鉄',
    short: '小田急',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '小田原線・江ノ島線・多摩線',
  },
  {
    id: 'Keikyu',
    title: '京急電鉄',
    short: '京急',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '本線・空港線 ほか',
  },
  {
    id: 'Tokyu',
    title: '東急電鉄',
    short: '東急',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '東横線・田園都市線 ほか',
  },
  {
    id: 'Sotetsu',
    title: '相模鉄道',
    short: '相鉄',
    host: 'challenge',
    license: 'チャレンジ2026限定ライセンス',
    modes: ['鉄道'],
    note: '本線・いずみ野線・新横浜線',
  },
];

/** 非対応事業者。UI で理由とともに提示するために保持する。 */
const UNSUPPORTED_OPERATORS = [
  { title: 'JR東日本', reason: 'チャレンジ2026限定ライセンス(コンテスト目的外の利用不可)' },
  { title: '東武鉄道', reason: 'チャレンジ2026限定ライセンス' },
  { title: '西武鉄道', reason: 'チャレンジ2026限定ライセンス' },
  { title: '京王電鉄', reason: 'チャレンジ2026限定ライセンス' },
  { title: '小田急電鉄', reason: 'チャレンジ2026限定ライセンス' },
  { title: '京急電鉄', reason: 'チャレンジ2026限定ライセンス' },
  { title: '東急電鉄', reason: 'チャレンジ2026限定ライセンス' },
  { title: '相模鉄道', reason: 'チャレンジ2026限定ライセンス' },
  { title: '京成電鉄・北総鉄道・埼玉高速 ほか', reason: 'ODPT 未提供、またはチャレンジ限定' },
];

const BY_ID = new Map([...OPERATORS, ...CHALLENGE_OPERATORS].map((o) => [o.id, o]));

/**
 * アクセストークンを取り出す。
 * コピー&ペーストで前後に空白・改行が混ざると ODPT に弾かれるため、
 * 必ずここで除去する。空白だけの場合は「未設定」として扱う。
 */
function odptToken(env) {
  return String(env.ODPT_TOKEN || '').trim();
}

/** チャレンジ用トークン(api-challenge.odpt.org 用。ODPT_TOKEN とは別物) */
function challengeToken(env) {
  return String(env.ODPT_CHALLENGE_TOKEN || '').trim();
}

/**
 * チャレンジ事業者を有効にしてよいか。
 * ENABLE_CHALLENGE が明示的に有効で、かつ専用トークンがあるときだけ true。
 * どちらか欠けていれば黙って無効化する(誤って規約違反の状態で公開しないため)。
 */
function challengeEnabled(env) {
  const flag = String(env.ENABLE_CHALLENGE || '').trim().toLowerCase();
  const on = flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
  return on && Boolean(challengeToken(env));
}

/** ホスト種別に対応するトークンを返す。public は不要なので null。 */
function tokenForHost(env, hostKey) {
  if (hostKey === 'basic') return odptToken(env);
  if (hostKey === 'challenge') return challengeToken(env);
  return null;
}

function getOperator(id) {
  return BY_ID.get(id) || null;
}

/** odpt.Operator:TokyoMetro のような完全 ID を返す */
function operatorUrn(id) {
  return `odpt.Operator:${id}`;
}

/**
 * 環境変数 ENABLED_OPERATORS(カンマ区切り)で対応事業者を絞り込める。
 * 未設定なら全件。トークンが無いホストの事業者は自動的に除外する。
 */
function resolveEnabledOperators(env) {
  const filter = (env.ENABLED_OPERATORS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const pool = challengeEnabled(env) ? [...OPERATORS, ...CHALLENGE_OPERATORS] : OPERATORS;

  return pool.filter((op) => {
    if (filter.length && !filter.includes(op.id)) return false;
    if (op.host === 'basic' && !odptToken(env)) return false;
    if (op.host === 'challenge' && !challengeEnabled(env)) return false;
    return true;
  });
}

/**
 * 現在の設定で実際に使える事業者を ID から引く。
 * 無効な事業者(トークン未設定・チャレンジ無効・絞り込みで除外)は null を返し、
 * 呼び出し側で「対応範囲外」として扱えるようにする。
 * getOperator() は全事業者を引いてしまうので、リクエスト処理ではこちらを使うこと。
 */
function getEnabledOperator(env, id) {
  if (!id) return null;
  return resolveEnabledOperators(env).find((o) => o.id === id) || null;
}

/** UI に出す「非対応」一覧。チャレンジ有効時は該当分を取り除く。 */
function resolveUnsupported(env) {
  if (!challengeEnabled(env)) return UNSUPPORTED_OPERATORS;
  const enabledTitles = new Set(CHALLENGE_OPERATORS.map((o) => o.title));
  return UNSUPPORTED_OPERATORS.filter((o) => !enabledTitles.has(o.title));
}


/* ==================== http.js ==================== */
/**
 * CORS・レスポンス整形・エラーコードの共通処理
 */

/** アプリ内で使うエラーコード。フロントはこのコードで分岐する。 */
const ERR = {
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  UPSTREAM_TIMEOUT: 'UPSTREAM_TIMEOUT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  BATCH_TOO_LARGE: 'BATCH_TOO_LARGE',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN_ORIGIN: 'FORBIDDEN_ORIGIN',
  GEOCODER_UNAVAILABLE: 'GEOCODER_UNAVAILABLE',
};

/**
 * 許可オリジンの判定。
 * ALLOWED_ORIGINS はカンマ区切りの完全一致リスト。ワイルドカードは使わない。
 * 例: "https://example.github.io,http://localhost:8080"
 */
function resolveOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return { allowed: true, origin: null }; // curl 等の直接アクセス
  const list = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (list.includes(origin.replace(/\/$/, ''))) return { allowed: true, origin };
  return { allowed: false, origin };
}

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers':
      'X-Data-Fetched-At, X-Cache-Status, X-Data-Source, X-Partial, Retry-After',
    Vary: 'Origin',
  };
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body, { status = 200, origin = null, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
      ...headers,
    },
  });
}

function errorResponse(code, message, { status = 500, origin = null, headers = {}, detail = null } = {}) {
  return json({ error: { code, message, detail } }, { status, origin, headers });
}

/**
 * 種別ごとの TTL(秒)。
 * 運行情報が短いのは「古い動的データを最新に見せない」ため。
 * ODPT の API 利用ガイドラインが求める要件でもある。
 */
const TTL = {
  network: 86400, // 路線・駅・駅順(静的)
  timetable: 21600, // 時刻表(ダイヤ改正まで不変)
  status: 60, // 運行情報
  geocode: 86400, // ジオコーディング結果
  health: 300,
};

function cacheControl(seconds) {
  return `public, max-age=${seconds}`;
}


/* ==================== odpt.js ==================== */
/**
 * ODPT クライアント
 * ------------------------------------------------------------------
 * ・アクセストークンは Worker Secrets からのみ読み、レスポンスにもログにも出さない。
 * ・無料プランのサブリクエスト上限(50/リクエスト)を超えないよう、
 *   呼び出し側から渡された Budget オブジェクトで残数を管理する。
 * ・ODPT の JSON-LD をそのまま返さず、必要フィールドだけに間引く
 *   (転送量削減 + 上流スキーマ変更の吸収)。
 */

/** 1 Worker リクエストあたりのサブリクエスト上限(無料プランは 50)。安全側に倒す。 */
const SUBREQUEST_CAP = 40;

class Budget {
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

class OdptError extends Error {
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
async function fetchOdpt(env, hostKey, type, params, budget) {
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

function shapeRailway(r) {
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

function shapeStation(s) {
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

function shapeStationTimetable(t) {
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

function shapeTrainTimetable(t) {
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

function shapeTrainInformation(t) {
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
function operatorOfUrn(urn) {
  const m = /^odpt\.[A-Za-z]+:([A-Za-z0-9-]+)\./.exec(urn || '');
  return m ? m[1] : null;
}

/** URN からその事業者のホスト種別を求める。未対応なら null。 */
function hostForUrn(urn) {
  const op = getOperator(operatorOfUrn(urn));
  return op ? op.host : null;
}


/* ==================== geocode.js ==================== */
/**
 * 住所 → 緯度経度(ジオコーディング)
 * ------------------------------------------------------------------
 * 【重要】既定で使う国土地理院の住所検索エンドポイントは、地理院地図が
 * 内部的に利用しているもので、公式に「公開API」として仕様が公表されて
 * いるものではありません。無償・キー不要で広く使われていますが、
 * 予告なく変更・停止される可能性があります。
 *
 * そのため本アプリでは:
 *   - 失敗しても致命的にしない(必ず駅名検索にフォールバックできる設計)
 *   - 現在地(ブラウザの Geolocation API)は外部APIを一切使わない
 *   - GEOCODER=off で無効化できる
 * としています。恒久運用する場合は、国土数値情報「位置参照情報」を
 * 静的データとして同梱する方式への差し替えを推奨します(README 参照)。
 */

const GSI_ENDPOINT = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
const GEOCODE_TIMEOUT_MS = 6000;

/** 首都圏のおおよその範囲。範囲外は弾いて誤検索を減らす。 */
const BBOX = { minLat: 34.9, maxLat: 36.4, minLon: 138.8, maxLon: 140.9 };

async function geocode(env, query, budget) {
  if ((env.GEOCODER || 'gsi') === 'off') {
    throw new OdptError('GEOCODER_UNAVAILABLE', '住所検索は無効化されています', 503);
  }
  if (!budget.take(1)) {
    throw new OdptError('BUDGET_EXHAUSTED', 'サブリクエストの上限に達しました', 503);
  }

  const url = `${GSI_ENDPOINT}?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    clearTimeout(timer);
    throw new OdptError('GEOCODER_UNAVAILABLE', '住所検索サービスに接続できませんでした', 503);
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw new OdptError('GEOCODER_UNAVAILABLE', `住所検索サービスが HTTP ${res.status} を返しました`, 503);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new OdptError('GEOCODER_UNAVAILABLE', '住所検索の応答を解釈できませんでした', 503);
  }

  const results = (Array.isArray(data) ? data : [])
    .map((f) => {
      const c = f?.geometry?.coordinates;
      if (!Array.isArray(c) || c.length < 2) return null;
      const lon = Number(c[0]);
      const lat = Number(c[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { title: f?.properties?.title || query, lat, lon };
    })
    .filter(Boolean)
    .filter((r) => r.lat >= BBOX.minLat && r.lat <= BBOX.maxLat && r.lon >= BBOX.minLon && r.lon <= BBOX.maxLon)
    .slice(0, 5);

  return results;
}


/* ==================== bus.js ==================== */
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

/**
 * バスを扱う事業者。
 *
 * hasPoleTimetable は odpt:BusstopPoleTimetable(バス停時刻表)を提供するかどうか。
 * 提供しない事業者は odpt:BusTimetable(便別時刻表)から発車時刻を組み立てる。
 * これを持つのは都営バスと東急バスだけで、他は BusTimetable のみ。
 */
const BUS_OPERATORS = [
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
const CHALLENGE_BUS_OPERATORS = [
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
const DISCONTINUED_BUS_OPERATORS = [
  { id: 'KeioBus', title: '京王バス', endedOn: '2025-06', successor: 'GTFS' },
  { id: 'NishiTokyoBus', title: '西東京バス', endedOn: '2025-06', successor: 'GTFS' },
  { id: 'OdakyuBus', title: '小田急バス', endedOn: '2025-09', successor: 'GTFS' },
];

const ALL_BUS = [...BUS_OPERATORS, ...CHALLENGE_BUS_OPERATORS];

function busOperator(id) {
  return ALL_BUS.find((o) => o.id === id) || null;
}

/**
 * 検索対象にする事業者。
 * トークンが無いホストの事業者は自動的に外れる(黙って空を返さないための前提)。
 * ENABLED_BUS_OPERATORS(カンマ区切り)で絞り込める。
 */
function resolveBusOperators(env, { token, challenge } = {}) {
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

function shapeBusstopPole(p) {
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

function shapeBusroutePattern(r) {
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

function shapeBusstopPoleTimetable(t) {
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

function shapeBusTimetable(t) {
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
function shapeCalendar(c) {
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
async function fetchStopsByTitle(env, op, title, budget) {
  const rows = await fetchOdpt(
    env,
    op.host,
    'odpt:BusstopPole',
    { 'odpt:operator': `odpt.Operator:${op.id}`, 'dc:title': title },
    budget
  );
  return rows.map(shapeBusstopPole);
}

async function fetchPattern(env, op, id, budget) {
  const rows = await fetchOdpt(env, op.host, 'odpt:BusroutePattern', { 'owl:sameAs': id }, budget);
  return rows.map(shapeBusroutePattern);
}

async function fetchPoleTimetables(env, op, pole, budget) {
  const rows = await fetchOdpt(env, op.host, 'odpt:BusstopPoleTimetable', { 'odpt:busstopPole': pole }, budget);
  return rows.map(shapeBusstopPoleTimetable);
}

async function fetchRuns(env, op, pattern, calendar, budget) {
  const params = { 'odpt:busroutePattern': pattern };
  if (calendar) params['odpt:calendar'] = calendar;
  const rows = await fetchOdpt(env, op.host, 'odpt:BusTimetable', params, budget);
  return rows.map(shapeBusTimetable);
}

/** 事業者のカレンダー一覧(都営で 49 件。1 リクエストで収まり 24h キャッシュできる) */
async function fetchCalendars(env, op, budget) {
  const rows = await fetchOdpt(
    env,
    op.host,
    'odpt:Calendar',
    { 'odpt:operator': `odpt.Operator:${op.id}` },
    budget
  );
  return rows.map(shapeCalendar);
}


/* ==================== index.js ==================== */
/**
 * 首都圏ルート提案ツール — Cloudflare Worker (ODPT プロキシ)
 * ==================================================================
 * 責務
 *   1. ODPT のアクセストークンをフロントから完全に隠す
 *   2. GitHub Pages からの CORS を通す(許可オリジンのみ)
 *   3. Workers Cache に載せてレート制限と無料枠を守る
 *   4. JSON-LD を必要フィールドだけに間引いて転送量を減らす
 *
 * やらないこと
 *   - 経路探索(無料プランの CPU 10ms では回らないため、ブラウザ側で行う)
 *
 * エンドポイント
 *   GET  /v1/health
 *   GET  /v1/network
 *   GET  /v1/status
 *   POST /v1/timetables   { stations: string[], calendar?: string }
 *   POST /v1/trains       { trains: string[] }   または { queries: [{railway,no,calendar}] }
 *   GET  /v1/geocode?q=
 *   GET  /v1/bus/stops?q=  バス停を名前で引く(全件取得はできないため)
 *   GET  /v1/bus/calendars バス事業者のカレンダー(適用日は日付の配列)
 *   POST /v1/bus/patterns  { ids: string[] }
 *   POST /v1/bus/timetables{ poles: string[] }
 *   POST /v1/bus/runs      { runs: [{pattern, calendar}] }
 */

/** バッチの 1 リクエストあたり最大件数(サブリクエスト上限を守るため) */
const MAX_BATCH = 20;

const __worker = {
  async fetch(request, env, ctx) {
    const { allowed, origin } = resolveOrigin(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: allowed ? 204 : 403,
        headers: corsHeaders(allowed ? origin : null),
      });
    }
    if (!allowed) {
      return errorResponse(ERR.FORBIDDEN_ORIGIN, 'このオリジンからのアクセスは許可されていません', {
        status: 403,
        origin: null,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const budget = new Budget();
    const fetchedAt = new Date().toISOString();

    try {
      switch (`${request.method} ${path}`) {
        case 'GET /':
        case 'GET /v1/health':
          return handleHealth(env, origin, fetchedAt);
        case 'GET /v1/network':
          return await handleNetwork(env, origin, budget, fetchedAt);
        case 'GET /v1/status':
          return await handleStatus(env, origin, budget, fetchedAt);
        case 'POST /v1/timetables':
          return await handleTimetables(request, env, origin, budget, fetchedAt);
        case 'POST /v1/trains':
          return await handleTrains(request, env, origin, budget, fetchedAt);
        case 'GET /v1/geocode':
          return await handleGeocode(url, env, origin, budget, fetchedAt);
        case 'GET /v1/bus/stops':
          return await handleBusStops(url, env, origin, budget, fetchedAt);
        case 'GET /v1/bus/calendars':
          return await handleBusCalendars(env, origin, budget, fetchedAt);
        case 'POST /v1/bus/patterns':
          return await handleBusPatterns(request, env, origin, budget, fetchedAt);
        case 'POST /v1/bus/timetables':
          return await handleBusTimetables(request, env, origin, budget, fetchedAt);
        case 'POST /v1/bus/runs':
          return await handleBusRuns(request, env, origin, budget, fetchedAt);
        default:
          return errorResponse(ERR.NOT_FOUND, `未知のエンドポイントです: ${path}`, {
            status: 404,
            origin,
          });
      }
    } catch (e) {
      return mapError(e, origin);
    }
  },
};

/* ------------------------------------------------------------------ *
 *  エラー変換
 * ------------------------------------------------------------------ */
function mapError(e, origin) {
  if (e instanceof OdptError) {
    const status = e.status || 502;
    const headers = status === 429 ? { 'Retry-After': '60' } : {};
    const code =
      e.code === 'BUDGET_EXHAUSTED'
        ? ERR.BATCH_TOO_LARGE
        : ERR[e.code] || ERR.UPSTREAM_ERROR;
    return errorResponse(code, e.message, { status, origin, headers });
  }
  return errorResponse(ERR.UPSTREAM_ERROR, '予期しないエラーが発生しました', {
    status: 500,
    origin,
    detail: String(e && e.message ? e.message : e),
  });
}

/* ------------------------------------------------------------------ *
 *  GET /v1/health
 * ------------------------------------------------------------------ */
function handleHealth(env, origin, fetchedAt) {
  const enabled = resolveEnabledOperators(env);
  return json(
    {
      ok: true,
      fetchedAt,
      tokenConfigured: Boolean(odptToken(env)),
      // 登録時に前後の空白が混ざっていないかを確認できるようにする
      // (トークン自体は絶対に返さない)
      tokenLength: odptToken(env).length || undefined,
      tokenHadWhitespace: env.ODPT_TOKEN ? env.ODPT_TOKEN !== odptToken(env) : undefined,
      geocoder: (env.GEOCODER || 'gsi') === 'off' ? null : 'gsi',
      // チャレンジ事業者の状態(トークン自体は返さない)
      challenge: {
        enabled: challengeEnabled(env),
        tokenConfigured: Boolean(challengeToken(env)),
        flagSet: Boolean(String(env.ENABLE_CHALLENGE || '').trim()),
        note: challengeEnabled(env)
          ? 'チャレンジ限定データを利用中。この構成はコンテスト作品としてのみ公開できます。'
          : 'チャレンジ限定データは無効です(JR東日本・大手私鉄は非対応)。',
      },
      supported: enabled.map((o) => ({
        id: o.id,
        title: o.title,
        short: o.short,
        license: o.license,
        note: o.note,
      })),
      unavailable: [...OPERATORS, ...(challengeEnabled(env) ? CHALLENGE_OPERATORS : [])]
        .filter((o) => !enabled.includes(o))
        .map((o) => ({
          id: o.id,
          title: o.title,
          reason:
            o.host === 'basic'
              ? 'ODPT_TOKEN 未設定のため無効'
              : o.host === 'challenge'
                ? 'ODPT_CHALLENGE_TOKEN 未設定のため無効'
                : '設定により無効',
        })),
      unsupported: resolveUnsupported(env),
      bus: {
        operators: resolveBusOperators(env, { token: odptToken(env), challenge: challengeEnabled(env) }).map((o) => ({
          id: o.id,
          title: o.title,
          short: o.short,
          license: o.license,
        })),
        note: 'バスは全停留所を一括取得できないため、対象範囲を絞って都度検索します(バスは 1 本まで)。',
        unavailable: [...BUS_OPERATORS, ...CHALLENGE_BUS_OPERATORS]
          .filter(
            (o) =>
              !resolveBusOperators(env, { token: odptToken(env), challenge: challengeEnabled(env) }).includes(o)
          )
          .map((o) => ({
            id: o.id,
            title: o.title,
            reason:
              o.host === 'basic'
                ? 'ODPT_TOKEN 未設定のため無効'
                : o.host === 'challenge'
                  ? 'チャレンジ2026限定ライセンス(未有効化)'
                  : '設定により無効',
          })),
        // ODPT 側が API 形式の提供をやめた事業者。こちらの設定では復活できない。
        discontinued: DISCONTINUED_BUS_OPERATORS.map((o) => ({
          id: o.id,
          title: o.title,
          reason: `ODPT の API 形式データが ${o.endedOn.replace('-', '年')}月末で提供終了(後継は ${o.successor} のみ)`,
        })),
      },
    },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(TTL.health),
        'X-Data-Fetched-At': fetchedAt,
      },
    }
  );
}

/* ------------------------------------------------------------------ *
 *  GET /v1/network  — 路線・駅・駅順(静的)
 * ------------------------------------------------------------------ */
async function handleNetwork(env, origin, budget, fetchedAt) {
  const ops = resolveEnabledOperators(env);
  const railways = [];
  const stations = [];
  const errors = [];

  // 事業者ごとに Railway と Station を 1 回ずつ = 事業者数 × 2 サブリクエスト
  await Promise.all(
    ops.map(async (op) => {
      const p = { 'odpt:operator': operatorUrn(op.id) };
      try {
        const rs = await fetchOdpt(env, op.host, 'odpt:Railway', p, budget);
        for (const r of rs) railways.push(shapeRailway(r));
      } catch (e) {
        errors.push({ operator: op.id, type: 'Railway', message: e.message });
      }
      try {
        const ss = await fetchOdpt(env, op.host, 'odpt:Station', p, budget);
        for (const s of ss) stations.push(shapeStation(s));
      } catch (e) {
        errors.push({ operator: op.id, type: 'Station', message: e.message });
      }
    })
  );

  const partial = errors.length > 0;
  return json(
    {
      fetchedAt,
      operators: ops.map((o) => ({ id: o.id, title: o.title, short: o.short, license: o.license })),
      unsupported: resolveUnsupported(env),
      railways,
      stations,
      errors,
    },
    {
      origin,
      headers: {
        // 一部でも欠けたレスポンスを 24 時間キャッシュすると欠損が固定されるため短縮する
        'Cache-Control': cacheControl(partial ? 300 : TTL.network),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': partial ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ------------------------------------------------------------------ *
 *  GET /v1/status  — 運行情報
 * ------------------------------------------------------------------ */
async function handleStatus(env, origin, budget, fetchedAt) {
  const ops = resolveEnabledOperators(env);
  const items = [];
  const errors = [];

  await Promise.all(
    ops.map(async (op) => {
      try {
        const rows = await fetchOdpt(
          env,
          op.host,
          'odpt:TrainInformation',
          { 'odpt:operator': operatorUrn(op.id) },
          budget
        );
        for (const r of rows) items.push(shapeTrainInformation(r));
      } catch (e) {
        errors.push({ operator: op.id, operatorTitle: op.title, message: e.message });
      }
    })
  );

  const partial = errors.length > 0;
  return json(
    { fetchedAt, items, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(TTL.status),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': partial ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ------------------------------------------------------------------ *
 *  POST /v1/timetables  — 駅時刻表(バッチ)
 * ------------------------------------------------------------------ */
async function handleTimetables(request, env, origin, budget, fetchedAt) {
  const body = await readJson(request, origin);
  if (body instanceof Response) return body;

  const list = Array.isArray(body.stations) ? body.stations.filter((s) => typeof s === 'string') : [];
  if (!list.length) {
    return errorResponse(ERR.BAD_REQUEST, 'stations が空です', { status: 400, origin });
  }
  if (list.length > MAX_BATCH) {
    return errorResponse(ERR.BATCH_TOO_LARGE, `stations は 1 回あたり ${MAX_BATCH} 件までです`, {
      status: 400,
      origin,
    });
  }

  const calendar = typeof body.calendar === 'string' ? body.calendar : null;
  const results = [];
  const errors = [];

  await Promise.all(
    list.map(async (stationId) => {
      const op = getEnabledOperator(env, operatorOfUrn(stationId));
      if (!op) {
        errors.push({ station: stationId, message: '対応範囲外の事業者です' });
        return;
      }
      const params = { 'odpt:station': stationId };
      if (calendar) params['odpt:calendar'] = calendar;
      try {
        const rows = await fetchOdpt(env, op.host, 'odpt:StationTimetable', params, budget);
        for (const r of rows) results.push(shapeStationTimetable(r));
      } catch (e) {
        errors.push({ station: stationId, message: e.message });
      }
    })
  );

  return json(
    { fetchedAt, timetables: results, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.timetable),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ------------------------------------------------------------------ *
 *  POST /v1/trains  — 列車時刻表(バッチ)
 *   { trains: ["odpt.TrainTimetable:..."] }            … ID 直指定
 *   { queries: [{railway, no, calendar}] }             … 列車番号から引く
 * ------------------------------------------------------------------ */
async function handleTrains(request, env, origin, budget, fetchedAt) {
  const body = await readJson(request, origin);
  if (body instanceof Response) return body;

  const ids = Array.isArray(body.trains) ? body.trains.filter((s) => typeof s === 'string') : [];
  const queries = Array.isArray(body.queries) ? body.queries.filter((q) => q && q.railway && q.no) : [];
  const total = ids.length + queries.length;

  if (!total) {
    return errorResponse(ERR.BAD_REQUEST, 'trains / queries が空です', { status: 400, origin });
  }
  if (total > MAX_BATCH) {
    return errorResponse(ERR.BATCH_TOO_LARGE, `1 回あたり合計 ${MAX_BATCH} 件までです`, {
      status: 400,
      origin,
    });
  }

  const results = [];
  const errors = [];

  const run = async (key, host, params) => {
    try {
      const rows = await fetchOdpt(env, host, 'odpt:TrainTimetable', params, budget);
      if (!rows.length) errors.push({ key, message: '該当する列車時刻表が見つかりません' });
      for (const r of rows) results.push(shapeTrainTimetable(r));
    } catch (e) {
      errors.push({ key, message: e.message });
    }
  };

  await Promise.all([
    ...ids.map((id) => {
      const op = getEnabledOperator(env, operatorOfUrn(id));
      if (!op) {
        errors.push({ key: id, message: '対応範囲外の事業者です' });
        return Promise.resolve();
      }
      // odpt:train が odpt.Train:… を指す事業者もあるため、
      // TrainTimetable の ID として引けない場合は列車番号での検索にフォールバックする。
      if (id.startsWith('odpt.TrainTimetable:')) {
        return run(id, op.host, { 'owl:sameAs': id });
      }
      const no = id.split('.').pop();
      return run(id, op.host, { 'odpt:trainNumber': no });
    }),
    ...queries.map((q) => {
      const op = getEnabledOperator(env, operatorOfUrn(q.railway));
      if (!op) {
        errors.push({ key: `${q.railway}/${q.no}`, message: '対応範囲外の事業者です' });
        return Promise.resolve();
      }
      const params = { 'odpt:railway': q.railway, 'odpt:trainNumber': q.no };
      if (q.calendar) params['odpt:calendar'] = q.calendar;
      return run(`${q.railway}/${q.no}`, op.host, params);
    }),
  ]);

  return json(
    { fetchedAt, trains: results, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.timetable),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ------------------------------------------------------------------ *
 *  GET /v1/geocode?q=
 * ------------------------------------------------------------------ */
async function handleGeocode(url, env, origin, budget, fetchedAt) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) {
    return errorResponse(ERR.BAD_REQUEST, 'q が空です', { status: 400, origin });
  }
  if (q.length > 100) {
    return errorResponse(ERR.BAD_REQUEST, 'q が長すぎます', { status: 400, origin });
  }
  const results = await geocode(env, q, budget);
  return json(
    { fetchedAt, query: q, results },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(TTL.geocode),
        'X-Data-Fetched-At': fetchedAt,
        'X-Data-Source': 'gsi',
      },
    }
  );
}

/* ------------------------------------------------------------------ */
async function readJson(request, origin) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') throw new Error('not an object');
    return body;
  } catch {
    return errorResponse(ERR.BAD_REQUEST, 'JSON ボディを解釈できませんでした', {
      status: 400,
      origin,
    });
  }
}

/* ================================================================== *
 *  バス
 * ------------------------------------------------------------------
 *  バス停は全件取得できない(1000件上限・ページングなし)ため、
 *  すべて「名前で引く / ID を指定して引く」方式にしている。
 * ================================================================== */

/** odpt.BusstopPole:Toei.ShibuyaStation.636.1 → 'Toei' */
function busOperatorOfUrn(urn) {
  const m = /^odpt\.[A-Za-z]+:([A-Za-z0-9-]+)\./.exec(urn || '');
  return m ? busOperator(m[1]) : null;
}

/* ---- GET /v1/bus/stops?q=渋谷駅前[&q=...] ---- */
async function handleBusStops(url, env, origin, budget, fetchedAt) {
  const names = url.searchParams.getAll('q').map((s) => s.trim()).filter(Boolean);
  if (!names.length) {
    return errorResponse(ERR.BAD_REQUEST, 'q が空です', { status: 400, origin });
  }
  if (names.length > 6) {
    return errorResponse(ERR.BATCH_TOO_LARGE, 'q は 1 回あたり 6 件までです', { status: 400, origin });
  }

  const ops = resolveBusOperators(env, { token: odptToken(env), challenge: challengeEnabled(env) });
  // 事業者数 × 名前数がそのままサブリクエスト数になる。
  // 無料枠の上限(50)を超えないよう、超えそうなら名前を削って理由を返す。
  const maxNames = Math.max(1, Math.floor(SUBREQUEST_CAP / Math.max(1, ops.length)));
  const trimmed = names.slice(maxNames);
  const used = names.slice(0, maxNames);
  const stops = [];
  const errors = [];

  for (const name of trimmed) {
    errors.push({ query: name, message: 'サブリクエスト上限のため、この名前は検索していません' });
  }

  await Promise.all(
    ops.flatMap((op) =>
      used.map(async (name) => {
        try {
          const rows = await fetchStopsByTitle(env, op, name, budget);
          for (const s of rows) stops.push({ ...s, query: name });
        } catch (e) {
          errors.push({ operator: op.id, query: name, message: e.message });
        }
      })
    )
  );

  return json(
    { fetchedAt, queries: used, stops, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.network),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ---- GET /v1/bus/calendars ---- */
async function handleBusCalendars(env, origin, budget, fetchedAt) {
  const ops = resolveBusOperators(env, { token: odptToken(env), challenge: challengeEnabled(env) });
  const calendars = [];
  const errors = [];

  await Promise.all(
    ops.map(async (op) => {
      try {
        const rows = await fetchCalendars(env, op, budget);
        for (const c of rows) calendars.push(c);
      } catch (e) {
        errors.push({ operator: op.id, message: e.message });
      }
    })
  );

  return json(
    { fetchedAt, calendars, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.network),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ---- POST /v1/bus/patterns { ids: [...] } ---- */
async function handleBusPatterns(request, env, origin, budget, fetchedAt) {
  const body = await readJson(request, origin);
  if (body instanceof Response) return body;
  const ids = Array.isArray(body.ids) ? body.ids.filter((s) => typeof s === 'string') : [];
  if (!ids.length) return errorResponse(ERR.BAD_REQUEST, 'ids が空です', { status: 400, origin });
  if (ids.length > MAX_BATCH) {
    return errorResponse(ERR.BATCH_TOO_LARGE, `ids は 1 回あたり ${MAX_BATCH} 件までです`, { status: 400, origin });
  }

  const patterns = [];
  const errors = [];
  await Promise.all(
    ids.map(async (id) => {
      const op = busOperatorOfUrn(id);
      if (!op) {
        errors.push({ id, message: '対応範囲外のバス事業者です' });
        return;
      }
      try {
        for (const p of await fetchPattern(env, op, id, budget)) patterns.push(p);
      } catch (e) {
        errors.push({ id, message: e.message });
      }
    })
  );

  return json(
    { fetchedAt, patterns, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.timetable),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ---- POST /v1/bus/timetables { poles: [...] } ---- */
async function handleBusTimetables(request, env, origin, budget, fetchedAt) {
  const body = await readJson(request, origin);
  if (body instanceof Response) return body;
  const poles = Array.isArray(body.poles) ? body.poles.filter((s) => typeof s === 'string') : [];
  if (!poles.length) return errorResponse(ERR.BAD_REQUEST, 'poles が空です', { status: 400, origin });
  if (poles.length > MAX_BATCH) {
    return errorResponse(ERR.BATCH_TOO_LARGE, `poles は 1 回あたり ${MAX_BATCH} 件までです`, { status: 400, origin });
  }

  const timetables = [];
  const errors = [];
  await Promise.all(
    poles.map(async (pole) => {
      const op = busOperatorOfUrn(pole);
      if (!op) {
        errors.push({ pole, message: '対応範囲外のバス事業者です' });
        return;
      }
      try {
        for (const t of await fetchPoleTimetables(env, op, pole, budget)) timetables.push(t);
      } catch (e) {
        errors.push({ pole, message: e.message });
      }
    })
  );

  return json(
    { fetchedAt, timetables, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.timetable),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ---- POST /v1/bus/runs { runs: [{pattern, calendar}] } ---- */
async function handleBusRuns(request, env, origin, budget, fetchedAt) {
  const body = await readJson(request, origin);
  if (body instanceof Response) return body;
  const list = Array.isArray(body.runs) ? body.runs.filter((r) => r && typeof r.pattern === 'string') : [];
  if (!list.length) return errorResponse(ERR.BAD_REQUEST, 'runs が空です', { status: 400, origin });
  if (list.length > 10) {
    return errorResponse(ERR.BATCH_TOO_LARGE, 'runs は 1 回あたり 10 件までです', { status: 400, origin });
  }

  const runs = [];
  const errors = [];
  await Promise.all(
    list.map(async (r) => {
      const op = busOperatorOfUrn(r.pattern);
      if (!op) {
        errors.push({ pattern: r.pattern, message: '対応範囲外のバス事業者です' });
        return;
      }
      try {
        for (const t of await fetchRuns(env, op, r.pattern, r.calendar || null, budget)) runs.push(t);
      } catch (e) {
        errors.push({ pattern: r.pattern, message: e.message });
      }
    })
  );

  return json(
    { fetchedAt, runs, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.timetable),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}


export default __worker;
