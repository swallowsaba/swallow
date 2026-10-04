import { describe, expect, it } from 'vitest';
import { packet } from './factory';
import { buildNetwork, networkSetupSchema, type NetworkSetup } from './spec';
import { deliver } from './stack';

/** 家（pc）→ r1 → r2 → サーバ、の網。r2 とサーバの間は、切れた状態から書ける */
const office = (down = false): NetworkSetup => networkSetupSchema.parse({
  self: 'pc',
  devices: [
    { name: 'pc', addrs: ['10.0.1.10/24'], gateway: '10.0.1.1' },
    { name: 'r1', kind: 'router', addrs: ['10.0.1.1/24', '10.0.12.1/30'], routes: [{ to: '192.0.2.0/24', via: '10.0.12.2' }] },
    { name: 'r2', kind: 'router', addrs: ['10.0.12.2/30', '192.0.2.1/24'], routes: [{ to: '10.0.1.0/24', via: '10.0.12.1' }], silent: true },
    { name: 'shop', addrs: ['192.0.2.10/24'], gateway: '192.0.2.1', listen: [80] },
  ],
  links: [['pc', 'r1'], ['r1', 'r2'], down ? ['r2', 'shop', 'down'] : ['r2', 'shop']],
  dns: { 'shop.example': '192.0.2.10' },
});

describe('実戦の setup の網から、模擬の網を作る（buildNetwork）', () => {
  it('線の両端は、同じ網のアドレスを持つ口どうしでつなぐ。経路と出口（gateway）をたどって届く', () => {
    const net = buildNetwork(office());
    const r = deliver(net, 'pc', packet('10.0.1.10', '192.0.2.10', { dstPort: 80 }));
    expect(r.delivered).toBe(true);
    expect(r.hops.map((h) => h.device)).toEqual(['pc', 'r1', 'r2', 'shop']);
    expect(net.dns.get('shop.example')).toBe('192.0.2.10');
  });

  it('切れた線（down）の先へは届かない。待ち受けていないポートは拒否される', () => {
    expect(deliver(buildNetwork(office(true)), 'pc', packet('10.0.1.10', '192.0.2.10', { protocol: 'icmp' })).delivered).toBe(false);
    const refused = deliver(buildNetwork(office()), 'pc', packet('10.0.1.10', '192.0.2.10', { dstPort: 22 }));
    expect(refused.delivered).toBe(false);
    expect(refused.error).toContain('Connection refused');
  });

  it('同じ網の口が無い線・無い機器・出口と同じ網の口が無い機器は、内容の誤りとして投げる', () => {
    const bad = (patch: Partial<NetworkSetup>) => () => buildNetwork({ ...office(), ...patch });
    expect(bad({ links: [['pc', 'r2']] })).toThrow(/同じ網/);
    expect(bad({ links: [['pc', 'nope']] })).toThrow(/nope/);
    expect(bad({ devices: [{ name: 'pc', addrs: ['10.0.1.10/24'], gateway: '10.9.9.1' }] })).toThrow(/出口/);
  });

  it('同じ setup からは同じ網（MAC も同じ）', () => {
    const a = buildNetwork(office());
    const b = buildNetwork(office());
    expect(a.devices.get('r1')?.interfaces.map((i) => i.mac)).toEqual(b.devices.get('r1')?.interfaces.map((i) => i.mac));
  });
});
