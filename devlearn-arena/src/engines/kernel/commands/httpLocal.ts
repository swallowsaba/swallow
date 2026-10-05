import { portOwner, servedAt } from '@/engines/container/container';
import { curlError, pageOf, parseUrl, request, routeFor, type HttpEnv, type HttpOutcome, type HttpVersion, type LocalListener, type LocalRequest, type Route } from '@/engines/http/http';
import { normalize } from '../path';
import { allows } from '../perm';
import type { CommandResult, ShellState } from '../registry';
import type { Service } from '../services';
import { groupsOfUser } from '../users';
import { exists, isDir, metaOf, readFile, writeFile } from '../vfs';
import { pickServer, type Location, type ServerBlock } from '../webConfig';

/** /etc/hosts で手元（127.0.0.1・::1）を指す名前 */
function hostsLocalNames(shell: ShellState): string[] {
  const path = '/etc/hosts';
  if (!exists(shell.vfs, path) || isDir(shell.vfs, path)) return [];
  return readFile(shell.vfs, path).split('\n').flatMap((line) => {
    const [addr, ...names] = line.replace(/#.*$/, '').trim().split(/\s+/);
    return addr === '127.0.0.1' || addr === '::1' ? names.map((n) => n.toLowerCase()) : [];
  });
}

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

/** 設定を持たないサービスの答え（routes があれば道ごと、無ければ / で中身） */
function plainAnswer(s: Service, req: LocalRequest): Route {
  if (s.routes) return routeFor(s.routes, req.method, req.path);
  const p = req.path.split('?')[0] ?? '/';
  return p === '/' || p === '/index.html' ? { status: s.status ?? 200, body: s.body ?? `<html><body>${s.name}</body></html>` } : { status: 404, body: pageOf(404) };
}

/**
 * 手元（この機械）から見た HTTP の世界（src/engines/http の HttpEnv）。
 * localhost と自分の名前（と /etc/hosts で手元を指す名前）には、動いているサービス（systemctl）と、公開したコンテナのポート（docker run -p）が応える。
 * 設定ファイルを持つサービスは、設定から決まったポートで待ち受け、名前で server を選び、公開用のディレクトリ・転送・中継で答える（src/engines/kernel/webConfig.ts）。
 */
export function httpEnvOf(shell: ShellState): HttpEnv {
  const web = shell.web;
  const env: HttpEnv = {
    sites: web?.sites ?? [],
    roots: web?.roots ?? [],
    today: web?.today ?? '2026-10-03',
    localNames: ['localhost', '127.0.0.1', ...(web?.hostname ? [web.hostname] : []), ...hostsLocalNames(shell)],
    local: (port): LocalListener | null => {
      for (const s of shell.services?.services.values() ?? []) {
        if (s.active !== 'active') continue;
        const listen = s.listens?.find((l) => l.port === port);
        if (listen) {
          const servers = s.servers ?? [];
          return {
            server: s.name,
            ...(listen.ssl && listen.chain ? { chain: listen.chain } : {}),
            respond: (req) => (servers.length > 0 ? serveConfigured(shell, () => env, s, servers, req) : plainAnswer(s, req)),
          };
        }
        if (!s.config && s.port === port) return { server: s.name, respond: (req) => plainAnswer(s, req) };
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
}

const WITH_VALUE: Record<string, keyof CurlArgs> = {
  X: 'method', '--request': 'method', d: 'data', '--data': 'data', '--data-raw': 'data', '--json': 'data', o: 'out', '--output': 'out', w: 'write', '--write-out': 'write',
};
const LONG_FLAGS: Record<string, string> = { '--insecure': 'k', '--head': 'I', '--include': 'i', '--silent': 's', '--verbose': 'v', '--location': 'L', '--show-error': 'S', '--fail': 'f' };

function parseCurl(argv: readonly string[]): CurlArgs | string {
  const a: CurlArgs = { headers: [], flags: new Set() };
  const take = (key: keyof CurlArgs, value: string | undefined, name: string): string | null => {
    if (value === undefined) return `curl: option ${name}: requires parameter\n`;
    if (key === 'method' || key === 'data' || key === 'out' || key === 'write') a[key] = value;
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
function writeOut(fmt: string, o: Extract<HttpOutcome, { ok: true }>): string {
  const r = o.response;
  return fmt
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

/** ネットワークの構成を使わない実戦の curl（-X・-d・-H・-I・-i・-s・-v・-k・-L・-o・-w・--http1.1・--http2・--http3） */
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
  for (let hop = 0; ; hop += 1) {
    const out = request({ ...env, sites }, url, { insecure: a.flags.has('k'), ...(method !== undefined ? { method } : {}), ...(a.data !== undefined ? { data: a.data } : {}), ...(a.version ? { version: a.version } : {}) });
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
      verbose.push(`> ${method ?? (a.data !== undefined ? 'POST' : 'GET')} ${out.url.path} HTTP/${r.version}`, `> Host: ${out.url.host}`, ...a.headers.map((h) => `> ${h}`), '>', ...headOf(out).trimEnd().split('\n').map((l) => `< ${l}`), '<');
    }
    const follow = a.flags.has('L') && r.status >= 300 && r.status < 400 ? nextUrl(out) : null;
    if (a.flags.has('I') || a.flags.has('i')) stdout += `${headOf(out)}\n`;
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
  if (!a.flags.has('I') && r.body !== '') {
    const body = r.body.endsWith('\n') ? r.body : `${r.body}\n`;
    if (a.out === undefined || a.out === '-') stdout += body;
    else if (a.out !== '/dev/null') vfs = writeFile(vfs, normalize(a.out.startsWith('/') ? a.out : `${shell.cwd}/${a.out}`), r.body);
  }
  if (a.write !== undefined) stdout += writeOut(a.write, last);
  const failed = a.flags.has('f') && r.status >= 400;
  const patch = { ...(sites !== env.sites && shell.web ? { web: { ...shell.web, sites } } : {}), ...(vfs !== shell.vfs ? { vfs } : {}) };
  return {
    stdout: failed ? '' : stdout,
    ...(failed ? { stderr: `curl: (22) The requested URL returned error: ${String(r.status)}\n`, code: 22 } : {}),
    ...(verbose.length ? { stderr: `${verbose.join('\n')}\n${failed ? `curl: (22) The requested URL returned error: ${String(r.status)}\n` : ''}` } : {}),
    ...(Object.keys(patch).length ? { patch } : {}),
  };
}
