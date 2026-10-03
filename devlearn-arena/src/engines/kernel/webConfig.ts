import type { Cert } from '@/engines/tls/tls';

/**
 * Web サーバ（nginx 風）の設定ファイルと、証明書のファイルを読む。純粋な関数。
 * ミッション（docs/game-design.md 8 章）の「ポートを開け」「証明書の連鎖を正しく組み」「障害原因を特定せよ」が使う。
 *
 * - 文は 1 行に 1 つ。`;` で終わる（ブロックの `{` `}` を除く）。終わっていなければ起動に失敗する（本物と同じ言い方）
 * - `listen 80;` `listen 443 ssl;` で待ち受けるポート。書かなければ 80
 * - `ssl_certificate <場所>;` で送る証明書（葉 → 中間の順に並べたファイル）
 * - 設定は起動の時に読む。書き換えても、動かし直すまで反映しない（本物と同じ）
 */

export interface Listen {
  port: number;
  ssl: boolean;
  /** ssl の時に送る証明書（葉 → 中間） */
  chain?: readonly Cert[];
}

export type ConfigResult = { ok: true; listens: Listen[] } | { ok: false; error: string };

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

/** 設定ファイルを読む。read は場所からファイルの中身（無ければ null） */
export function readWebConfig(path: string, read: (p: string) => string | null): ConfigResult {
  const text = read(path);
  if (text === null) return { ok: false, error: emerg(`open() "${path}" failed (2: No such file or directory)`) };
  const listens: { port: number; ssl: boolean; line: number }[] = [];
  let certPath: string | null = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').replace(/#.*$/, '').trim();
    if (line === '' || line === '}' || line.endsWith('{')) continue;
    const word = line.split(/\s+/)[0] ?? '';
    if (!line.endsWith(';')) return { ok: false, error: emerg(`directive "${word}" is not terminated by ";" in ${path}:${String(i + 1)}`) };
    const args = line.slice(0, -1).trim().split(/\s+/).slice(1);
    if (word === 'listen') {
      const port = Number(args[0]);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) return { ok: false, error: emerg(`invalid port in "${args[0] ?? ''}" of the "listen" directive in ${path}:${String(i + 1)}`) };
      listens.push({ port, ssl: args.includes('ssl'), line: i + 1 });
    } else if (word === 'ssl_certificate') {
      certPath = args[0] ?? null;
    }
  }
  if (listens.length === 0) return { ok: true, listens: [{ port: 80, ssl: false }] };
  const ssl = listens.find((l) => l.ssl);
  if (!ssl) return { ok: true, listens: listens.map((l) => ({ port: l.port, ssl: false })) };
  if (certPath === null) return { ok: false, error: emerg(`no "ssl_certificate" is defined for the "listen ... ssl" directive in ${path}:${String(ssl.line)}`) };
  const pem = read(certPath);
  if (pem === null) return { ok: false, error: emerg(`cannot load certificate "${certPath}": BIO_new_file() failed (SSL: error:80000002:system library::No such file or directory)`) };
  const chain = parseCerts(pem);
  if (chain.length === 0) return { ok: false, error: emerg(`cannot load certificate "${certPath}": PEM_read_bio_X509_AUX() failed (SSL: error:0480006C:PEM routines::no start line)`) };
  return { ok: true, listens: listens.map((l) => (l.ssl ? { port: l.port, ssl: true, chain } : { port: l.port, ssl: false })) };
}
