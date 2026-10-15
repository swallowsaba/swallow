import { describe, expect, it } from 'vitest';
import { initialShell } from '../../environments';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';
import { opensslDate } from './openssl';

/** 証明書を読む・TLS の相手が送る証明書を見る（sec.b.07）。証明書のファイルは練習の形、出し方は本物の OpenSSL 3 */

const LEAF = '-----BEGIN CERTIFICATE-----\nsubject: shop.example\nissuer: Minato Issuing CA\nnames: shop.example\nvalid: 2026-01-01 2027-01-01\n-----END CERTIFICATE-----\n';
const INTER = '-----BEGIN CERTIFICATE-----\nsubject: Minato Issuing CA\nissuer: Minato Root CA\nvalid: 2024-01-01 2030-01-01\nca: yes\n-----END CERTIFICATE-----\n';

function open(): { run: (line: string) => { out: string; err: string; code: number } } {
  let state: ShellState = initialShell('linux-basic', {
    hostname: 'minato-shop',
    dirs: ['/var/www/shop'],
    files: {
      '/etc/hosts': '127.0.0.1\tlocalhost shop.example\n',
      '/etc/nginx/conf.d/shop.conf': 'server {\n  listen 443 ssl;\n  server_name shop.example;\n  ssl_certificate /etc/nginx/certs/shop.crt;\n  root /var/www/shop;\n}\n',
      '/etc/nginx/certs/shop.crt': LEAF,
      '/etc/nginx/certs/inter.crt': INTER,
      '/var/www/shop/index.html': '<h1>港の店</h1>\n',
    },
    services: { nginx: { description: 'nginx web server', enabled: true, config: '/etc/nginx/conf.d/shop.conf' } },
    sites: [],
    run: ['systemctl start nginx'],
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  return {
    run: (line) => {
      const o = execute(state, line, registry, clock);
      state = o.state;
      const pick = (k: 'stdout' | 'stderr'): string => o.chunks.filter((c) => c.stream === k).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
  };
}

describe('openssl x509', () => {
  it('持ち主・発行者・期限を OpenSSL 3 の形で出す。束は先頭の 1 枚だけを読む', () => {
    const t = open();
    expect(t.run('openssl x509 -in /etc/nginx/certs/shop.crt -noout -subject -issuer -dates').out).toBe(
      'subject=CN = shop.example\nissuer=CN = Minato Issuing CA\nnotBefore=Jan  1 00:00:00 2026 GMT\nnotAfter=Jan  1 00:00:00 2027 GMT\n',
    );
    t.run('cat /etc/nginx/certs/inter.crt /etc/nginx/certs/shop.crt > /tmp/both.crt');
    expect(t.run('openssl x509 -in /tmp/both.crt -noout -subject').out).toBe('subject=CN = Minato Issuing CA\n');
    expect(t.run('openssl x509 -in /etc/nginx/certs/shop.crt -noout -ext subjectAltName').out).toBe('X509v3 Subject Alternative Name: \n    DNS:shop.example\n');
    expect(t.run('cat /etc/nginx/certs/shop.crt | openssl x509 -noout -issuer').out).toBe('issuer=CN = Minato Issuing CA\n');
  });

  it('無いファイル・証明書でないファイルは、本物の文で断る', () => {
    const t = open();
    expect(t.run('openssl x509 -in nope.crt -noout -subject')).toMatchObject({ err: 'Could not open file or uri for loading certificate from nope.crt\nUnable to load certificate\n', code: 1 });
    expect(t.run('openssl x509 -in /etc/hosts -noout -subject').err).toBe('Could not read certificate from /etc/hosts\nUnable to load certificate\n');
  });

  it('日付は月の名前と、2 けたにそろえた日で書く', () => {
    expect(opensslDate('2030-12-05')).toBe('Dec  5 00:00:00 2030 GMT');
  });
});

describe('openssl s_client', () => {
  it('中間証明書を送っていなければ、送った並びは 1 枚で、21 で終わる。束にして読み直すと、手元のルートまでたどれて 0 (ok)', () => {
    const t = open();
    const before = t.run('openssl s_client -connect shop.example:443 -servername shop.example').out;
    expect(before).toContain('depth=0 CN = shop.example\nverify error:num=20:unable to get local issuer certificate\n');
    expect(before).toContain('Certificate chain\n 0 s:CN = shop.example\n   i:CN = Minato Issuing CA\n');
    expect(before).not.toContain(' 1 s:');
    expect(before).toContain('Verify return code: 21 (unable to verify the first certificate)');
    t.run('cat /etc/nginx/certs/shop.crt /etc/nginx/certs/inter.crt > /etc/nginx/certs/fullchain.crt');
    t.run("sed -i 's|shop.crt|fullchain.crt|' /etc/nginx/conf.d/shop.conf");
    t.run('systemctl reload nginx');
    const after = t.run('openssl s_client -connect shop.example:443').out;
    expect(after).toMatch(/^CONNECTED\(00000003\)\ndepth=2 CN = Minato Root CA\nverify return:1\ndepth=1 CN = Minato Issuing CA\nverify return:1\ndepth=0 CN = shop\.example\nverify return:1\n/);
    expect(after).toContain(' 1 s:CN = Minato Issuing CA\n   i:CN = Minato Root CA\n');
    expect(after).toContain('Verify return code: 0 (ok)');
    expect(t.run('curl -s https://shop.example/').out).toContain('港の店');
  });

  it('引けない名前・待ち受けていないポートは、つながる前に止まる', () => {
    const t = open();
    expect(t.run('openssl s_client -connect nowhere.example:443').code).toBe(1);
    expect(t.run('openssl s_client -connect shop.example:8443').err).toBe('connect:errno=111\n');
  });
});
