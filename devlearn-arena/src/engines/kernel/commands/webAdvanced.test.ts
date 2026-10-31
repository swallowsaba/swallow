import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from './index';

/** web の上級の実戦で使う模擬: curl の時間の内訳（web.a.01）・アプリの設定の誤り（web.a.02）・トークンの API（web.a.03） */

const registry = createDefaultRegistry();
const clock = createClock();

function session(setup: unknown) {
  let shell: ShellState = initialShell('web-client', setup);
  return {
    run(line: string) {
      const o = execute(shell, line, registry, clock);
      shell = o.state;
      const pick = (s: string) => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
  };
}

describe('curl の時間の内訳', () => {
  const s = () => session({ sites: [{ host: 'slow.example', port: 80, timing: { dns: 0.9, connect: 0.05, tls: 0, wait: 0.2, transfer: 0.1 }, routes: { '/': { status: 200, body: 'ok' } } }] });

  it('time_ は頼み始めからの累計で、本物と同じ桁で出す', () => {
    const r = s().run('curl -s -o /dev/null -w "%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total}\\n" http://slow.example/');
    expect(r.out).toBe('0.900000 0.950000 0.000000 1.150000 1.250000\n');
  });

  it('内訳を書いていないサイトは短い決まった時間で答える', () => {
    const t = session({ sites: [{ host: 'fast.example', port: 80, routes: { '/': { status: 200, body: 'ok' } } }] });
    expect(t.run('curl -s -o /dev/null -w "%{time_total}" http://fast.example/').out).toMatch(/^0\.\d{6}$/);
  });

  it('size_download は本文の大きさ。内訳に size があれば、その値', () => {
    const t = session({ sites: [{ host: 'big.example', port: 80, timing: { dns: 0, connect: 0, tls: 0, wait: 0, transfer: 3, size: 48000000 }, routes: { '/': { status: 200, body: 'ok' } } }] });
    expect(t.run('curl -s -o /dev/null -w "%{size_download}" http://big.example/').out).toBe('48000000');
  });
});

const app = (env: string) => ({
  files: { '/etc/hosts': '127.0.0.1 localhost shop.example\n', '/etc/shop/app.env': env },
  dirs: ['/etc/shop'],
  services: {
    shop: { description: 'Shop app', enabled: true, active: true, port: 8080, body: '<h1>港の店</h1>', envCheck: { file: '/etc/shop/app.env', key: 'DB_HOST', want: 'db.internal', error: 'could not connect to database at ${value}:5432' } },
  },
});

describe('アプリの設定の誤り', () => {
  it('動かす時に読んだ設定が違えば 500 を返し、ログに理由を書く。直して動かし直すと 200', () => {
    const s = session(app('DB_HOST=db.old\n'));
    expect(s.run('curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/').out).toBe('500');
    expect(s.run('sed -i "s/db.old/db.internal/" /etc/shop/app.env').code).toBe(0);
    // 書き換えただけでは変わらない（動かす時に読む）
    expect(s.run('curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/').out).toBe('500');
    s.run('systemctl restart shop');
    expect(s.run('curl -s http://localhost:8080/').out).toContain('港の店');
  });

  it('動かし直しても設定が違えば、ログに読んだ値の文が残る', () => {
    const s = session(app('DB_HOST=db.old\n'));
    s.run('sed -i "s/db.old/db.other/" /etc/shop/app.env');
    s.run('systemctl restart shop');
    expect(s.run('journalctl -u shop').out).toContain('could not connect to database at db.other:5432');
    expect(s.run('curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/').out).toBe('500');
  });
});

const tokens = {
  files: { '/etc/hosts': '127.0.0.1 localhost api.example\n', '/home/learner/.env': 'export API_TOKEN=tk-old-111\nexport CLIENT_SECRET=s3-shop\n' },
  services: {
    api: { description: 'Orders API', enabled: true, active: true, port: 80, body: '{"orders":3}', tokenApi: { token: 'tk-new-222', expired: ['tk-old-111'], secret: 's3-shop' } },
  },
};

describe('トークンの API', () => {
  it('見出しが無ければ 401、期限切れも 401。理由は本文で分かる', () => {
    const s = session(tokens);
    expect(s.run('curl -s http://api.example/orders').out).toContain('missing_token');
    expect(s.run('curl -s -H "Authorization: Bearer tk-old-111" http://api.example/orders').out).toContain('token_expired');
    expect(s.run('curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer tk-old-111" http://api.example/orders').out).toBe('401');
    expect(s.run('curl -s -H "Authorization: Basic tk-new-222" http://api.example/orders').out).toContain('invalid_token');
  });

  it('秘密で取り直したトークンは使える。秘密が違えば invalid_client', () => {
    const s = session(tokens);
    s.run('source /home/learner/.env');
    expect(s.run('curl -s -X POST -d "client_id=shop" -d "client_secret=nope" http://api.example/token').out).toContain('invalid_client');
    const got = s.run('curl -s -X POST -d "client_id=shop" -d "client_secret=$CLIENT_SECRET" http://api.example/token');
    expect(JSON.parse(got.out)).toMatchObject({ access_token: 'tk-new-222', token_type: 'Bearer' });
    s.run('export API_TOKEN=$(curl -s -X POST -d "client_id=shop" -d "client_secret=$CLIENT_SECRET" http://api.example/token | jq -r .access_token)');
    expect(s.run('curl -s -H "Authorization: Bearer $API_TOKEN" http://api.example/orders').out).toContain('"orders":3');
  });
});
