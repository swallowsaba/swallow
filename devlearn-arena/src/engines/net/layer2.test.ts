import { beforeEach, describe, expect, it } from 'vitest';
import {
  host, iface, link, nat, packet, port, resetMac, router, switchDevice, topology,
} from './factory';
import { deliver } from './stack';
import type { Topology } from './types';

beforeEach(() => {
  resetMac();
});

/** pc1 ── sw1 ── pc2、同じセグメント */
function switched(vlans: { pc1?: number; pc2?: number } = {}): Topology {
  return topology(
    [
      host('pc1', [iface('eth0', '192.168.1.10', 24)], { listening: [80] }),
      host('pc2', [iface('eth0', '192.168.1.20', 24)], { listening: [80] }),
      switchDevice('sw1', [
        port('p1', { vlan: vlans.pc1 ?? null }),
        port('p2', { vlan: vlans.pc2 ?? null }),
      ]),
    ],
    [link('pc1:eth0', 'sw1:p1'), link('pc2:eth0', 'sw1:p2')],
  );
}

describe('ARP', () => {
  it('知らない相手の MAC は問い合わせて覚える', () => {
    const net = switched();
    const result = deliver(net, 'pc1', packet('192.168.1.10', '192.168.1.20'));
    expect(result.delivered).toBe(true);
    expect(result.learned.get('pc1')?.arp['192.168.1.20']).toBeDefined();
  });

  it('覚えた MAC は次から問い合わせない', () => {
    const net = switched();
    const first = deliver(net, 'pc1', packet('192.168.1.10', '192.168.1.20'));
    const learnedPc1 = first.learned.get('pc1');
    expect(learnedPc1).toBeDefined();
    if (!learnedPc1) return;
    const withArp: Topology = { ...net, devices: new Map([...net.devices, ['pc1', learnedPc1]]) };
    const second = deliver(withArp, 'pc1', packet('192.168.1.10', '192.168.1.20'));
    expect(second.hops[0]?.note).not.toContain('ARP 要求');
  });

  it('相手がいなければ MAC を解決できない', () => {
    const net = switched();
    const result = deliver(net, 'pc1', packet('192.168.1.10', '192.168.1.99'));
    expect(result.delivered).toBe(false);
    expect(result.error).toContain('ARP');
  });
});

describe('スイッチの MAC 学習', () => {
  it('最初は未学習なのでフラッディングする', () => {
    const net = switched();
    const result = deliver(net, 'pc1', packet('192.168.1.10', '192.168.1.20'));
    const swHop = result.hops.find((h) => h.device === 'sw1');
    expect(swHop?.note).toContain('フラッディング');
  });

  it('通ったフレームの送信元を覚える', () => {
    const net = switched();
    const result = deliver(net, 'pc1', packet('192.168.1.10', '192.168.1.20'));
    const table = result.learned.get('sw1')?.macTable ?? {};
    const pc1Mac = net.devices.get('pc1')?.interfaces[0]?.mac ?? '';
    expect(table[pc1Mac]).toBe('p1');
  });

  it('覚えたあとは、そのポートだけへ送る', () => {
    const net = switched();
    const first = deliver(net, 'pc1', packet('192.168.1.10', '192.168.1.20'));
    const devices = new Map([...net.devices, ...first.learned]);
    // 逆向きに送ると、pc1 の MAC は学習済みなので絞り込める
    const back = deliver({ ...net, devices }, 'pc2', packet('192.168.1.20', '192.168.1.10'));
    expect(back.hops.find((h) => h.device === 'sw1')?.note).toContain('学習済み');
  });
});

describe('VLAN', () => {
  it('同じ VLAN なら通る', () => {
    const net = switched({ pc1: 10, pc2: 10 });
    expect(deliver(net, 'pc1', packet('192.168.1.10', '192.168.1.20')).delivered).toBe(true);
  });

  it('VLAN が違えば、同じスイッチでも届かない', () => {
    const net = switched({ pc1: 10, pc2: 20 });
    const result = deliver(net, 'pc1', packet('192.168.1.10', '192.168.1.20'));
    expect(result.delivered).toBe(false);
    expect(result.error).toContain('VLAN');
  });
});

/** 内側 192.168.1.0/24 ── r1(NAT) ── 外側 203.0.113.0/24 */
function natted(): Topology {
  return topology(
    [
      host('pc1', [iface('eth0', '192.168.1.10', 24)], {
        routes: [{ destination: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
      }),
      router(
        'r1',
        [iface('eth0', '192.168.1.1', 24), iface('eth1', '203.0.113.1', 24)],
        [{ destination: '0.0.0.0/0', via: '203.0.113.2', dev: 'eth1' }],
        { nat: nat('192.168.1.0/24', '203.0.113.1') },
      ),
      host('web', [iface('eth0', '203.0.113.2', 24)], { listening: [80] }),
    ],
    [link('pc1:eth0', 'r1:eth0'), link('r1:eth1', 'web:eth0')],
  );
}

describe('NAT / PAT', () => {
  it('外へ出るときに送信元が書き換わる', () => {
    const net = natted();
    const result = deliver(net, 'pc1', packet('192.168.1.10', '203.0.113.2', { dstPort: 80 }));
    expect(result.delivered).toBe(true);
    expect(result.hops[result.hops.length - 1]?.packet.ip.srcIp).toBe('203.0.113.1');
  });

  it('変換表に対応が残る', () => {
    const net = natted();
    const result = deliver(net, 'pc1', packet('192.168.1.10', '203.0.113.2', { srcPort: 40001, dstPort: 80 }));
    const table = result.learned.get('r1')?.nat?.table ?? [];
    expect(table).toHaveLength(1);
    expect(table[0]?.insideIp).toBe('192.168.1.10');
    expect(table[0]?.insidePort).toBe(40001);
  });

  it('同じ送信元ポートの2本目は、別の外側ポートを使う（PAT）', () => {
    const net = natted();
    const first = deliver(net, 'pc1', packet('192.168.1.10', '203.0.113.2', { srcPort: 40001, dstPort: 80 }));
    const devices = new Map([...net.devices, ...first.learned]);
    const second = deliver(
      { ...net, devices },
      'pc1',
      packet('192.168.1.10', '203.0.113.2', { srcPort: 40002, dstPort: 80 }),
    );
    const table = second.learned.get('r1')?.nat?.table ?? [];
    expect(table).toHaveLength(2);
    expect(table[0]?.outsidePort).not.toBe(table[1]?.outsidePort);
  });
});

describe('MTU', () => {
  it('MTU に収まれば通る', () => {
    const net = natted();
    expect(deliver(net, 'pc1', packet('192.168.1.10', '203.0.113.2', { size: 1400 })).delivered).toBe(true);
  });

  it('狭い区間で落ちる', () => {
    const base = natted();
    const links = base.links.map((l) =>
      l.a === 'r1:eth1' ? { ...l, mtu: 1400 } : l,
    );
    const result = deliver({ ...base, links }, 'pc1', packet('192.168.1.10', '203.0.113.2', { size: 1500 }));
    expect(result.delivered).toBe(false);
    expect(result.error).toContain('1400');
  });

  it('DF が立っていれば、本物と同じ理由になる', () => {
    const base = natted();
    const links = base.links.map((l) => (l.a === 'r1:eth1' ? { ...l, mtu: 1400 } : l));
    const result = deliver(
      { ...base, links },
      'pc1',
      packet('192.168.1.10', '203.0.113.2', { size: 1500, dontFragment: true }),
    );
    expect(result.error).toContain('Frag needed and DF set');
  });
});
