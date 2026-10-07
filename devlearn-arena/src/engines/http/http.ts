import { curlTlsError, verify, type Cert, type TlsVerdict } from '@/engines/tls/tls';

/**
 * HTTP の模型（docs/learning-design.md 6 章: HTTP・TLS、docs/lessons/web.md）。純粋な関数。
 *
 * - 名前でサイトを引き、ポートに待ち受けがあれば、メソッドと道（パス）ごとの答え（状態の番号・見出し・中身）を返す
 * - 道の答えは「/path」（GET と HEAD で答え、ほかのメソッドは 405）か「POST /path」（そのメソッドだけ）で書く
 * - API（api）を持つサイトは、資源の集まり（/items と /items/3）を覚えていて、作る・取る・置き換える・消すで変わる（状態は sites に返す）
 * - https では証明書の連鎖を検証し（src/engines/tls）、信頼できなければつながない（-k で検証を飛ばせる）
 * - 版: https で HTTP/2 に対応したサイトとは HTTP/2 で話す（curl の既定と同じ）。HTTP/3 に対応したサイトは alt-svc の見出しで知らせる
 * - localhost（と自分の名前）は、手元で動いているサービス（Web サーバの設定。src/engines/kernel/webConfig.ts）と、公開したコンテナのポートが応える
 */

export interface Route {
  status: number;
  body: string;
  headers?: Readonly<Record<string, string>>;
  /** 状態の行の理由の語（無ければ決まった語。ingress-nginx の 503 は Service Temporarily Unavailable） */
  reason?: string;
}

export type FieldType = 'string' | 'number' | 'boolean';

/** 資源の集まりを覚えている API（REST の形） */
export interface Api {
  /** 集まりの道（/items）。1 つの資源は /items/<id> */
  base: string;
  /** 今の資源（id を持つ） */
  items: readonly Readonly<Record<string, unknown>>[];
  /** 作る・置き換える時に要る項目と型（id は書かない） */
  fields: Readonly<Record<string, FieldType>>;
}

export type HttpVersion = '1.1' | '2' | '3';

export interface Site {
  host: string;
  /** 待ち受けるポート（http は 80、https は 443 が多い） */
  port: number;
  /** https のサイトが送る証明書（葉 → 中間） */
  chain?: readonly Cert[];
  /** 対応する HTTP の版（無ければ 1.1 だけ） */
  versions?: readonly HttpVersion[];
  routes: Readonly<Record<string, Route>>;
  api?: Api;
}

/** 手元の Web サーバへの頼み（名前で振り分けるため、頼んだ名前も渡す） */
export interface LocalRequest {
  scheme: 'http' | 'https';
  host: string;
  port: number;
  method: string;
  path: string;
}

/** 手元のポートで待ち受けている物（chain があれば https で待ち受ける）。respond が頼みに答える */
export type LocalListener = { server: string; chain?: readonly Cert[]; respond: (req: LocalRequest) => Route } | { reset: true };

export interface HttpEnv {
  sites: readonly Site[];
  /** 手元が信頼するルート証明書 */
  roots: readonly Cert[];
  /** 今日の日付（YYYY-MM-DD。証明書の期限を見る） */
  today: string;
  /** 手元を指す名前 */
  localNames: readonly string[];
  local: (port: number) => LocalListener | null;
  /**
   * 手元の外で、名前（/etc/hosts）か住所で届く物（クラスタの入口など）。知らない名前なら undefined（sites を探す）、
   * 知っている住所でもそのポートで待ち受けていなければ null
   */
  remote?: (host: string, port: number) => LocalListener | null | undefined;
}

export interface Url {
  scheme: 'http' | 'https';
  host: string;
  port: number;
  /** 道（? の後の問い合わせを含む） */
  path: string;
}

export function parseUrl(raw: string): Url | null {
  const m = /^(?:(https?):\/\/)?([^/:?#]+)(?::(\d+))?([/?][^#]*)?(?:#.*)?$/.exec(raw);
  if (!m) return null;
  const scheme = (m[1] ?? 'http') as Url['scheme'];
  const rest = m[4] ?? '/';
  return { scheme, host: (m[2] ?? '').toLowerCase(), port: Number(m[3] ?? (scheme === 'https' ? 443 : 80)), path: rest.startsWith('?') ? `/${rest}` : rest };
}

export interface HttpResponse {
  status: number;
  reason: string;
  /** 話した HTTP の版 */
  version: HttpVersion;
  headers: Record<string, string>;
  body: string;
}

export type HttpFailure =
  | { kind: 'bad-url'; message: string }
  | { kind: 'resolve'; host: string }
  | { kind: 'refused'; host: string; port: number }
  | { kind: 'empty-reply' }
  | { kind: 'tls'; verdict: Extract<TlsVerdict, { trusted: false }> };

export type HttpOutcome =
  | { ok: true; url: Url; response: HttpResponse; tls?: TlsVerdict; /** API の資源が変わった時の、新しいサイトの並び */ sites?: Site[] }
  | { ok: false; url: Url | null; error: HttpFailure };

export interface RequestOptions {
  insecure?: boolean;
  /** 無ければ GET */
  method?: string;
  /** 送る中身（-d） */
  data?: string;
  /** 話したい版（--http1.1・--http2・--http3）。無ければ curl の既定 */
  version?: HttpVersion;
  /** 送る Host の見出し（-H 'Host: 名前'）。無ければ URL の名前 */
  host?: string;
}

const REASONS: Record<number, string> = {
  200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 415: 'Unsupported Media Type',
  500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};

export const reasonOf = (status: number): string => REASONS[status] ?? '';

const NOT_FOUND: Route = { status: 404, body: '<html><body><h1>404 Not Found</h1></body></html>' };

/** 状態の番号に合わせた、Web サーバの既定の中身 */
export const pageOf = (status: number): string => `<html><body><h1>${String(status)} ${reasonOf(status)}</h1></body></html>`;

function respond(route: Route, server: string, method: string, version: HttpVersion): HttpResponse {
  const json = route.body.trimStart().startsWith('{') || route.body.trimStart().startsWith('[');
  const headers: Record<string, string> = {
    Server: server,
    ...(route.status === 204 ? {} : { 'Content-Type': json ? 'application/json' : 'text/html', 'Content-Length': String(new TextEncoder().encode(route.body).length) }),
    ...route.headers,
  };
  return { status: route.status, reason: route.reason ?? reasonOf(route.status), version, headers, body: method === 'HEAD' ? '' : route.body };
}

const pathOnly = (path: string): string => path.split('?')[0] ?? '/';

/** 道の答えを探す。「METHOD /path」の答えか、「/path」の答え（GET と HEAD）。道はあるがメソッドが違えば 405 */
export function routeFor(routes: Readonly<Record<string, Route>>, method: string, path: string): Route {
  const m = method === 'HEAD' ? 'GET' : method;
  for (const p of [path, pathOnly(path)]) {
    const own = routes[`${m} ${p}`] ?? (m === 'GET' ? routes[p] : undefined);
    if (own) return own;
    const allowed = Object.keys(routes).flatMap((k) => {
      const [a, b] = k.split(' ');
      if (b === undefined) return a === p ? ['GET', 'HEAD'] : [];
      return b === p ? [a ?? ''] : [];
    });
    if (allowed.length > 0) return { status: 405, body: pageOf(405), headers: { Allow: [...new Set(allowed)].join(', ') } };
  }
  return NOT_FOUND;
}

/* ---------- API（資源の集まり） ---------- */

const jsonOf = (v: unknown): string => JSON.stringify(v);
const apiError = (status: number, message: string): Route => ({ status, body: jsonOf({ error: message }) });

/** 送られた中身を、項目の型と照らす。誤りは API の言い方（英語）で返す */
type Checked = { ok: true; value: Record<string, unknown> } | { ok: false; route: Route };

function validate(api: Api, data: string | undefined, partial: boolean): Checked {
  const bad = (message: string): Checked => ({ ok: false, route: apiError(400, message) });
  let obj: unknown;
  try {
    obj = JSON.parse(data ?? '');
  } catch {
    return bad('invalid JSON in request body');
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return bad('request body must be a JSON object');
  const rec = obj as Record<string, unknown>;
  for (const k of Object.keys(rec)) if (k !== 'id' && !(k in api.fields)) return bad(`unknown field "${k}"`);
  for (const [k, t] of Object.entries(api.fields)) {
    if (!(k in rec)) {
      if (partial) continue;
      return bad(`field "${k}" is required`);
    }
    if (typeof rec[k] !== t) return bad(`field "${k}" must be a ${t}`);
  }
  const value = Object.fromEntries(Object.entries(rec).filter(([k]) => k !== 'id'));
  return { ok: true, value };
}

/** API への頼み。答えと、変わった後の API（変わらなければ同じ物） */
export function apiRequest(api: Api, method: string, path: string, data?: string): { route: Route; api: Api } | null {
  const p = pathOnly(path).replace(/\/+$/, '') || '/';
  const base = api.base.replace(/\/+$/, '');
  const same = (route: Route): { route: Route; api: Api } => ({ route, api });
  const m = method === 'HEAD' ? 'GET' : method;
  if (p === base) {
    if (m === 'GET') return same({ status: 200, body: jsonOf(api.items) });
    if (m === 'POST') {
      const v = validate(api, data, false);
      if (!v.ok) return same(v.route);
      const id = Math.max(0, ...api.items.map((x) => Number(x['id']) || 0)) + 1;
      const item = { id, ...v.value };
      return { route: { status: 201, body: jsonOf(item), headers: { Location: `${base}/${String(id)}` } }, api: { ...api, items: [...api.items, item] } };
    }
    return same({ status: 405, body: jsonOf({ error: 'method not allowed' }), headers: { Allow: 'GET, POST' } });
  }
  const one = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)$`).exec(p);
  if (!one) return null;
  const id = one[1] ?? '';
  const at = api.items.findIndex((x) => String(x['id']) === id);
  if (m !== 'GET' && m !== 'PUT' && m !== 'PATCH' && m !== 'DELETE') return same({ status: 405, body: jsonOf({ error: 'method not allowed' }), headers: { Allow: 'GET, PUT, PATCH, DELETE' } });
  if (at < 0) return same(apiError(404, `item ${id} not found`));
  const cur = api.items[at] ?? {};
  if (m === 'GET') return same({ status: 200, body: jsonOf(cur) });
  if (m === 'DELETE') return { route: { status: 204, body: '' }, api: { ...api, items: api.items.filter((_, i) => i !== at) } };
  const v = validate(api, data, m === 'PATCH');
  if (!v.ok) return same(v.route);
  const next = { ...(m === 'PATCH' ? cur : {}), id: cur['id'], ...v.value };
  return { route: { status: 200, body: jsonOf(next) }, api: { ...api, items: api.items.map((x, i) => (i === at ? next : x)) } };
}

/* ---------- 頼む ---------- */

/** curl の既定の版: https で HTTP/2 に対応していれば 2。--http3 は対応していれば 3 */
function versionOf(site: Pick<Site, 'versions'>, scheme: Url['scheme'], want: HttpVersion | undefined): HttpVersion {
  const v = site.versions ?? ['1.1'];
  if (want === '3' && v.includes('3') && scheme === 'https') return '3';
  if (want === '1.1') return '1.1';
  return scheme === 'https' && v.includes('2') ? '2' : '1.1';
}

export function request(env: HttpEnv, raw: string, opts: RequestOptions = {}): HttpOutcome {
  const url = parseUrl(raw);
  if (!url) return { ok: false, url: null, error: { kind: 'bad-url', message: raw } };
  const method = (opts.method ?? (opts.data !== undefined ? 'POST' : 'GET')).toUpperCase();
  if (env.localNames.includes(url.host)) {
    const l = env.local(url.port);
    if (!l) return { ok: false, url, error: { kind: 'refused', host: url.host, port: url.port } };
    if ('reset' in l) return { ok: false, url, error: { kind: 'empty-reply' } };
    let tls: TlsVerdict | undefined;
    if (url.scheme === 'https') {
      if (!l.chain || l.chain.length === 0) return { ok: false, url, error: { kind: 'empty-reply' } };
      tls = verify(url.host, l.chain, env.roots, env.today);
      if (!tls.trusted && !opts.insecure) return { ok: false, url, error: { kind: 'tls', verdict: tls } };
    } else if (l.chain) {
      // https で待ち受けるポートに、暗号化せずに頼んだ
      return { ok: true, url, response: respond({ status: 400, body: '<html><body><h1>400 Bad Request</h1><p>The plain HTTP request was sent to HTTPS port</p></body></html>' }, l.server, method, '1.1') };
    }
    const route = l.respond({ scheme: url.scheme, host: opts.host ?? url.host, port: url.port, method, path: url.path });
    return { ok: true, url, response: respond(route, l.server, method, '1.1'), ...(tls ? { tls } : {}) };
  }
  const remote = env.remote?.(url.host, url.port);
  if (remote !== undefined) {
    if (remote === null) return { ok: false, url, error: { kind: 'refused', host: url.host, port: url.port } };
    if ('reset' in remote || url.scheme === 'https') return { ok: false, url, error: { kind: 'empty-reply' } };
    const route = remote.respond({ scheme: url.scheme, host: opts.host ?? url.host, port: url.port, method, path: url.path });
    return { ok: true, url, response: respond(route, remote.server, method, '1.1') };
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
  } else if (site.chain && site.chain.length > 0) {
    return { ok: true, url, response: respond({ status: 400, body: '<html><body><h1>400 Bad Request</h1><p>The plain HTTP request was sent to HTTPS port</p></body></html>' }, 'nginx', method, '1.1') };
  }
  const version = versionOf(site, url.scheme, opts.version);
  const alt: Record<string, string> = site.versions?.includes('3') && url.scheme === 'https' ? { 'alt-svc': `h3=":${String(url.port)}"; ma=86400` } : {};
  const viaApi = site.api ? apiRequest(site.api, method, url.path, opts.data) : null;
  if (viaApi) {
    const response = respond({ ...viaApi.route, headers: { ...viaApi.route.headers, ...alt } }, 'nginx', method, version);
    const changed = viaApi.api !== site.api;
    const sites = changed ? env.sites.map((s) => (s === site ? { ...s, api: viaApi.api } : s)) : undefined;
    return { ok: true, url, response, ...(tls ? { tls } : {}), ...(sites ? { sites } : {}) };
  }
  const route = routeFor(site.routes, method, url.path);
  return { ok: true, url, response: respond({ ...route, headers: { ...route.headers, ...alt } }, 'nginx', method, version), ...(tls ? { tls } : {}) };
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
