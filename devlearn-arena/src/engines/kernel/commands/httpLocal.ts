import { portOwner, servedAt } from '@/engines/container/container';
import { ingressAnswer } from '@/engines/k8s/ingress';
import { addCookie, cookieHeader, jarText, parseJar, parseSetCookie, type Cookie } from '@/engines/http/cookies';
import { sessionAnswer } from '@/engines/http/session';
import { siteOf } from '@/engines/cicd/project';
import { DEMO_ROOT } from '@/engines/tls/tls';
import { curlError, pageOf, parseUrl, request, routeFor, type Site, type HttpEnv, type HttpOutcome, type HttpVersion, type LocalListener, type LocalRequest, type Route } from '@/engines/http/http';
import { normalize } from '../path';
import { allows } from '../perm';
import type { CommandResult, ShellState } from '../registry';
import type { Service } from '../services';
import { groupsOfUser } from '../users';
import { exists, isDir, metaOf, readFile, writeFile } from '../vfs';
import { pickServer, type Location, type ServerBlock, type Upstream } from '../webConfig';
import { diskUse } from './proc';

/** /etc/hosts で手元（127.0.0.1・::1）を指す名前 */
function hostsLocalNames(shell: ShellState): string[] {
  const path = '/etc/hosts';
  if (!exists(shell.vfs, path) || isDir(shell.vfs, path)) return [];
  return readFile(shell.vfs, path).split('\n').flatMap((line) => {
    const [addr, ...names] = line.replace(/#.*$/, '').trim().split(/\s+/);
    return addr === '127.0.0.1' || addr === '::1' ? names.map((n) => n.toLowerCase()) : [];
  });
}

/** /etc/hosts で名前が指す住所（無ければ null） */
function hostsAddress(shell: ShellState, name: string): string | null {
  const path = '/etc/hosts';
  if (!exists(shell.vfs, path) || isDir(shell.vfs, path)) return null;
  for (const line of readFile(shell.vfs, path).split('\n')) {
    const [addr, ...names] = line.replace(/#.*$/, '').trim().split(/\s+/);
    if (addr && names.some((n) => n.toLowerCase() === name)) return addr;
  }
  return null;
}

/** クラスタの入口（ingress-nginx）の住所に届いた頼み。80 番で待ち受け、Ingress の規則で振り分ける */
function clusterRemote(shell: ShellState, host: string, port: number): LocalListener | null | undefined {
  const cluster = shell.cluster;
  const address = cluster?.ingressController?.address;
  if (!cluster || address === undefined) return undefined;
  const ip = /^\d+\.\d+\.\d+\.\d+$/.test(host) ? host : hostsAddress(shell, host);
  if (ip !== address) return undefined;
  if (port !== 80) return null;
  return { server: 'nginx', respond: (req) => ingressAnswer(cluster, req.host, req.method, req.path) };
}

/** 振り分けの番（curl を打つたびに 1 つ進む。判定の http の turns が替えて確かめる） */
export const LB_TURN = '__LB_TURN';

/** Web サーバの働き手（nginx の worker）の利用者。公開するファイルは、この利用者が読めなければ 403 */
export const WEB_USER = 'www-data';

const MIME: Record<string, string> = { html: 'text/html', css: 'text/css', js: 'application/javascript', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', txt: 'text/plain' };

/** 公開用のディレクトリ（root）から、道に当たるファイルを返す */
function fromRoot(shell: ShellState, root: string, index: readonly string[], path: string): Route {
  const p = (path.split('?')[0] ?? '/') || '/';
  const full = normalize(`${root}/${p}`);
  // 公開用のディレクトリの外には出ない（../ で上がっても root の中に留まる）
  if (full !== normalize(root) && !full.startsWith(`${normalize(root)}/`)) return { status: 403, body: pageOf(403) };
  if (!exists(shell.vfs, full)) return { status: 404, body: pageOf(404) };
  const groups = groupsOfUser(shell.vfs, WEB_USER);
  const readable = (f: string): boolean => allows(metaOf(shell.vfs, f), WEB_USER, 'read', groups);
  if (isDir(shell.vfs, full)) {
    if (!p.endsWith('/')) return { status: 301, body: pageOf(301), headers: { Location: `${p}/` } };
    const file = index.map((i) => normalize(`${full}/${i}`)).find((f) => exists(shell.vfs, f) && !isDir(shell.vfs, f));
    // 索引のファイルが無いディレクトリは、中を一覧しない（403）
    if (!file) return { status: 403, body: pageOf(403) };
    return readable(file) ? { status: 200, body: readFile(shell.vfs, file), headers: { 'Content-Type': 'text/html' } } : { status: 403, body: pageOf(403) };
  }
  if (!readable(full)) return { status: 403, body: pageOf(403) };
  const ext = /\.([a-z0-9]+)$/i.exec(full)?.[1]?.toLowerCase() ?? '';
  return { status: 200, body: readFile(shell.vfs, full), headers: { 'Content-Type': MIME[ext] ?? 'text/plain' } };
}

/** $host・$request_uri・$scheme を置き換える */
const expand = (text: string, req: LocalRequest): string =>
  text.replace(/\$host/g, req.host).replace(/\$request_uri/g, req.path).replace(/\$scheme/g, req.scheme).replace(/\$server_port/g, String(req.port));

/** 振り分け: 今の番の台へ送る。答えなければ次の台へ送り直す（本物の proxy_next_upstream の既定。off なら 502）。予備（backup）は他の全てが駄目な時だけ */
function balanced(loc: Location, u: Upstream, shell: ShellState, env: () => HttpEnv, req: LocalRequest): Route {
  const usable = u.servers.filter((x) => !x.down);
  const ring = usable.filter((x) => !x.backup).flatMap((x) => Array.from({ length: x.weight }, () => x.port));
  const reserve = usable.filter((x) => x.backup).map((x) => x.port);
  const turn = u.method === 'ip-hash' ? 0 : Number(shell.vars.get(LB_TURN) ?? 0);
  const start = ring.length === 0 ? 0 : turn % ring.length;
  const order = [...ring.slice(start), ...ring.slice(0, start), ...reserve];
  for (const port of loc.noRetry ? order.slice(0, 1) : order) {
    const back = env().local(port);
    if (back && !('reset' in back)) return back.respond({ ...req, scheme: 'http', port });
  }
  return { status: 502, body: pageOf(502) };
}

/** 設定を持つ Web サーバの答え（転送・中継・公開用のディレクトリ） */
function serveConfigured(shell: ShellState, env: () => HttpEnv, s: Service, servers: readonly ServerBlock[], req: LocalRequest): Route {
  const server = pickServer(servers, req.host, req.port);
  if (!server) return { status: 404, body: pageOf(404) };
  const p = req.path.split('?')[0] ?? '/';
  const loc: Location | undefined = [...server.locations].filter((l) => p.startsWith(l.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  const headers = loc && loc.headers.length > 0 ? loc.headers : server.headers;
  const withHeaders = (r: Route): Route => (r.status < 400 && headers.length > 0 ? { ...r, headers: { ...r.headers, ...Object.fromEntries(headers) } } : r);
  const ret = loc?.ret ?? (loc ? undefined : server.ret);
  if (ret) {
    const target = expand(ret.target, req);
    if (ret.status >= 300 && ret.status < 400) return withHeaders({ status: ret.status, body: pageOf(ret.status), headers: { Location: target } });
    return withHeaders({ status: ret.status, body: target === '' ? pageOf(ret.status) : target });
  }
  if (loc?.upstream) return withHeaders(balanced(loc, loc.upstream, shell, env, req));
  if (loc?.proxy !== undefined) {
    const up = parseUrl(loc.proxy);
    const back = up ? env().local(up.port) : null;
    // 後ろのアプリに届かない（待ち受けていない・ポートの誤り）
    if (!up || !back || 'reset' in back) return { status: 502, body: pageOf(502) };
    const rest = up.path !== '/' || /\/\/[^/]+\/$/.test(loc.proxy) ? `${up.path.replace(/\/$/, '')}/${p.slice(loc.prefix.length)}` : req.path;
    return withHeaders(back.respond({ ...req, scheme: 'http', port: up.port, path: rest }));
  }
  const root = loc?.root ?? server.root;
  if (root !== undefined) return withHeaders(fromRoot(shell, root, server.index, req.path));
  // 公開用のディレクトリを書いていない設定は、サービスの中身で答える
  return withHeaders(plainAnswer(s, req));
}

/** トークンで守る API の答え（web.a.03） */
function tokenAnswer(api: NonNullable<Service['tokenApi']>, s: Service, req: LocalRequest): Route {
  const json = { 'Content-Type': 'application/json' };
  const p = req.path.split('?')[0] ?? '/';
  if (p === '/token') {
    if (req.method !== 'POST') return { status: 405, body: '{"error":"method_not_allowed"}', headers: json };
    const secret = new URLSearchParams(req.data ?? '').get('client_secret');
    if (secret !== api.secret) return { status: 401, body: '{"error":"invalid_client"}', headers: json };
    return { status: 200, body: JSON.stringify({ access_token: api.token, token_type: 'Bearer', expires_in: 3600 }), headers: json };
  }
  const denied = (error: string): Route => ({ status: 401, body: `{"error":"${error}"}`, headers: { ...json, 'WWW-Authenticate': `Bearer error="${error === 'missing_token' ? 'invalid_request' : 'invalid_token'}"` } });
  if (req.authorization === undefined) return denied('missing_token');
  const token = /^Bearer\s+(\S+)$/.exec(req.authorization)?.[1];
  if (token === undefined) return denied('invalid_token');
  if (api.expired.includes(token)) return denied('token_expired');
  if (token !== api.token) return denied('invalid_token');
  return { status: 200, body: s.body ?? '{}', headers: json };
}

/** API の鍵を受ける側の答え: 読み込んだ一覧にある鍵だけを受ける（無い鍵は 401） */
function keyGuardAnswer(s: Service, req: LocalRequest): Route {
  const key = /^Bearer\s+(\S+)$/i.exec(req.authorization ?? '')?.[1];
  if (key !== undefined && (s.validKeys ?? []).includes(key)) return { status: 200, body: '{"status":"paid"}', headers: { 'Content-Type': 'application/json' } };
  return { status: 401, body: '{"error":"invalid api key"}', headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' } };
}

/** API の鍵で頼む側の答え: 読み込んだ鍵で、頼む先の API に頼む。断られると 502 */
function keyClientAnswer(s: Service, env: () => HttpEnv, req: LocalRequest): Route {
  const up = s.keyClient ? env().local(s.keyClient.upstream) : null;
  const json = { 'Content-Type': 'application/json' };
  if (!up || 'reset' in up) return { status: 502, body: '{"error":"payment unreachable"}', headers: json };
  const paid = up.respond({ ...req, scheme: 'http', port: s.keyClient?.upstream ?? 0, authorization: `Bearer ${s.heldKey ?? ''}` });
  if (paid.status !== 200) return { status: 502, body: `{"error":"payment refused: ${String(paid.status)}"}`, headers: json };
  return { status: 200, body: `{"order":"ok","key_tail":"${(s.heldKey ?? '').slice(-4)}"}`, headers: json };
}

/** 設定を持たないサービスの答え（ログインを覚えるアプリならセッション、routes があれば道ごと、無ければ / で中身） */
function plainAnswer(s: Service, req: LocalRequest, env?: () => HttpEnv): Route {
  if (s.tokenApi) return tokenAnswer(s.tokenApi, s, req);
  if (s.envCheck && s.envValue !== s.envCheck.want) return { status: 500, body: pageOf(500) };
  if (s.keyGuard) return keyGuardAnswer(s, req);
  if (s.keyClient && env) return keyClientAnswer(s, env, req);
  if (s.session && s.cookie) return sessionAnswer(s.session, s.cookie, req);
  if (s.routes) return routeFor(s.routes, req.method, req.path);
  const p = req.path.split('?')[0] ?? '/';
  return p === '/' || p === '/index.html' ? { status: s.status ?? 200, body: s.body ?? `<html><body>${s.name}</body></html>` } : { status: 404, body: pageOf(404) };
}

/** GitHub Actions で配る先のサーバ（Git のサーバの置き場の setup.actions.sites。今の版の中身で答える。src/engines/cicd） */
function deployedSites(shell: ShellState): Site[] {
  return [...(shell.gitServers?.values() ?? [])].flatMap((g) => {
    const setups = g.forge?.setup.actions?.sites ?? [];
    return setups.filter((s) => s.network === undefined || s.network === shell.vars.get('__RUNNER_NET')).flatMap((s) => {
      const state = g.forge?.sites?.find((x) => x.host === s.host);
      return state ? [siteOf(s, state)] : [];
    });
  });
}

/**
 * 手元（この機械）から見た HTTP の世界（src/engines/http の HttpEnv）。
 * localhost と自分の名前（と /etc/hosts で手元を指す名前）には、動いているサービス（systemctl）と、公開したコンテナのポート（docker run -p）が応える。
 * 設定ファイルを持つサービスは、設定から決まったポートで待ち受け、名前で server を選び、公開用のディレクトリ・転送・中継で答える（src/engines/kernel/webConfig.ts）。
 */
export function httpEnvOf(shell: ShellState): HttpEnv {
  const web = shell.web;
  const deployed = deployedSites(shell);
  const env: HttpEnv = {
    sites: [...(web?.sites ?? []), ...deployed],
    roots: web?.roots ?? (deployed.length > 0 ? [DEMO_ROOT] : []),
    today: web?.today ?? '2026-10-03',
    localNames: ['localhost', '127.0.0.1', ...(web?.hostname ? [web.hostname] : []), ...hostsLocalNames(shell)],
    remote: (host, port) => clusterRemote(shell, host, port),
    local: (port): LocalListener | null => {
      for (const s of shell.services?.services.values() ?? []) {
        if (s.active !== 'active') continue;
        const listen = s.listens?.find((l) => l.port === port);
        if (listen) {
          const servers = s.servers ?? [];
          return {
            server: s.name,
            ...(listen.ssl && listen.chain ? { chain: listen.chain } : {}),
            // 名前ごとに証明書を持つ server があれば、頼まれた名前（SNI）の server の物を送る（本物の nginx と同じく、合わなければ既定の server）
            ...(listen.ssl ? { chainFor: (host: string) => pickServer(servers, host, port)?.listens.find((x) => x.port === port && x.ssl)?.chain ?? listen.chain } : {}),
            respond: (req) => (servers.length > 0 ? serveConfigured(shell, () => env, s, servers, req) : plainAnswer(s, req)),
          };
        }
        if (!s.config && s.port === port) {
          const full = (): boolean => {
            const { capacity, used } = diskUse(shell);
            return s.diskGuard === true && used / capacity >= 0.99;
          };
          return { server: s.name, respond: (req) => (full() ? { status: 500, body: pageOf(500) } : plainAnswer(s, req, () => env)) };
        }
      }
      const served = servedAt(shell.containers, port, (p) => (exists(shell.vfs, p) && !isDir(shell.vfs, p) ? readFile(shell.vfs, p) : null));
      if (served) {
        const server = served.container.image.split(':')[0] ?? 'container';
        return { server, respond: (req) => ((req.path.split('?')[0] ?? '/') === '/' || req.path === '/index.html' ? { status: served.status, body: served.body } : { status: 404, body: pageOf(404) }) };
      }
      // ポートは公開したが、コンテナの中で待ち受けていない（-p 8080:8080 など）
      if (shell.containers && portOwner(shell.containers, port)) return { reset: true };
      return null;
    },
  };
  return env;
}

/* ---------- curl ---------- */

interface CurlArgs {
  url?: string;
  method?: string;
  data?: string;
  headers: string[];
  flags: Set<string>;
  out?: string;
  write?: string;
  version?: HttpVersion;
  /** -b: 送る札（名前=値 の形）か、札の入れ物のファイル */
  cookie?: string;
  /** -c: 終えた後に札を書き出すファイル */
  jar?: string;
  /** -D: 返事の頭を書き出すファイル（- なら標準出力） */
  dump?: string;
}

const WITH_VALUE: Record<string, keyof CurlArgs> = {
  X: 'method', '--request': 'method', d: 'data', '--data': 'data', '--data-raw': 'data', '--json': 'data', o: 'out', '--output': 'out', w: 'write', '--write-out': 'write',
  b: 'cookie', '--cookie': 'cookie', c: 'jar', '--cookie-jar': 'jar', D: 'dump', '--dump-header': 'dump', '--data-urlencode': 'data',
};
const LONG_FLAGS: Record<string, string> = { '--insecure': 'k', '--head': 'I', '--include': 'i', '--silent': 's', '--verbose': 'v', '--location': 'L', '--show-error': 'S', '--fail': 'f' };

function parseCurl(argv: readonly string[]): CurlArgs | string {
  const a: CurlArgs = { headers: [], flags: new Set() };
  const take = (key: keyof CurlArgs, value: string | undefined, name: string): string | null => {
    if (value === undefined) return `curl: option ${name}: requires parameter\n`;
    // -d を何度も書くと、& でつないで 1 つにして送る（本物と同じ）
    if (key === 'data') a.data = a.data === undefined ? value : `${a.data}&${value}`;
    else if (key === 'method' || key === 'out' || key === 'write' || key === 'cookie' || key === 'jar' || key === 'dump') a[key] = value;
    return null;
  };
  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i += 1) {
    const x = rest[i] ?? '';
    if (x === '-H' || x === '--header') {
      const v = rest[(i += 1)];
      if (v === undefined) return `curl: option ${x}: requires parameter\n`;
      a.headers.push(v);
    } else if (x === '--http1.1') a.version = '1.1';
    else if (x === '--http2') a.version = '2';
    else if (x === '--http3') a.version = '3';
    else if (x in LONG_FLAGS) a.flags.add(LONG_FLAGS[x] ?? '');
    else if (x.startsWith('--')) {
      const key = WITH_VALUE[x];
      if (!key) return `curl: option ${x}: is unknown\ncurl: try 'curl --help' for more information\n`;
      const err = take(key, rest[(i += 1)], x);
      if (err) return err;
      if (x === '--json') a.headers.push('Content-Type: application/json');
    } else if (/^-[a-zA-Z]/.test(x)) {
      for (let j = 1; j < x.length; j += 1) {
        const ch = x[j] ?? '';
        const key = WITH_VALUE[ch];
        if (ch === 'H') {
          const inline = x.slice(j + 1);
          const v = inline !== '' ? inline : rest[(i += 1)];
          if (v === undefined) return 'curl: option -H: requires parameter\n';
          a.headers.push(v);
          break;
        }
        if (key) {
          const inline = x.slice(j + 1);
          const err = take(key, inline !== '' ? inline : rest[(i += 1)], `-${ch}`);
          if (err) return err;
          break;
        }
        a.flags.add(ch);
      }
    } else a.url ??= x;
  }
  return a;
}

/** -w の書式（%{http_code} など） */
function writeOut(fmt: string, o: Extract<HttpOutcome, { ok: true }>, sites: readonly Site[]): string {
  const r = o.response;
  const t = sites.find((s) => s.host === o.url.host)?.timing ?? { dns: 0.004, connect: 0.003, tls: 0, wait: 0.012, transfer: 0.001 };
  // time_ は本物と同じく、頼み始めからの累計（TLS の無い頼みの appconnect は 0）
  const connect = t.dns + t.connect;
  const app = t.tls > 0 ? connect + t.tls : 0;
  const start = connect + t.tls + t.wait;
  const sec = (n: number): string => n.toFixed(6);
  return fmt
    .replace(/%\{time_namelookup\}/g, sec(t.dns))
    .replace(/%\{time_connect\}/g, sec(connect))
    .replace(/%\{time_appconnect\}/g, sec(app))
    .replace(/%\{time_pretransfer\}/g, sec(connect + t.tls))
    .replace(/%\{time_starttransfer\}/g, sec(start))
    .replace(/%\{time_total\}/g, sec(start + t.transfer))
    .replace(/%\{size_download\}/g, String(t.size ?? r.body.length))
    .replace(/%\{http_code\}|%\{response_code\}/g, String(r.status).padStart(3, '0'))
    .replace(/%\{http_version\}/g, r.version)
    .replace(/%\{content_type\}/g, r.headers['Content-Type'] ?? '')
    .replace(/%\{redirect_url\}/g, r.status >= 300 && r.status < 400 ? (r.headers['Location'] ?? '') : '')
    .replace(/%\{url_effective\}/g, `${o.url.scheme}://${o.url.host}${o.url.path}`)
    .replace(/\\n/g, '\n');
}

/** 返事の頭（状態の行と見出し）。HTTP/2 と 3 は理由の語を書かず、見出しの名前を小文字にする（本物の curl と同じ） */
function headOf(o: Extract<HttpOutcome, { ok: true }>): string {
  const r = o.response;
  const h2 = r.version !== '1.1';
  const status = h2 ? `HTTP/${r.version} ${String(r.status)}` : `HTTP/1.1 ${String(r.status)} ${r.reason}`;
  return [status, ...Object.entries(r.headers).map(([k, v]) => `${h2 ? k.toLowerCase() : k}: ${v}`), ''].join('\n');
}

/** 転送先の URL（Location が / で始まれば、同じサイトの中） */
function nextUrl(o: Extract<HttpOutcome, { ok: true }>): string | null {
  const loc = o.response.headers['Location'];
  if (loc === undefined) return null;
  if (/^https?:\/\//.test(loc)) return loc;
  return `${o.url.scheme}://${o.url.host}${(o.url.scheme === 'https' && o.url.port === 443) || (o.url.scheme === 'http' && o.url.port === 80) ? '' : `:${String(o.url.port)}`}${loc.startsWith('/') ? loc : `/${loc}`}`;
}

/** 札の入れ物のファイルの場所（今いる場所から） */
const fileOf = (shell: ShellState, f: string): string => normalize(f.startsWith('/') ? f : `${shell.cwd}/${f}`);

/** ネットワークの構成を使わない実戦の curl（-X・-d・-H・-I・-i・-s・-v・-k・-L・-o・-w・-b・-c・--http1.1・--http2・--http3） */
export function localCurl(argv: readonly string[], shell: ShellState): CommandResult {
  const a = parseCurl(argv);
  if (typeof a === 'string') return { stderr: a, code: 2 };
  if (!a.url) return { stderr: "curl: try 'curl --help' for more information\n", code: 2 };
  const env = httpEnvOf(shell);
  const method = a.flags.has('I') ? 'HEAD' : a.method;
  let url = a.url;
  let sites = env.sites;
  let stdout = '';
  const verbose: string[] = [];
  let last: Extract<HttpOutcome, { ok: true }> | null = null;
  // 付いていく転送の数の上限（本物の curl の --max-redirs の既定と同じ 50）
  const MAX_REDIRS = 50;
  // 札（Cookie）: -b に = があれば、そのまま送る札。無ければ入れ物のファイル（無いファイルは本物と同じく黙って空とみなす）。
  // -b か -c を書くと札を覚える働きが動き、受け取った札を次の転送でも使う
  const engine = a.cookie !== undefined || a.jar !== undefined;
  const typed = [...(a.cookie?.includes('=') ? [a.cookie] : []), ...a.headers.flatMap((h) => /^cookie:\s*(.*)$/i.exec(h)?.[1] ?? [])].join('; ');
  const jarFile = a.cookie !== undefined && !a.cookie.includes('=') ? fileOf(shell, a.cookie) : null;
  let jar: Cookie[] = jarFile && exists(shell.vfs, jarFile) && !isDir(shell.vfs, jarFile) ? parseJar(readFile(shell.vfs, jarFile)) : [];
  let dumped = '';
  const authorization = a.headers.map((h) => /^authorization:\s*(.*)$/i.exec(h)?.[1]).find((h) => h !== undefined);
  for (let hop = 0; ; hop += 1) {
    // -H 'Host: 名前' は、届け先（URL の名前か住所）を変えずに、名乗る名前だけを変える
    const hostHeader = a.headers.map((h) => /^host:\s*(\S+)/i.exec(h)?.[1]).find((h) => h !== undefined)?.toLowerCase();
    const target = parseUrl(url);
    const fromJar = target ? cookieHeader(jar, target.scheme, target.host, target.path) : '';
    const cookie = [typed, fromJar].filter((c) => c !== '').join('; ');
    const out = request({ ...env, sites }, url, { insecure: a.flags.has('k'), ...(method !== undefined ? { method } : {}), ...(a.data !== undefined ? { data: a.data } : {}), ...(a.version ? { version: a.version } : {}), ...(hostHeader !== undefined && hop === 0 ? { host: hostHeader } : {}), ...(cookie !== '' ? { cookie } : {}), ...(authorization !== undefined ? { authorization } : {}) });
    if (out.url && a.flags.has('v')) verbose.push(`* Trying ${out.url.host}:${String(out.url.port)}...`);
    if (!out.ok) {
      const e = curlError(out.error, out.url?.host ?? '');
      const patch = sites !== env.sites && shell.web ? { patch: { web: { ...shell.web, sites } } } : {};
      return { stdout, stderr: `${verbose.map((l) => `${l}\n`).join('')}curl: (${String(e.code)}) ${e.message}\n`, code: e.code, ...patch };
    }
    if (out.sites) sites = out.sites;
    last = out;
    const r = out.response;
    if (a.flags.has('v')) {
      verbose.push(`* Connected to ${out.url.host} port ${String(out.url.port)}`);
      if (out.tls?.trusted) verbose.push(`* SSL certificate verify ok.`, ...out.tls.path.map((c, i) => `*  ${i === 0 ? 'subject' : 'issuer'}: CN=${c.subject}`));
      if (r.version !== '1.1') verbose.push(`* using HTTP/${r.version}`);
      verbose.push(`> ${method ?? (a.data !== undefined ? 'POST' : 'GET')} ${out.url.path} HTTP/${r.version}`, ...(hostHeader === undefined ? [`> Host: ${out.url.host}`] : []), ...a.headers.map((h) => `> ${h}`), ...(fromJar !== '' || (a.cookie?.includes('=') ?? false) ? [`> Cookie: ${cookie}`] : []), '>', ...headOf(out).trimEnd().split('\n').map((l) => `< ${l}`), '<');
    }
    const set = r.headers['Set-Cookie'];
    const got = engine && set !== undefined ? parseSetCookie(set, out.url.host, out.url.path) : null;
    // Secure の札は、暗号化していない頼みからは受け取らない（手元を指す名前は除く。本物の curl と同じ）
    if (got && (!got.secure || out.url.scheme === 'https' || env.localNames.includes(out.url.host))) {
      jar = addCookie(jar, got);
      if (a.flags.has('v')) verbose.push(`* Added cookie ${got.name}="${got.value}" for domain ${got.domain}, path ${got.path}, expire 0`);
    }
    const follow = a.flags.has('L') && r.status >= 300 && r.status < 400 ? nextUrl(out) : null;
    if (a.flags.has('I') || a.flags.has('i') || a.dump === '-') stdout += `${headOf(out)}\n`;
    else if (a.dump !== undefined) dumped += `${headOf(out)}\n`;
    if (follow) {
      if (hop >= MAX_REDIRS) return { stdout, stderr: `${verbose.map((l) => `${l}\n`).join('')}curl: (47) Maximum (${String(MAX_REDIRS)}) redirects followed\n`, code: 47 };
      url = follow;
      continue;
    }
    break;
  }
  if (!last) return { stderr: "curl: try 'curl --help' for more information\n", code: 2 };
  const r = last.response;
  let vfs = shell.vfs;
  if (dumped !== '' && a.dump !== undefined && a.dump !== '/dev/null') vfs = writeFile(vfs, fileOf(shell, a.dump), dumped);
  if (!a.flags.has('I') && r.body !== '') {
    const body = r.body.endsWith('\n') ? r.body : `${r.body}\n`;
    if (a.out === undefined || a.out === '-') stdout += body;
    else if (a.out !== '/dev/null') vfs = writeFile(vfs, normalize(a.out.startsWith('/') ? a.out : `${shell.cwd}/${a.out}`), r.body);
  }
  if (a.write !== undefined) stdout += writeOut(a.write, last, sites);
  if (a.jar !== undefined && jar.length > 0) {
    if (a.jar === '-') stdout += jarText(jar);
    else vfs = writeFile(vfs, fileOf(shell, a.jar), jarText(jar));
  }
  const failed = a.flags.has('f') && r.status >= 400;
  const balancing = [...(shell.services?.services.values() ?? [])].some((s) => s.active === 'active' && s.servers?.some((b) => b.locations.some((l) => l.upstream)));
  const patch = { ...(sites !== env.sites && shell.web ? { web: { ...shell.web, sites } } : {}), ...(vfs !== shell.vfs ? { vfs } : {}), ...(balancing ? { vars: new Map([...shell.vars, [LB_TURN, String(Number(shell.vars.get(LB_TURN) ?? 0) + 1)]]) } : {}) };
  return {
    stdout: failed ? '' : stdout,
    ...(failed ? { stderr: `curl: (22) The requested URL returned error: ${String(r.status)}\n`, code: 22 } : {}),
    ...(verbose.length ? { stderr: `${verbose.join('\n')}\n${failed ? `curl: (22) The requested URL returned error: ${String(r.status)}\n` : ''}` } : {}),
    ...(Object.keys(patch).length ? { patch } : {}),
  };
}
