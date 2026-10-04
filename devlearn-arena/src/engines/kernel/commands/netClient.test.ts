import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { checkState } from '@/learning/practice';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from './index';

/**
 * 網を確かめる機械（net-client）の端末: ping・traceroute・dig・curl と、名前の答えの直し方（ゾーンファイルと reload）、
 * 判定の net（docs/content-spec.md 2.4）
 */

const registry = createDefaultRegistry();
const clock = createClock();

function session(setup: unknown) {
  let shell: ShellState = initialShell('net-client', setup);
  return {
    run(line: string) {
      const o = execute(shell, line, registry, clock);
      shell = o.state;
      const pick = (s: string) => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
    get shell() {
      return shell;
    },
  };
}

/** pc → r1 → r2（traceroute に答えない）→ r3 →（切れた線）→ r4 → shop */
const route = (down = true) => ({
  network: {
    self: 'pc',
    devices: [
      { name: 'pc', addrs: ['10.0.1.10/24'], gateway: '10.0.1.1' },
      { name: 'r1', kind: 'router', addrs: ['10.0.1.1/24', '10.0.12.1/30'], gateway: '10.0.12.2' },
      { name: 'r2', kind: 'router', addrs: ['10.0.12.2/30', '10.0.23.1/30'], gateway: '10.0.23.2', routes: [{ to: '10.0.1.0/24', via: '10.0.12.1' }], silent: true },
      { name: 'r3', kind: 'router', addrs: ['10.0.23.2/30', '10.0.34.1/30'], gateway: '10.0.34.2', routes: [{ to: '10.0.1.0/24', via: '10.0.23.1' }, { to: '10.0.12.0/30', via: '10.0.23.1' }] },
      { name: 'r4', kind: 'router', addrs: ['10.0.34.2/30', '192.0.2.1/24'], gateway: '10.0.34.1' },
      { name: 'shop', addrs: ['192.0.2.10/24'], gateway: '192.0.2.1', listen: [80], body: '<h1>港町の店</h1>' },
    ],
    links: [['pc', 'r1'], ['r1', 'r2'], ['r2', 'r3'], down ? ['r3', 'r4', 'down'] : ['r3', 'r4'], ['r4', 'shop']],
    dns: { 'shop.example': '192.0.2.10' },
  },
});

describe('ping と traceroute', () => {
  it('届けば、返事の行と統計が出る。返事が来なければ 100% packet loss で終了の値は 1', () => {
    const ok = session(route(false)).run('ping shop.example');
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('PING shop.example (192.0.2.10) 56(84) bytes of data.');
    expect(ok.out).toMatch(/64 bytes from 192\.0\.2\.10: icmp_seq=1 ttl=60 time=[\d.]+ ms/);
    expect(ok.out).toContain('4 packets transmitted, 4 received, 0% packet loss');
    const lost = session(route()).run('ping -c 2 shop.example');
    expect(lost.code).toBe(1);
    expect(lost.out).toContain('2 packets transmitted, 0 received, 100% packet loss');
  });

  it('traceroute は通った機器のアドレスを順に出す。答えない機器は * * *、止まった先も * * *', () => {
    const t = session(route()).run('traceroute shop.example');
    const lines = t.out.split('\n');
    expect(lines[0]).toBe('traceroute to shop.example (192.0.2.10), 8 hops max, 60 byte packets');
    expect(lines[1]).toMatch(/^ 1 {2}10\.0\.1\.1 {2}[\d.]+ ms$/);
    expect(lines[2]).toBe(' 2  * * *');
    expect(lines[3]).toMatch(/^ 3 {2}10\.0\.23\.2 {2}[\d.]+ ms$/);
    expect(lines.slice(4, 9)).toEqual([' 4  * * *', ' 5  * * *', ' 6  * * *', ' 7  * * *', ' 8  * * *']);
    const ok = session(route(false)).run('traceroute shop.example').out.split('\n');
    expect(ok[5]).toMatch(/^ 5 {2}192\.0\.2\.10 {2}[\d.]+ ms$/);
    expect(ok).toHaveLength(7);
  });

  it('引けない名前はエラーの文で返す', () => {
    const r = session(route()).run('ping nope.example');
    expect(r.code).toBe(2);
    expect(r.err).toBe('ping: nope.example: Name or service not known\n');
  });
});

/** 自分が DNS のサーバ（ns1）。店の Web サーバは 203.0.113.20 に引っ越したが、ゾーンファイルは古い 203.0.113.10 のまま */
const dns = {
  user: 'root',
  files: {
    '/etc/bind/db.shop.example': '$TTL 300\n$ORIGIN shop.example.\n@    IN  A      203.0.113.10\nwww  IN  CNAME  @\n',
  },
  services: { named: { description: 'BIND DNS server', active: true, enabled: true, port: 53, zone: '/etc/bind/db.shop.example' } },
  network: {
    self: 'ns1',
    devices: [
      { name: 'ns1', addrs: ['10.0.0.53/24'], gateway: '10.0.0.1' },
      { name: 'gw', kind: 'router', addrs: ['10.0.0.1/24', '203.0.113.1/24'] },
      { name: 'web', addrs: ['203.0.113.20/24'], gateway: '203.0.113.1', listen: [80], body: '<h1>港町の店</h1>' },
    ],
    links: [['ns1', 'gw'], ['gw', 'web']],
  },
};

describe('dig と、名前の答えを直す', () => {
  it('dig は動いている DNS のサーバが読んだゾーンの答えを出す。+short はアドレスだけ', () => {
    const s = session(dns);
    const r = s.run('dig shop.example');
    expect(r.out).toContain('status: NOERROR');
    expect(r.out).toContain(';; ANSWER SECTION:\nshop.example.\t\t300\tIN\tA\t203.0.113.10');
    expect(s.run('dig +short www.shop.example').out).toBe('203.0.113.10\n');
    expect(s.run('dig nope.example').out).toContain('status: NXDOMAIN');
  });

  it('ゾーンファイルを直しても、読み直す（reload）までは古い答えのまま。読み直すと新しい答えになり、名前で届く', () => {
    const s = session(dns);
    expect(checkState({ kind: 'net', expr: 'resolve shop.example=203.0.113.10' }, { shell: s.shell })).toBe(true);
    s.run("sed -i 's/203.0.113.10/203.0.113.20/' /etc/bind/db.shop.example");
    expect(s.run('dig +short shop.example').out).toBe('203.0.113.10\n');
    const old = s.run('curl http://shop.example/');
    expect(old.code).toBe(28);
    expect(old.err).toBe('curl: (28) Failed to connect to shop.example port 80: Connection timed out\n');
    expect(checkState({ kind: 'net', expr: 'reach shop.example:80' }, { shell: s.shell })).toBe(false);
    expect(s.run('systemctl reload named').code).toBe(0);
    expect(s.run('dig +short shop.example').out).toBe('203.0.113.20\n');
    expect(s.run('curl http://shop.example/').out).toBe('<h1>港町の店</h1>\n');
    expect(checkState({ kind: 'net', expr: 'resolve shop.example=203.0.113.20 && reach shop.example:80' }, { shell: s.shell })).toBe(true);
    expect(checkState({ kind: 'net', expr: '!reach shop.example:22' }, { shell: s.shell })).toBe(true);
  });

  it('待ち受けていないポートは Connection refused', () => {
    const s = session(dns);
    s.run("sed -i 's/203.0.113.10/203.0.113.20/' /etc/bind/db.shop.example");
    s.run('systemctl reload named');
    const r = s.run('curl http://shop.example:8080/');
    expect(r.code).toBe(7);
    expect(r.err).toBe('curl: (7) Failed to connect to shop.example port 8080: Connection refused\n');
  });
});

describe('ss: 接続の状態', () => {
  const app = {
    user: 'root',
    hostname: 'app01',
    address: '10.0.0.5/24',
    services: { app: { description: 'Order app', active: true, enabled: true, port: 8080 } },
    sockets: [
      { state: 'ESTAB', local: '10.0.0.5:8080', peer: '10.0.0.77:52114' },
      { state: 'SYN-SENT', local: '10.0.0.5:41022', peer: '10.0.0.30:6379' },
      { state: 'TIME-WAIT', local: '10.0.0.5:39410', peer: '10.0.0.20:5432' },
    ],
  };

  it('-l は待ち受けだけ、-a は待ち受けと接続の全て、どちらも無ければ接続だけを出す', () => {
    const s = (() => {
      let shell = initialShell('linux-server', app);
      return (line: string) => {
        const o = execute(shell, line, registry, clock);
        shell = o.state;
        return o.chunks.map((c) => c.text).join('');
      };
    })();
    const listen = s('ss -tln');
    expect(listen).toContain('LISTEN');
    expect(listen).not.toContain('SYN-SENT');
    const all = s('ss -tan').split('\n');
    expect(all[0]).toMatch(/^State +Recv-Q Send-Q +Local Address:Port +Peer Address:Port/);
    expect(all.filter((l) => l.startsWith('LISTEN'))).toHaveLength(1);
    expect(all.find((l) => l.startsWith('SYN-SENT'))).toMatch(/10\.0\.0\.5:41022 +10\.0\.0\.30:6379/);
    const conns = s('ss -tn');
    expect(conns).not.toContain('LISTEN');
    expect(conns).toContain('ESTAB');
    expect(conns).toContain('TIME-WAIT');
  });
});
