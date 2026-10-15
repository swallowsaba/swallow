import { peerChain } from '@/engines/http/http';
import { verify, type Cert, type TlsVerdict } from '@/engines/tls/tls';
import { resolve } from '../path';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { parseCerts } from '../webConfig';
import { readFile, stat } from '../vfs';
import { denied } from './perm';
import { httpEnvOf } from './httpLocal';

/**
 * 証明書を読む・TLS の相手が送る証明書を見る（openssl x509・openssl s_client）。sec.b.07（証明書と認証局）の実戦が使う。
 * 証明書のファイルは練習の形（src/engines/kernel/webConfig.ts の parseCerts）で持ち、出し方は本物の OpenSSL 3 に寄せる。
 * 対応: x509 -in ファイル -noout [-subject] [-issuer] [-dates] [-ext subjectAltName]（-in が無ければ標準入力）・
 * s_client -connect 名前:ポート [-servername 名前] [-showcerts]（握手の後、標準入力が無いので、そのまま終える）
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-01-01 → Jan  1 00:00:00 2026 GMT（OpenSSL の日付の形） */
export function opensslDate(day: string): string {
  const [y = '', m = '1', d = '1'] = day.split('-');
  return `${MONTHS[Number(m) - 1] ?? 'Jan'} ${String(Number(d)).padStart(2)} 00:00:00 ${y} GMT`;
}

const dn = (name: string): string => `CN = ${name}`;

function x509(shell: ShellState, stdin: string, args: readonly string[]): CommandResult {
  let file: string | undefined;
  const want: string[] = [];
  let noout = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? '';
    if (a === '-in') file = args[(i += 1)];
    else if (a === '-noout') noout = true;
    else if (['-subject', '-issuer', '-dates', '-startdate', '-enddate'].includes(a)) want.push(a);
    else if (a === '-ext') want.push(`-ext ${args[(i += 1)] ?? ''}`);
    else if (a === '-text') want.push(a);
    else return { stderr: `x509: Unknown option or message digest: ${a.replace(/^-/, '')}\nx509: Use -help for summary.\n`, code: 1 };
  }
  let text = stdin;
  if (file !== undefined) {
    const node = stat(shell.vfs, resolve(shell.cwd, file));
    if (node === undefined) return { stderr: `Could not open file or uri for loading certificate from ${file}\nUnable to load certificate\n`, code: 1 };
    const blocked = denied(shell, file, 'read', 'openssl');
    if (blocked) return blocked;
    text = readFile(shell.vfs, resolve(shell.cwd, file));
  }
  // 束（fullchain）は、本物と同じく先頭の 1 枚だけを読む
  const cert = parseCerts(text)[0];
  if (!cert) return { stderr: `Could not read certificate from ${file ?? '<stdin>'}\nUnable to load certificate\n`, code: 1 };
  const out: string[] = [];
  for (const w of want) {
    if (w === '-subject') out.push(`subject=${dn(cert.subject)}`);
    else if (w === '-issuer') out.push(`issuer=${dn(cert.issuer)}`);
    else if (w === '-dates' || w === '-startdate') out.push(`notBefore=${opensslDate(cert.notBefore)}`);
    if (w === '-dates' || w === '-enddate') out.push(`notAfter=${opensslDate(cert.notAfter)}`);
    else if (w === '-ext subjectAltName') out.push(...(cert.sans.length > 0 ? ['X509v3 Subject Alternative Name: ', `    ${cert.sans.map((n) => `DNS:${n}`).join(', ')}`] : ['No extensions in certificate']));
    else if (w === '-text') {
      out.push('Certificate:', '    Data:', '        Version: 3 (0x2)', `        Issuer: ${dn(cert.issuer)}`, '        Validity', `            Not Before: ${opensslDate(cert.notBefore)}`,
        `            Not After : ${opensslDate(cert.notAfter)}`, `        Subject: ${dn(cert.subject)}`, '        X509v3 extensions:', '            X509v3 Basic Constraints: critical',
        `                CA:${cert.ca ? 'TRUE' : 'FALSE'}`, ...(cert.sans.length > 0 ? ['            X509v3 Subject Alternative Name: ', `                ${cert.sans.map((n) => `DNS:${n}`).join(', ')}`] : []));
    }
  }
  // -noout が無ければ、本物は証明書そのもの（PEM）も出す
  if (!noout) out.push(...text.split('\n').slice(0, text.split('\n').findIndex((l) => l.trim() === '-----END CERTIFICATE-----') + 1));
  return { stdout: out.length > 0 ? `${out.join('\n')}\n` : '' };
}

/** 検証の失敗を、OpenSSL の番号と文にする */
function verifyError(v: Extract<TlsVerdict, { trusted: false }>): { num: number; text: string } {
  switch (v.reason) {
    case 'expired': return { num: 10, text: 'certificate has expired' };
    case 'not-yet-valid': return { num: 9, text: 'certificate is not yet valid' };
    case 'self-signed': return { num: 18, text: 'self-signed certificate' };
    case 'incomplete-chain': return { num: 21, text: 'unable to verify the first certificate' };
    case 'unknown-issuer':
    case 'name-mismatch':
      return { num: 20, text: 'unable to get local issuer certificate' };
  }
}

function sClient(shell: ShellState, args: readonly string[]): CommandResult {
  let connect: string | undefined;
  let show = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? '';
    if (a === '-connect') connect = args[(i += 1)];
    else if (a === '-servername') i += 1;
    else if (a === '-showcerts') show = true;
    else if (a === '-brief' || a === '-quiet') continue;
    else return { stderr: `s_client: Unknown option: ${a}\ns_client: Use -help for summary.\n`, code: 1 };
  }
  const m = /^([^:]+):(\d+)$/.exec(connect ?? '');
  if (!m) return { stderr: `s_client: -connect の後に「名前:ポート」を書く（例: -connect shop.example:443）\n`, code: 1 };
  const host = m[1] ?? '';
  const port = Number(m[2]);
  const env = httpEnvOf(shell);
  const peer = peerChain(env, host, port);
  if ('error' in peer) {
    if (peer.error === 'resolve') return { stderr: `BIO_lookup_ex:system lib:getaddrinfo() failure\ns_client: connect:errno=2\n`, code: 1 };
    if (peer.error === 'refused') return { stderr: `connect:errno=111\n`, code: 1 };
    return { stdout: 'CONNECTED(00000003)\n---\nno peer certificate available\n---\nNo client certificate CA names sent\n---\n', stderr: 'error:0A00010B:SSL routines::wrong version number\n', code: 1 };
  }
  const chain = peer.chain;
  const v = verify(host, chain, env.roots, env.today);
  const out = ['CONNECTED(00000003)'];
  // 深い方（ルート）から順に、たどれた所を言う。たどれなければ、そこで誤りを言う
  if (v.trusted || v.reason === 'name-mismatch') {
    const path: readonly Cert[] = v.trusted ? v.path : [chain[0] as Cert];
    for (let d = path.length - 1; d >= 0; d -= 1) out.push(`depth=${String(d)} ${dn(path[d]?.subject ?? '')}`, 'verify return:1');
  } else {
    const at = Math.max(0, chain.indexOf(v.cert));
    const e = verifyError(v);
    out.push(`depth=${String(at)} ${dn(v.cert.subject)}`);
    if (e.num === 21) out.push('verify error:num=20:unable to get local issuer certificate', 'verify return:1', `depth=${String(at)} ${dn(v.cert.subject)}`);
    out.push(`verify error:num=${String(e.num)}:${e.text}`, 'verify return:1');
  }
  out.push('---', 'Certificate chain');
  chain.forEach((c, i) => {
    out.push(` ${String(i)} s:${dn(c.subject)}`, `   i:${dn(c.issuer)}`, `   v:NotBefore: ${opensslDate(c.notBefore)}; NotAfter: ${opensslDate(c.notAfter)}`);
    if (show) out.push('-----BEGIN CERTIFICATE-----', `subject: ${c.subject}`, `issuer: ${c.issuer}`, '-----END CERTIFICATE-----');
  });
  const code = v.trusted || v.reason === 'name-mismatch' ? { num: 0, text: 'ok' } : verifyError(v);
  out.push('---', `Server certificate`, `subject=${dn(chain[0]?.subject ?? '')}`, `issuer=${dn(chain[0]?.issuer ?? '')}`, '---',
    `Verify return code: ${String(code.num)} (${code.text})`, '---', 'DONE');
  return { stdout: `${out.join('\n')}\n` };
}

export const opensslCommands: CommandSpec[] = [
  {
    name: 'openssl',
    summary: '証明書を読む（x509）・TLS の相手が送る証明書を見る（s_client）',
    handler: ({ argv, shell, stdin }) => {
      const [, sub, ...rest] = argv;
      if (sub === 'x509') return x509(shell, stdin, rest);
      if (sub === 's_client') return sClient(shell, rest);
      if (sub === 'version') return { stdout: 'OpenSSL 3.0.13 30 Jan 2024 (Library: OpenSSL 3.0.13 30 Jan 2024)\n' };
      if (sub === undefined) return { stderr: 'この練習の端末では、openssl の対話の画面は開けない。openssl x509 … や openssl s_client … の形で打つ\n', code: 1 };
      return { stderr: `Invalid command '${sub}'; type "help" for a list.\n`, code: 1 };
    },
  },
];
