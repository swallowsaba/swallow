import { describe, expect, it } from 'vitest';
import { DEMO_INTERMEDIATE, leafFor, type Cert } from '@/engines/tls/tls';
import { initialShell } from '@/engines/environments';
import { checkState } from '@/learning/practice';
import { createClock } from './clock';
import { createDefaultRegistry } from './commands';
import type { ShellState } from './registry';
import { serviceOf } from './services';
import { execute } from './shell';
import { certText, parseCerts, readWebConfig } from './webConfig';

const files = (map: Record<string, string>) => (p: string): string | null => map[p] ?? null;

describe('Web サーバの設定ファイル（nginx 風）', () => {
  it('listen の数が待ち受けるポート。書かなければ 80', () => {
    expect(readWebConfig('/c', files({ '/c': 'server {\n  listen 8080;\n}\n' }))).toEqual({ ok: true, listens: [{ port: 8080, ssl: false }] });
    expect(readWebConfig('/c', files({ '/c': 'server {\n  root /srv;\n}\n' }))).toEqual({ ok: true, listens: [{ port: 80, ssl: false }] });
  });

  it('; で終わっていない文は、ファイルと行を示して失敗する（本物と同じ言い方）', () => {
    const r = readWebConfig('/etc/nginx/conf.d/city.conf', files({ '/etc/nginx/conf.d/city.conf': 'server {\n  listen 80\n}\n' }));
    expect(r).toEqual({ ok: false, error: 'nginx: [emerg] directive "listen" is not terminated by ";" in /etc/nginx/conf.d/city.conf:2' });
  });

  it('ssl のポートは、ssl_certificate のファイルの証明書を（葉 → 中間の順に）送る。ファイルが無ければ失敗する', () => {
    const leaf = leafFor('city.example');
    const conf = 'server {\n  listen 443 ssl;\n  ssl_certificate /certs/full.crt;\n}\n';
    const ok = readWebConfig('/c', files({ '/c': conf, '/certs/full.crt': certText(leaf) + certText(DEMO_INTERMEDIATE) }));
    expect(ok.ok && ok.listens[0]?.chain?.map((c) => c.subject)).toEqual(['city.example', 'Minato Issuing CA']);
    const missing = readWebConfig('/c', files({ '/c': conf }));
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.error).toContain('cannot load certificate "/certs/full.crt"');
  });

  it('証明書のファイルは書いた形のまま読み戻せる', () => {
    const certs = parseCerts(certText(leafFor('a.example')) + certText(DEMO_INTERMEDIATE));
    const body = (c: Cert): Omit<Cert, 'id'> => ({ subject: c.subject, issuer: c.issuer, sans: c.sans, notBefore: c.notBefore, notAfter: c.notAfter, ca: c.ca });
    expect(certs.map(body)).toEqual([leafFor('a.example'), DEMO_INTERMEDIATE].map(body));
  });
});

/** 設定ファイルを持つ nginx と、80 番を使う古い apache2 のいるサーバ */
function server(conf: string, more: Record<string, string> = {}) {
  let shell: ShellState = initialShell('linux-server', {
    files: { '/etc/nginx/conf.d/city.conf': conf, '/etc/hosts': '127.0.0.1 localhost city.example\n', ...more },
    services: {
      nginx: { description: 'nginx web server', config: '/etc/nginx/conf.d/city.conf', body: '<h1>city</h1>' },
      apache2: { description: 'Apache', port: 80 },
    },
    sites: [],
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string) => {
    const out = execute(shell, line, registry, clock);
    shell = out.state;
    return { out: out.chunks.map((c) => c.text).join(''), code: out.exitCode };
  };
  return { run, shell: () => shell };
}

describe('設定ファイルを持つサービス（systemctl と curl）', () => {
  it('設定を書き換えても、動かし直すまで待ち受けるポートは変わらない', () => {
    const { run, shell } = server('server {\n  listen 8080;\n}\n');
    run('systemctl start nginx');
    expect(run('curl -s http://localhost:8080/').out).toContain('<h1>city</h1>');
    expect(checkState({ kind: 'http', url: 'http://localhost/', status: 200 }, { shell: shell() })).toBe(false);
    run("sed -i 's/8080/80/' /etc/nginx/conf.d/city.conf");
    expect(checkState({ kind: 'http', url: 'http://localhost/', status: 200 }, { shell: shell() })).toBe(false);
    expect(run('systemctl restart nginx').code).toBe(0);
    expect(checkState({ kind: 'http', url: 'http://localhost/', status: 200 }, { shell: shell() })).toBe(true);
  });

  it('設定の誤りでは起動に失敗し、journalctl に理由（ファイルと行）が出る', () => {
    const { run, shell } = server('server {\n  listen 80\n}\n');
    expect(run('systemctl start nginx').code).toBe(1);
    expect(serviceOf(shell().services, 'nginx')?.active).toBe('failed');
    expect(run('journalctl -u nginx').out).toContain('directive "listen" is not terminated by ";" in /etc/nginx/conf.d/city.conf:2');
  });

  it('動いている別のサービスと同じポートでは起動できない。そのサービスを止めれば起動できる', () => {
    const { run, shell } = server('server {\n  listen 80;\n}\n');
    run('systemctl start apache2');
    expect(run('systemctl start nginx').code).toBe(1);
    expect(run('journalctl -u nginx').out).toContain('bind() to 0.0.0.0:80 failed (98: Address already in use)');
    run('systemctl stop apache2');
    expect(run('systemctl start nginx').code).toBe(0);
    expect(serviceOf(shell().services, 'nginx')?.active).toBe('active');
  });

  it('https は送る証明書の連鎖で確かめる。中間を送らなければ警告、葉と中間を並べれば信頼できる', () => {
    const conf = 'server {\n  listen 443 ssl;\n  ssl_certificate /etc/nginx/certs/city.crt;\n}\n';
    const leafOnly = { '/etc/nginx/certs/city.crt': certText(leafFor('city.example')), '/etc/nginx/certs/inter.crt': certText(DEMO_INTERMEDIATE) };
    const { run, shell } = server(conf, leafOnly);
    const started = run('systemctl start nginx');
    expect(started.code, run('journalctl -u nginx').out).toBe(0);
    expect(run('curl https://city.example/').out).toContain('unable to get local issuer certificate');
    expect(checkState({ kind: 'tls', host: 'city.example', trusted: true }, { shell: shell() })).toBe(false);
    run('cat /etc/nginx/certs/city.crt /etc/nginx/certs/inter.crt > /etc/nginx/certs/fullchain.crt');
    run("sed -i 's/city.crt/fullchain.crt/' /etc/nginx/conf.d/city.conf");
    run('systemctl reload nginx');
    expect(run('curl https://city.example/').out).toContain('<h1>city</h1>');
    expect(checkState({ kind: 'tls', host: 'city.example', trusted: true }, { shell: shell() })).toBe(true);
  });
});
