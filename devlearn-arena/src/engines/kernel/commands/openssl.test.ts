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

describe('1 台で名前ごとに証明書を送り分ける（SNI）', () => {
  const cert = (name: string, names: string, valid: string) =>
    `-----BEGIN CERTIFICATE-----\nsubject: ${name}\nissuer: Minato Issuing CA\nnames: ${names}\nvalid: ${valid}\n-----END CERTIFICATE-----\n`;
  function three(): { run: (line: string) => { out: string; err: string; code: number } } {
    let state: ShellState = initialShell('linux-basic', {
      hostname: 'minato-web',
      dirs: ['/var/www/shop', '/var/www/lib'],
      files: {
        '/etc/hosts': '127.0.0.1\tlocalhost shop.example lib.example www.lib.example\n',
        '/etc/nginx/conf.d/sites.conf':
          'server {\n  listen 443 ssl;\n  server_name shop.example;\n  ssl_certificate /etc/nginx/certs/shop.crt;\n  root /var/www/shop;\n}\n' +
          'server {\n  listen 443 ssl;\n  server_name lib.example www.lib.example;\n  ssl_certificate /etc/nginx/certs/lib.crt;\n  root /var/www/lib;\n}\n',
        '/etc/nginx/certs/shop.crt': cert('shop.example', 'shop.example', '2025-09-01 2026-09-30') + INTER,
        '/etc/nginx/certs/lib.crt': cert('lib.example', 'lib.example', '2026-01-01 2027-01-01') + INTER,
        '/var/www/shop/index.html': '<h1>港の店</h1>\n',
        '/var/www/lib/index.html': '<h1>図書館</h1>\n',
        '/etc/nginx/certs/new.crt': cert('shop.example', 'shop.example', '2026-09-01 2027-09-30'),
      },
      services: { nginx: { description: 'nginx web server', enabled: true, config: '/etc/nginx/conf.d/sites.conf' } },
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

  it('頼んだ名前の server の証明書を送る。期限切れの店と、名前の足りない図書館は、それぞれの理由で断られる', () => {
    const t = three();
    expect(t.run('curl -s https://lib.example/').out).toContain('図書館');
    expect(t.run('curl https://shop.example/').err).toContain('SSL certificate problem: certificate has expired');
    expect(t.run('curl https://www.lib.example/').err).toContain("SSL: no alternative certificate subject name matches target host name 'www.lib.example'");
    expect(t.run('openssl s_client -connect shop.example:443 -servername shop.example').out).toContain('Verify return code: 10 (certificate has expired)');
    expect(t.run('openssl s_client -connect lib.example:443').out).toContain(' 0 s:CN = lib.example\n');
  });

  it('-servername を付けると、つなぐ先と違う名前で証明書を頼める', () => {
    const t = three();
    expect(t.run('openssl s_client -connect localhost:443 -servername lib.example').out).toContain(' 0 s:CN = lib.example\n');
    expect(t.run('openssl s_client -connect localhost:443 -servername shop.example').out).toContain(' 0 s:CN = shop.example\n');
  });

  it('期限内の証明書に替えて読み直すと、その名前だけ通る', () => {
    const t = three();
    t.run("sed -i 's|shop.crt|new.crt|' /etc/nginx/conf.d/sites.conf");
    expect(t.run('curl https://shop.example/').code).toBe(60);
    t.run('systemctl reload nginx');
    // 中間が無いので、今度は連鎖の欠け
    expect(t.run('curl https://shop.example/').err).toContain('unable to get local issuer certificate');
    expect(t.run('curl -s https://lib.example/').out).toContain('図書館');
  });
});

describe('openssl で証明書と秘密鍵の対を確かめる（-modulus と md5）', () => {
  const CERT = '-----BEGIN CERTIFICATE-----\nsubject: shop.example\nissuer: Minato Issuing CA\nnames: shop.example\nvalid: 2026-01-01 2027-01-01\nkey: shop-2026\n-----END CERTIFICATE-----\n';
  const KEY = '-----BEGIN PRIVATE KEY-----\npair: shop-2026\n-----END PRIVATE KEY-----\n';
  const OLD = '-----BEGIN PRIVATE KEY-----\npair: shop-2025\n-----END PRIVATE KEY-----\n';
  function keys(): { run: (line: string) => { out: string; err: string; code: number } } {
    let state: ShellState = initialShell('linux-basic', { files: { '/home/learner/shop.crt': CERT, '/home/learner/shop.key': KEY, '/home/learner/old.key': OLD } });
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

  it('対の証明書と秘密鍵は同じ Modulus を出し、違う秘密鍵は違う値を出す', () => {
    const t = keys();
    const cert = t.run('openssl x509 -noout -modulus -in shop.crt').out;
    expect(cert).toMatch(/^Modulus=[0-9A-F]{64,}\n$/);
    expect(t.run('openssl rsa -noout -modulus -in shop.key').out).toBe(cert);
    expect(t.run('openssl pkey -noout -modulus -in shop.key').out).toBe(cert);
    expect(t.run('openssl rsa -noout -modulus -in old.key').out).not.toBe(cert);
  });

  it('openssl md5 は標準入力の MD5 を本物の形で出す（短く比べるため）', () => {
    const t = keys();
    expect(t.run('echo -n abc | openssl md5').out).toBe('MD5(stdin)= 900150983cd24fb0d6963f7d28e17f72\n');
    const a = t.run('openssl x509 -noout -modulus -in shop.crt | openssl md5').out;
    expect(a).toBe(t.run('openssl rsa -noout -modulus -in shop.key | openssl md5').out);
  });

  it('秘密鍵でないファイルは読めない', () => {
    const t = keys();
    const r = t.run('openssl rsa -noout -modulus -in shop.crt');
    expect(r.code).toBe(1);
    expect(r.err).toContain('Could not read private key from shop.crt');
  });
});
