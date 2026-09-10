/**
 * CORS・レスポンス整形・エラーコードの共通処理
 */

/** アプリ内で使うエラーコード。フロントはこのコードで分岐する。 */
export const ERR = {
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
export function resolveOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return { allowed: true, origin: null }; // curl 等の直接アクセス
  const list = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (list.includes(origin.replace(/\/$/, ''))) return { allowed: true, origin };
  return { allowed: false, origin };
}

export function corsHeaders(origin) {
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

export function json(body, { status = 200, origin = null, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
      ...headers,
    },
  });
}

export function errorResponse(code, message, { status = 500, origin = null, headers = {}, detail = null } = {}) {
  return json({ error: { code, message, detail } }, { status, origin, headers });
}

/**
 * 種別ごとの TTL(秒)。
 * 運行情報が短いのは「古い動的データを最新に見せない」ため。
 * ODPT の API 利用ガイドラインが求める要件でもある。
 */
export const TTL = {
  network: 86400, // 路線・駅・駅順(静的)
  timetable: 21600, // 時刻表(ダイヤ改正まで不変)
  status: 60, // 運行情報
  geocode: 86400, // ジオコーディング結果
  health: 300,
};

export function cacheControl(seconds) {
  return `public, max-age=${seconds}`;
}
