import { portOwner, servedAt } from '@/engines/container/container';
import { curlError, request, type HttpEnv } from '@/engines/http/http';
import type { CommandResult, ShellState } from '../registry';

/**
 * 手元（この機械）から見た HTTP の世界（src/engines/http の HttpEnv）。
 * localhost と自分の名前には、動いているサービス（systemctl）と、公開したコンテナのポート（docker run -p）が応える。
 */
export function httpEnvOf(shell: ShellState): HttpEnv {
  const web = shell.web;
  return {
    sites: web?.sites ?? [],
    roots: web?.roots ?? [],
    today: web?.today ?? '2026-10-03',
    localNames: ['localhost', '127.0.0.1', ...(web?.hostname ? [web.hostname] : [])],
    local: (port) => {
      for (const s of shell.services?.services.values() ?? []) {
        if (s.active === 'active' && s.port === port) return { body: s.body ?? `<html><body>${s.name}</body></html>`, server: s.name };
      }
      const served = servedAt(shell.containers, port);
      if (served) return { body: served.body, server: served.container.image.split(':')[0] ?? 'container' };
      // ポートは公開したが、コンテナの中で待ち受けていない（-p 8080:8080 など）
      if (shell.containers && portOwner(shell.containers, port)) return { reset: true };
      return null;
    },
  };
}

/** ネットワークの構成を使わない実戦の curl（-I・-i・-s・-v・-k） */
export function localCurl(argv: readonly string[], shell: ShellState): CommandResult {
  const flags = new Set<string>();
  let url: string | undefined;
  for (const a of argv.slice(1)) {
    if (a === '--insecure') flags.add('k');
    else if (a === '--head') flags.add('I');
    else if (a === '--include') flags.add('i');
    else if (a === '--silent') flags.add('s');
    else if (a === '--verbose') flags.add('v');
    else if (/^-[a-zA-Z]+$/.test(a)) for (const ch of a.slice(1)) flags.add(ch);
    else url ??= a;
  }
  if (!url) return { stderr: "curl: try 'curl --help' for more information\n", code: 2 };
  const out = request(httpEnvOf(shell), url, { insecure: flags.has('k') });
  const verbose: string[] = [];
  if (out.url && flags.has('v')) verbose.push(`* Trying ${out.url.host}:${String(out.url.port)}...`);
  if (!out.ok) {
    const e = curlError(out.error, out.url?.host ?? '');
    return { stderr: `${verbose.map((l) => `${l}\n`).join('')}curl: (${String(e.code)}) ${e.message}\n`, code: e.code };
  }
  const r = out.response;
  if (flags.has('v')) {
    verbose.push(`* Connected to ${out.url.host} port ${String(out.url.port)}`);
    if (out.tls?.trusted) verbose.push(`* SSL certificate verify ok.`, ...out.tls.path.map((c, i) => `*  ${i === 0 ? 'subject' : 'issuer'}: CN=${c.subject}`));
    verbose.push(`> GET ${out.url.path} HTTP/1.1`, `> Host: ${out.url.host}`, '>', `< HTTP/1.1 ${String(r.status)} ${r.reason}`);
  }
  const head = [`HTTP/1.1 ${String(r.status)} ${r.reason}`, ...Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`), ''].join('\n');
  const stdout = flags.has('I') ? `${head}\n` : flags.has('i') ? `${head}\n${r.body}\n` : `${r.body}\n`;
  return { stdout, ...(verbose.length ? { stderr: `${verbose.join('\n')}\n` } : {}) };
}
