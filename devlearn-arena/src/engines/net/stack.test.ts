import { beforeEach, describe, expect, it } from 'vitest';
import { host, iface, link, packet, resetMac, resetPacketCounter, router, topology } from './factory';
import { deliver, ownsIp, selectRoute } from './stack';
import type { Route, Topology } from './types';

beforeEach(() => {
  resetMac();
  resetPacketCounter();
});

/**
 *  pc1 (192.168.1.10) -- r1 -- (10.0.0.0/24) -- r2 -- web (10.0.0.20)
 */
function build(options: { linkUp?: boolean; blocked?: number[]; listening?: number[]; route?: boolean } = {}): Topology {
  const pc1 = host('pc1', [iface('eth0', '192.168.1.10', 24)], {
    routes: [{ destination: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
  });
  const r1 = router(
    'r1',
    [iface('eth0', '192.168.1.1', 24), iface('eth1', '172.16.0.1', 30)],
    options.route === false
      ? []
      : [{ destination: '10.0.0.0/24', via: '172.16.0.2', dev: 'eth1' }],
  );
  const r2 = router(
    'r2',
    [iface('eth0', '172.16.0.2', 30), iface('eth1', '10.0.0.1', 24)],
    [{ destination: '192.168.1.0/24', via: '172.16.0.1', dev: 'eth0' }],
  );
  const web = host('web', [iface('eth0', '10.0.0.20', 24)], {
    routes: [{ destination: '0.0.0.0/0', via: '10.0.0.1', dev: 'eth0' }],
    listening: options.listening ?? [80, 443],
    blockedPorts: options.blocked ?? [],
  });

  return topology(
    [pc1, r1, r2, web],
    [
      link('pc1:eth0', 'r1:eth0'),
      link('r1:eth1', 'r2:eth0', options.linkUp !== false),
      link('r2:eth1', 'web:eth0'),
    ],
  );
}

describe('最長プレフィックス一致', () => {
  const routes: Route[] = [
    { destination: '0.0.0.0/0', via: '10.0.0.1', dev: 'eth0' },
    { destination: '10.0.0.0/8', via: '10.0.0.2', dev: 'eth1' },
    { destination: '10.1.2.0/24', via: '10.0.0.3', dev: 'eth2' },
  ];

  it('より具体的な経路が勝つ', () => {
    expect(selectRoute(routes, '10.1.2.5')?.dev).toBe('eth2');
  });
  it('中間の経路が選ばれる', () => {
    expect(selectRoute(routes, '10.9.9.9')?.dev).toBe('eth1');
  });
  it('どれにも当たらなければデフォルト', () => {
    expect(selectRoute(routes, '8.8.8.8')?.dev).toBe('eth0');
  });
  it('デフォルトも無ければ null', () => {
    expect(selectRoute([{ destination: '10.0.0.0/8', via: null, dev: 'eth0' }], '8.8.8.8')).toBeNull();
  });
});

describe('転送', () => {
  it('宛先まで届く', () => {
    const result = deliver(build(), 'pc1', packet('192.168.1.10', '10.0.0.20', { dstPort: 80 }));
    expect(result.delivered).toBe(true);
    expect(result.hops.map((h) => h.device)).toEqual(['pc1', 'r1', 'r2', 'web']);
  });

  it('ホップごとに TTL が減る', () => {
    const result = deliver(build(), 'pc1', packet('192.168.1.10', '10.0.0.20', { ttl: 64 }));
    const ttls = result.hops.map((h) => h.packet.ip.ttl);
    expect(ttls[0]).toBe(64);
    expect(ttls[1]).toBe(63);
    expect(ttls[2]).toBe(62);
  });

  it('IP は変わらないが MAC は変わる', () => {
    const result = deliver(build(), 'pc1', packet('192.168.1.10', '10.0.0.20'));
    const ips = new Set(result.hops.map((h) => h.packet.ip.dstIp));
    const macs = new Set(result.hops.map((h) => h.packet.ethernet.dstMac));
    expect(ips.size).toBe(1);
    expect(macs.size).toBeGreaterThan(1);
  });

  it('TTL が尽きれば途中で落ちる', () => {
    const result = deliver(build(), 'pc1', packet('192.168.1.10', '10.0.0.20', { ttl: 2 }));
    expect(result.delivered).toBe(false);
    expect(result.error).toContain('Time to live exceeded');
  });

  it('同一セグメントなら1ホップ', () => {
    const t = topology(
      [host('a', [iface('eth0', '192.168.1.10', 24)]), host('b', [iface('eth0', '192.168.1.20', 24)], { listening: [80] })],
      [link('a:eth0', 'b:eth0')],
    );
    const result = deliver(t, 'a', packet('192.168.1.10', '192.168.1.20', { dstPort: 80 }));
    expect(result.delivered).toBe(true);
    expect(result.hops).toHaveLength(2);
  });
});

describe('届かない理由', () => {
  it('ケーブルが切れていれば、その場所が分かる', () => {
    const result = deliver(build({ linkUp: false }), 'pc1', packet('192.168.1.10', '10.0.0.20'));
    expect(result.delivered).toBe(false);
    expect(result.error).toContain('リンクが切れています');
    expect(result.hops[result.hops.length - 1]?.device).toBe('r1');
  });

  it('経路が無ければ unreachable', () => {
    const result = deliver(build({ route: false }), 'pc1', packet('192.168.1.10', '10.0.0.20'));
    expect(result.error).toContain('Network is unreachable');
  });

  it('ファイアウォールで塞がれていれば、届いた上で拒否される', () => {
    const result = deliver(build({ blocked: [80] }), 'pc1', packet('192.168.1.10', '10.0.0.20', { dstPort: 80 }));
    expect(result.delivered).toBe(false);
    expect(result.error).toContain('ファイアウォール');
    expect(result.hops[result.hops.length - 1]?.device).toBe('web');
  });

  it('待ち受けていなければ Connection refused', () => {
    const result = deliver(build({ listening: [443] }), 'pc1', packet('192.168.1.10', '10.0.0.20', { dstPort: 80 }));
    expect(result.error).toContain('Connection refused');
  });

  it('ICMP は待ち受けが無くても届く（ping は通るが curl は失敗する）', () => {
    const t = build({ listening: [] });
    const ping = deliver(t, 'pc1', packet('192.168.1.10', '10.0.0.20', { protocol: 'icmp' }));
    const curl = deliver(t, 'pc1', packet('192.168.1.10', '10.0.0.20', { dstPort: 80 }));
    expect(ping.delivered).toBe(true);
    expect(curl.delivered).toBe(false);
  });
});

describe('補助', () => {
  it('自分の IP かを判定する', () => {
    const device = host('a', [iface('eth0', '10.0.0.1', 24)]);
    expect(ownsIp(device, '10.0.0.1')).toBe(true);
    expect(ownsIp(device, '10.0.0.2')).toBe(false);
  });
});
