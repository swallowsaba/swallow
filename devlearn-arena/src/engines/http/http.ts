import { curlTlsError, verify, type Cert, type TlsVerdict } from '@/engines/tls/tls';

/**
 * HTTP の模型（docs/learning-design.md 6 章: HTTP・TLS）。純粋な関数。
 *
 * - 名前でサイトを引き、ポートに待ち受けがあれば、道（パス）ごとの答え（状態の番号・見出し・中身）を返す
 * - https では証明書の連鎖を検証し（src/engines/tls）、信頼できなければつながない（-k で検証を飛ばせる）
 * - localhost（と自分の名前）は、手元で動いているサービスと、公開したコンテナのポートが応える
 */

export interface Route {
  status: number;
  body: string;
  headers?: Readonly<Record<string, string>>;
}

export interface Site {
  host: string;
  /** 待ち受けるポート（http は 80、https は 443 が多い） */
  port: number;
  /** https のサイトが送る証明書（葉 → 中間） */
  chain?: readonly Cert[];
  routes: Readonly<Record<string, Route>>;
}

/** 手元のポートで待ち受けている物 */
export type LocalListener = { body: string; server: string } | { reset: true };

export interface HttpEnv {
  sites: readonly Site[];
  /** 手元が信頼するルート証明書 */
  roots: readonly Cert[];
  /** 今日の日付（YYYY-MM-DD。証明書の期限を見る） */
  today: string;
  /** 手元を指す名前 */
  localNames: readonly string[];
  local: (port: number) => LocalListener | null;
}

export interface Url {
  scheme: 'http' | 'https';
  host: string;
  port: number;
  path: string;
}

export function parseUrl(raw: string): Url | null {
  const m = /^(?:(https?):\/\/)?([^/:?#]+)(?::(\d+))?(\/[^#]*)?$/.exec(raw);
  if (!m) return null;
  const scheme = (m[1] ?? 'http') as Url['scheme'];
  return { scheme, host: (m[2] ?? '').toLowerCase(), port: Number(m[3] ?? (scheme === 'https' ? 443 : 80)), path: m[4] ?? '/' };
}

export interface HttpResponse {
  status: number;
  reason: string;
  headers: Record<string, string>;
  body: string;
}

export type HttpFailure =
  | { kind: 'bad-url'; message: string }
  | { kind: 'resolve'; host: string }
  | { kind: 'refused'; host: string; port: number }
  | { kind: 'empty-reply' }
  | { kind: 'tls'; verdict: Extract<TlsVerdict, { trusted: false }> };

export type HttpOutcome = { ok: true; url: Url; response: HttpResponse; tls?: TlsVerdict } | { ok: false; url: Url | null; error: HttpFailure };

const REASONS: Record<number, string> = {
  200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
  500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};

export const reasonOf = (status: number): string => REASONS[status] ?? '';

function respond(route: Route | undefined, server: string): HttpResponse {
  const r = route ?? { status: 404, body: '<html><body><h1>404 Not Found</h1></body></html>' };
  return {
    status: r.status,
    reason: reasonOf(r.status),
    headers: { Server: server, 'Content-Type': 'text/html', 'Content-Length': String(r.body.length), ...r.headers },
    body: r.body,
  };
}

export function request(env: HttpEnv, raw: string, opts: { insecure?: boolean } = {}): HttpOutcome {
  const url = parseUrl(raw);
  if (!url) return { ok: false, url: null, error: { kind: 'bad-url', message: raw } };
  if (env.localNames.includes(url.host)) {
    const l = env.local(url.port);
    if (!l) return { ok: false, url, error: { kind: 'refused', host: url.host, port: url.port } };
    if ('reset' in l) return { ok: false, url, error: { kind: 'empty-reply' } };
    return { ok: true, url, response: respond(url.path === '/' || url.path === '/index.html' ? { status: 200, body: l.body } : undefined, l.server) };
  }
  const named = env.sites.filter((s) => s.host === url.host);
  if (named.length === 0) return { ok: false, url, error: { kind: 'resolve', host: url.host } };
  const site = named.find((s) => s.port === url.port);
  if (!site) return { ok: false, url, error: { kind: 'refused', host: url.host, port: url.port } };
  let tls: TlsVerdict | undefined;
  if (url.scheme === 'https') {
    if (!site.chain || site.chain.length === 0) return { ok: false, url, error: { kind: 'empty-reply' } };
    tls = verify(url.host, site.chain, env.roots, env.today);
    if (!tls.trusted && !opts.insecure) return { ok: false, url, error: { kind: 'tls', verdict: tls } };
  }
  return { ok: true, url, response: respond(site.routes[url.path], 'nginx'), ...(tls ? { tls } : {}) };
}

/** curl と同じ言い方のエラー（終了の値と文） */
export function curlError(e: HttpFailure, host = ''): { code: number; message: string } {
  switch (e.kind) {
    case 'bad-url':
      return { code: 3, message: `URL rejected: Malformed input to a URL function` };
    case 'resolve':
      return { code: 6, message: `Could not resolve host: ${e.host}` };
    case 'refused':
      return { code: 7, message: `Failed to connect to ${e.host} port ${String(e.port)} after 0 ms: Couldn't connect to server` };
    case 'empty-reply':
      return { code: 52, message: 'Empty reply from server' };
    case 'tls':
      return curlTlsError(host || e.verdict.cert.subject, e.verdict);
  }
}
