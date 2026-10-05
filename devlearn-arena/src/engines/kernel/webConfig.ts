import type { Cert } from '@/engines/tls/tls';

/**
 * Web サーバ（nginx 風）の設定ファイルと、証明書のファイルを読む。純粋な関数。
 * ミッション（docs/game-design.md 8 章）と web の実戦（docs/lessons/web.md）が使う。
 *
 * - 文は `;` で終わる（ブロックの `{` `}` を除く）。終わっていなければ起動に失敗する（本物と同じ言い方）
 * - `server { … }` が 1 つのサイト。`listen 80;` `listen 443 ssl;` で待ち受けるポート（書かなければ 80）、
 *   `server_name` で受け持つ名前（頼まれた名前で振り分ける。合わなければ、そのポートの最初の server か default_server）
 * - `root` と `index` で公開用のディレクトリの中のファイルを返す。`return 301 <先>;` で転送（$host・$request_uri を置き換える）、
 *   `location <前方一致> { … }` の中の `proxy_pass http://<アドレス>:<ポート>;` で後ろのアプリへ中継する。`add_header 名前 値;` で見出しを足す
 * - `ssl_certificate <場所>;` で送る証明書（葉 → 中間の順に並べたファイル）
 * - 知らない文は起動に失敗する（綴りの誤りに気づける）
 * - 設定は起動の時に読む。書き換えても、動かし直すか読み直すまで反映しない（本物と同じ）
 */

export interface Listen {
  port: number;
  ssl: boolean;
  /** ssl の時に送る証明書（葉 → 中間） */
  chain?: readonly Cert[];
}

/** 転送（return） */
export interface Return {
  status: number;
  /** 転送先（$host・$request_uri を含んでよい）。3xx 以外では本文 */
  target: string;
}

export interface Location {
  /** 前方一致で比べる道（/api/ など） */
  prefix: string;
  root?: string;
  ret?: Return;
  /** 中継先（http://127.0.0.1:3000 など） */
  proxy?: string;
  headers: readonly (readonly [string, string])[];
}

export interface ServerBlock {
  listens: readonly Listen[];
  /** server_name。空なら名前を問わない */
  names: readonly string[];
  /** listen に default_server を付けたポート */
  defaults: readonly number[];
  root?: string;
  index: readonly string[];
  ret?: Return;
  headers: readonly (readonly [string, string])[];
  locations: readonly Location[];
}

export type ConfigResult = { ok: true; listens: Listen[]; servers: ServerBlock[] } | { ok: false; error: string };

const BEGIN = '-----BEGIN CERTIFICATE-----';
const END = '-----END CERTIFICATE-----';

/**
 * 証明書のファイル（PEM 風）を読む。1 枚は BEGIN と END の間に「項目: 値」の行を書いたもの:
 *   subject: city.example / issuer: Minato Issuing CA / names: city.example（CA なら書かない）/ valid: 2026-01-01 2027-01-01 / ca: yes
 */
export function parseCerts(text: string): Cert[] {
  const out: Cert[] = [];
  let cur: Record<string, string> | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === BEGIN) cur = {};
    else if (line === END && cur) {
      const subject = cur['subject'];
      const issuer = cur['issuer'];
      const [notBefore, notAfter] = (cur['valid'] ?? '').split(/\s+/);
      if (subject && issuer && notBefore && notAfter) {
        out.push({
          id: `${subject}#${String(out.length)}`,
          subject,
          issuer,
          sans: (cur['names'] ?? '').split(/[\s,]+/).filter(Boolean),
          notBefore,
          notAfter,
          ca: cur['ca'] === 'yes',
        });
      }
      cur = null;
    } else if (cur) {
      const m = /^([a-z]+):\s*(.*)$/.exec(line);
      if (m?.[1]) cur[m[1]] = m[2] ?? '';
    }
  }
  return out;
}

/** 証明書を PEM 風の文に書く（setup で置くファイルを作る時と、テストで使う） */
export function certText(c: Cert): string {
  return [
    BEGIN,
    `subject: ${c.subject}`,
    `issuer: ${c.issuer}`,
    ...(c.sans.length ? [`names: ${c.sans.join(' ')}`] : []),
    `valid: ${c.notBefore} ${c.notAfter}`,
    ...(c.ca ? ['ca: yes'] : []),
    END,
    '',
  ].join('\n');
}

const emerg = (text: string): string => `nginx: [emerg] ${text}`;

/** 設定の語。`{` `}` `;` は 1 つの語、"…" と '…' は 1 つの語（引用符を外す） */
interface Token { text: string; line: number; quoted: boolean }

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  text.split('\n').forEach((s, i) => {
    const line = i + 1;
    for (let k = 0; k < s.length;) {
      const ch = s[k] ?? '';
      if (ch === '#') break;
      if (/\s/.test(ch)) { k += 1; continue; }
      if (ch === '{' || ch === '}' || ch === ';') { out.push({ text: ch, line, quoted: false }); k += 1; continue; }
      if (ch === '"' || ch === "'") {
        const end = s.indexOf(ch, k + 1);
        const word = end < 0 ? s.slice(k + 1) : s.slice(k + 1, end);
        out.push({ text: word, line, quoted: true });
        k = end < 0 ? s.length : end + 1;
        continue;
      }
      let e = k;
      while (e < s.length && !/[\s{};#]/.test(s[e] ?? '')) e += 1;
      out.push({ text: s.slice(k, e), line, quoted: false });
      k = e;
    }
  });
  return out;
}

/** 読んだ文（名前・引数・行）と、ブロックなら中身 */
interface Directive { name: string; args: string[]; line: number; block?: Directive[] }

const KNOWN = new Set([
  'http', 'events', 'server', 'location', 'listen', 'server_name', 'root', 'index', 'return', 'proxy_pass', 'proxy_set_header',
  'add_header', 'ssl_certificate', 'ssl_certificate_key', 'ssl_protocols', 'include', 'error_page', 'try_files', 'access_log', 'error_log',
  'worker_processes', 'worker_connections', 'user', 'gzip', 'expires', 'charset', 'sendfile', 'keepalive_timeout', 'default_type', 'http2',
]);

/** 語の並びを文の木にする。誤りは本物と同じ言い方で返す */
function parse(tokens: Token[], path: string): Directive[] | string {
  let i = 0;
  const level = (inner: boolean): Directive[] | string => {
    const out: Directive[] = [];
    while (i < tokens.length) {
      const head = tokens[i];
      if (!head) break;
      if (head.text === '}' && !head.quoted) {
        if (!inner) return emerg(`unexpected "}" in ${path}:${String(head.line)}`);
        i += 1;
        return out;
      }
      if ((head.text === ';' || head.text === '{') && !head.quoted) return emerg(`unexpected "${head.text}" in ${path}:${String(head.line)}`);
      const args: string[] = [];
      let block: Directive[] | undefined;
      i += 1;
      for (;;) {
        const t = tokens[i];
        if (!t || (!t.quoted && t.text === '}')) return emerg(`directive "${head.text}" is not terminated by ";" in ${path}:${String(head.line)}`);
        if (!t.quoted && t.text === ';') { i += 1; break; }
        if (!t.quoted && t.text === '{') {
          i += 1;
          const inside = level(true);
          if (typeof inside === 'string') return inside;
          block = inside;
          break;
        }
        // 次の行の文の頭まで来た（; の書き忘れ）
        if (t.line !== head.line && args.length > 0 && KNOWN.has(t.text) && !t.quoted) return emerg(`directive "${head.text}" is not terminated by ";" in ${path}:${String(head.line)}`);
        args.push(t.text);
        i += 1;
      }
      if (!KNOWN.has(head.text)) return emerg(`unknown directive "${head.text}" in ${path}:${String(head.line)}`);
      out.push({ name: head.text, args, line: head.line, ...(block ? { block } : {}) });
    }
    if (inner) return emerg(`unexpected end of file, expecting "}" in ${path}:${String(tokens[tokens.length - 1]?.line ?? 1)}`);
    return out;
  };
  return level(false);
}

function readReturn(d: Directive, path: string): Return | string {
  const [code, target = ''] = d.args;
  const status = Number(code);
  if (!Number.isInteger(status) || status < 100 || status > 599) return emerg(`invalid return code "${code ?? ''}" in ${path}:${String(d.line)}`);
  return { status, target };
}

/** 設定ファイルを読む。read は場所からファイルの中身（無ければ null） */
export function readWebConfig(path: string, read: (p: string) => string | null): ConfigResult {
  const text = read(path);
  if (text === null) return { ok: false, error: emerg(`open() "${path}" failed (2: No such file or directory)`) };
  const tree = parse(tokenize(text), path);
  if (typeof tree === 'string') return { ok: false, error: tree };
  // http { … } の中も同じに読む。server の外に書いた文は、1 つの server として扱う
  const flat = tree.flatMap((d) => (d.name === 'http' ? d.block ?? [] : [d]));
  const serverDirs = flat.filter((d) => d.name === 'server');
  const loose = flat.filter((d) => d.name !== 'server' && d.name !== 'events');
  const groups = serverDirs.length > 0 ? serverDirs.map((d) => d.block ?? []) : [loose];
  const servers: ServerBlock[] = [];
  for (const body of groups) {
    const listens: { port: number; ssl: boolean; line: number; def: boolean }[] = [];
    const s: { names: string[]; root?: string; index: string[]; ret?: Return; headers: [string, string][]; locations: Location[]; cert: string | null } = {
      names: [], index: ['index.html'], headers: [], locations: [], cert: null,
    };
    for (const d of body) {
      if (d.name === 'listen') {
        const port = Number((d.args[0] ?? '').split(':').pop());
        if (!Number.isInteger(port) || port <= 0 || port > 65535) return { ok: false, error: emerg(`invalid port in "${d.args[0] ?? ''}" of the "listen" directive in ${path}:${String(d.line)}`) };
        listens.push({ port, ssl: d.args.includes('ssl'), line: d.line, def: d.args.includes('default_server') });
      } else if (d.name === 'server_name') s.names.push(...d.args.map((n) => n.toLowerCase()));
      else if (d.name === 'root') s.root = d.args[0];
      else if (d.name === 'index') s.index = d.args;
      else if (d.name === 'add_header') s.headers.push([d.args[0] ?? '', d.args[1] ?? '']);
      else if (d.name === 'ssl_certificate') s.cert = d.args[0] ?? null;
      else if (d.name === 'return') {
        const r = readReturn(d, path);
        if (typeof r === 'string') return { ok: false, error: r };
        s.ret = r;
      } else if (d.name === 'location') {
        const prefix = d.args[d.args.length - 1] ?? '/';
        const loc: { prefix: string; root?: string; ret?: Return; proxy?: string; headers: [string, string][] } = { prefix, headers: [] };
        for (const x of d.block ?? []) {
          if (x.name === 'root') loc.root = x.args[0];
          else if (x.name === 'proxy_pass') loc.proxy = x.args[0];
          else if (x.name === 'add_header') loc.headers.push([x.args[0] ?? '', x.args[1] ?? '']);
          else if (x.name === 'return') {
            const r = readReturn(x, path);
            if (typeof r === 'string') return { ok: false, error: r };
            loc.ret = r;
          }
        }
        if (loc.proxy !== undefined && !/^https?:\/\/[^/]+/.test(loc.proxy)) return { ok: false, error: emerg(`invalid URL prefix in "${loc.proxy}" in ${path}:${String(d.line)}`) };
        s.locations.push(loc);
      }
    }
    if (listens.length === 0) listens.push({ port: 80, ssl: false, line: 0, def: false });
    const ssl = listens.find((l) => l.ssl);
    let chain: Cert[] | undefined;
    if (ssl) {
      if (s.cert === null) return { ok: false, error: emerg(`no "ssl_certificate" is defined for the "listen ... ssl" directive in ${path}:${String(ssl.line)}`) };
      const pem = read(s.cert);
      if (pem === null) return { ok: false, error: emerg(`cannot load certificate "${s.cert}": BIO_new_file() failed (SSL: error:80000002:system library::No such file or directory)`) };
      chain = parseCerts(pem);
      if (chain.length === 0) return { ok: false, error: emerg(`cannot load certificate "${s.cert}": PEM_read_bio_X509_AUX() failed (SSL: error:0480006C:PEM routines::no start line)`) };
    }
    servers.push({
      listens: listens.map((l) => (l.ssl && chain ? { port: l.port, ssl: true, chain } : { port: l.port, ssl: false })),
      names: s.names,
      defaults: listens.filter((l) => l.def).map((l) => l.port),
      ...(s.root !== undefined ? { root: s.root } : {}),
      index: s.index,
      ...(s.ret ? { ret: s.ret } : {}),
      headers: s.headers,
      locations: s.locations,
    });
  }
  // 同じポートの待ち受けは 1 つにまとめる（ssl のポートは、最初に証明書を持った server の物）
  const listens: Listen[] = [];
  for (const l of servers.flatMap((x) => x.listens)) if (!listens.some((o) => o.port === l.port)) listens.push(l);
  return { ok: true, listens, servers };
}

/** 頼まれた名前とポートに当たる server（server_name が合う物、無ければ default_server、それも無ければ最初の物） */
export function pickServer(servers: readonly ServerBlock[], host: string, port: number): ServerBlock | undefined {
  const onPort = servers.filter((s) => s.listens.some((l) => l.port === port));
  const h = host.toLowerCase();
  return onPort.find((s) => s.names.some((n) => n === h || (n.startsWith('*.') && h.endsWith(n.slice(1)))))
    ?? onPort.find((s) => s.defaults.includes(port))
    ?? onPort[0];
}
