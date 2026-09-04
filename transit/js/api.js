/**
 * Worker クライアント
 * ------------------------------------------------------------------
 * ・フロントは ODPT を直接叩かない。すべてこの Worker 経由。
 * ・失敗は握りつぶさず ApiError として投げる。UI が原因を表示する。
 * ・429 は特別扱いし、Retry-After をそのまま UI に渡す。
 */

export class ApiError extends Error {
  constructor(code, message, { status = 0, retryAfter = null, detail = null } = {}) {
    super(message || code);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
    this.detail = detail;
  }
}

const MESSAGES = {
  RATE_LIMITED: 'アクセスが集中しています。無料枠の上限に達しました。',
  UPSTREAM_ERROR: 'ODPT からデータを取得できませんでした。',
  UPSTREAM_TIMEOUT: 'ODPT の応答がありません。',
  UNAUTHORIZED: 'API トークンが無効です。管理者にご連絡ください。',
  BATCH_TOO_LARGE: 'リクエストが大きすぎます。',
  FORBIDDEN_ORIGIN: 'このページからは Worker にアクセスできません(CORS 許可オリジンの設定を確認してください)。',
  GEOCODER_UNAVAILABLE: '住所検索サービスを利用できませんでした。',
  NETWORK: 'Worker に接続できませんでした。URL とネットワーク状態を確認してください。',
  NOT_FOUND: 'Worker のエンドポイントが見つかりません。Worker のバージョンを確認してください。',
};

export function messageFor(code, fallback) {
  return MESSAGES[code] || fallback || '不明なエラーが発生しました。';
}

export class TransitApi {
  /** @param {string} baseUrl 例: https://kanto-transit-proxy.example.workers.dev */
  constructor(baseUrl) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    /** 429 を受けたら、この時刻まで新規リクエストを送らない */
    this.blockedUntil = 0;
  }

  get isBlocked() {
    return Date.now() < this.blockedUntil;
  }

  get blockedSeconds() {
    return Math.max(0, Math.ceil((this.blockedUntil - Date.now()) / 1000));
  }

  async #request(path, { method = 'GET', body = null, retries = 2 } = {}) {
    if (this.isBlocked) {
      throw new ApiError('RATE_LIMITED', MESSAGES.RATE_LIMITED, {
        status: 429,
        retryAfter: this.blockedSeconds,
      });
    }

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      let res;
      try {
        res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        lastError = new ApiError('NETWORK', MESSAGES.NETWORK, { detail: String(e && e.message) });
        if (attempt < retries) {
          await sleep(2 ** attempt * 1000);
          continue;
        }
        throw lastError;
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After')) || 60;
        this.blockedUntil = Date.now() + retryAfter * 1000;
        throw new ApiError('RATE_LIMITED', MESSAGES.RATE_LIMITED, { status: 429, retryAfter });
      }

      if (!res.ok) {
        let payload = null;
        try {
          payload = await res.json();
        } catch {
          /* ignore */
        }
        const code = payload?.error?.code || 'UPSTREAM_ERROR';
        const err = new ApiError(code, messageFor(code, payload?.error?.message), {
          status: res.status,
          detail: payload?.error?.detail || payload?.error?.message || null,
        });
        // 5xx のみ再試行。4xx は投げっぱなし(再試行しても直らない)
        if (res.status >= 500 && attempt < retries) {
          lastError = err;
          await sleep(2 ** attempt * 1000);
          continue;
        }
        throw err;
      }

      const data = await res.json();
      return {
        data,
        fetchedAt: res.headers.get('X-Data-Fetched-At') || data.fetchedAt || null,
        cacheStatus: res.headers.get('X-Cache-Status') || null,
        partial: res.headers.get('X-Partial') === '1',
      };
    }
    throw lastError || new ApiError('UPSTREAM_ERROR', MESSAGES.UPSTREAM_ERROR);
  }

  health() {
    return this.#request('/v1/health');
  }

  network() {
    return this.#request('/v1/network');
  }

  status() {
    return this.#request('/v1/status', { retries: 1 });
  }

  /** @param {string[]} stations 最大 20 件 */
  timetables(stations, calendar) {
    return this.#request('/v1/timetables', {
      method: 'POST',
      body: { stations, calendar: calendar || undefined },
    });
  }

  /** @param {string[]} trains 最大 20 件 */
  trains(trains) {
    return this.#request('/v1/trains', { method: 'POST', body: { trains } });
  }

  /** 列車番号から引く(odpt:train が無い事業者向けのフォールバック) */
  trainQueries(queries) {
    return this.#request('/v1/trains', { method: 'POST', body: { queries } });
  }

  geocode(q) {
    return this.#request(`/v1/geocode?q=${encodeURIComponent(q)}`, { retries: 1 });
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 配列を n 件ずつに分割 */
export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
