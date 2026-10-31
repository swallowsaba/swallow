import { describe, expect, it } from 'vitest';
import { initialShell } from '../../environments';
import { checkState } from '@/learning/practice';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/**
 * API の鍵を読むサービス（sec.i.05 秘密情報の保管と受け渡し）。
 * 受ける側は鍵の一覧のファイルを読み、頼む側は環境のファイルの鍵を動かす時に読む。どちらも読み直すまで前の鍵のまま
 */

const OLD = 'k-old-7f3a';
const NEW = 'k-new-c91d';

function open(): { run: (line: string) => { out: string; err: string; code: number }; state: () => ShellState } {
  let state: ShellState = initialShell('linux-basic', {
    hostname: 'shop-srv',
    files: {
      '/etc/pay-api/keys': `${OLD}\n`,
      '/etc/shop/shop.env': `PAY_API_KEY=${OLD}\n`,
      '/home/learner/inbox/new-key': `${NEW}\n`,
    },
    services: {
      'pay-api': { description: 'Payment API', active: true, enabled: true, port: 9000, keyGuard: { file: '/etc/pay-api/keys' } },
      shop: { description: 'Shop app', active: true, enabled: true, port: 8080, keyClient: { envFile: '/etc/shop/shop.env', name: 'PAY_API_KEY', upstream: 9000 } },
    },
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
    state: () => state,
  };
}

const status = (t: ReturnType<typeof open>, line: string): string => t.run(`curl -s -o /dev/null -w '%{http_code}' ${line}`).out;

describe('API の鍵を読むサービス', () => {
  it('受ける側は、一覧にある鍵だけを受け、無い鍵には 401 を返す', () => {
    const t = open();
    expect(status(t, `-H 'Authorization: Bearer ${OLD}' http://localhost:9000/charge`)).toBe('200');
    expect(status(t, `-H 'Authorization: Bearer ${NEW}' http://localhost:9000/charge`)).toBe('401');
    expect(status(t, 'http://localhost:9000/charge')).toBe('401');
    expect(t.run('curl -i -s http://localhost:9000/charge').out).toContain('WWW-Authenticate: Bearer');
  });

  it('一覧のファイルを書き換えても、読み直すまでは前の鍵のまま', () => {
    const t = open();
    t.run('cat /home/learner/inbox/new-key >> /etc/pay-api/keys');
    expect(status(t, `-H 'Authorization: Bearer ${NEW}' http://localhost:9000/charge`)).toBe('401');
    t.run('sudo systemctl reload pay-api');
    expect(status(t, `-H 'Authorization: Bearer ${NEW}' http://localhost:9000/charge`)).toBe('200');
    expect(status(t, `-H 'Authorization: Bearer ${OLD}' http://localhost:9000/charge`)).toBe('200');
  });

  it('頼む側は、動かした時に読んだ鍵で頼む。受ける側に断られると 502', () => {
    const t = open();
    expect(status(t, 'http://localhost:8080/checkout')).toBe('200');
    t.run(`sed -i 's/^PAY_API_KEY=.*/PAY_API_KEY=${NEW}/' /etc/shop/shop.env`);
    // 書き換えただけでは、動いているアプリは前の鍵のまま
    expect(status(t, 'http://localhost:8080/checkout')).toBe('200');
    t.run('sudo systemctl restart shop');
    const r = t.run('curl -s http://localhost:8080/checkout');
    expect(r.out).toContain('payment refused: 401');
    t.run('cat /home/learner/inbox/new-key >> /etc/pay-api/keys');
    t.run('sudo systemctl reload pay-api');
    expect(t.run('curl -s http://localhost:8080/checkout').out).toContain('c91d');
  });

  it('順に取り換えると、新しい鍵で動き、古い鍵は断られる（判定は http の auth）', () => {
    const t = open();
    t.run('cat /home/learner/inbox/new-key >> /etc/pay-api/keys');
    t.run('sudo systemctl reload pay-api');
    t.run(`sed -i 's/^PAY_API_KEY=.*/PAY_API_KEY=${NEW}/' /etc/shop/shop.env`);
    t.run('sudo systemctl restart shop');
    t.run(`sed -i '/${OLD}/d' /etc/pay-api/keys`);
    t.run('sudo systemctl reload pay-api');
    expect(checkState({ kind: 'http', url: 'http://localhost:9000/charge', status: 401, auth: `Bearer ${OLD}` }, { shell: t.state() })).toBe(true);
    expect(checkState({ kind: 'http', url: 'http://localhost:9000/charge', status: 200, auth: `Bearer ${NEW}` }, { shell: t.state() })).toBe(true);
    expect(checkState({ kind: 'http', url: 'http://localhost:8080/checkout', status: 200, contains: 'c91d' }, { shell: t.state() })).toBe(true);
  });
});
