import { describe, expect, it } from 'vitest';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { host, iface, link, resetMac, router, topology } from '@/engines/net/factory';
import type { Topology } from '@/engines/net/types';
import { click, mount } from './mountForTest';
import { changedFields, layoutNet, stoppedAt } from './netModel';
import { PacketFlow } from './PacketFlow';

function lab(): Topology {
  resetMac();
  return topology(
    [
      host('pc1', [iface('eth0', '192.168.1.10', 24)], {
        routes: [{ destination: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
      }),
      router('gw', [iface('eth0', '192.168.1.1', 24), iface('eth1', '10.0.0.1', 24)]),
      host('web', [iface('eth0', '10.0.0.20', 24)], {
        routes: [{ destination: '0.0.0.0/0', via: '10.0.0.1', dev: 'eth0' }],
        listening: [80],
      }),
    ],
    [link('pc1:eth0', 'gw:eth0'), link('gw:eth1', 'web:eth0')],
    { 'web.internal': '10.0.0.20' },
  );
}

function after(lines: readonly string[]): Topology {
  let session = createSession({ net: lab(), vars: { NET_SELF: 'pc1' }, files: { '/home/learner': null } });
  for (const line of lines) {
    session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
  }
  const net = session.state.net;
  if (net === null) throw new Error('ネットワークがありません');
  return net;
}

describe('配送の記録（deliver の hops をそのまま残す）', () => {
  it('ping のあと、通った機器の順とホップごとのヘッダが残る', () => {
    const net = after(['ping 10.0.0.20']);
    expect(net.trace?.hops.map((h) => h.device)).toEqual(['pc1', 'gw', 'web']);
    expect(net.trace?.delivered).toBe(true);
    expect(net.trace?.error).toBeNull();
  });

  it('ルータを越えると TTL が減り MAC が変わる。IP は変わらない', () => {
    const hops = after(['ping 10.0.0.20']).trace?.hops ?? [];
    const [first, second] = [hops[0], hops[1]];
    if (!first || !second) throw new Error('ホップが足りません');
    const changed = changedFields(first, second);
    expect(changed.has('ttl')).toBe(true);
    expect(changed.has('srcMac')).toBe(true);
    expect(changed.has('dstMac')).toBe(true);
    expect(changed.has('srcIp')).toBe(false);
    expect(changed.has('dstIp')).toBe(false);
    expect(second.ttl).toBe(first.ttl - 1);
    // 最初のホップは比べる相手がいない
    expect(changedFields(undefined, first).size).toBe(0);
  });

  it('届かなければ、止まった機器と理由が分かる', () => {
    const net = after(['curl http://10.0.0.20:8080/']);
    expect(net.trace?.delivered).toBe(false);
    expect(stoppedAt(net.trace)).toBe('web');
    expect(net.trace?.error).toContain('Connection refused');
    expect(stoppedAt(after(['ping 10.0.0.20']).trace)).toBeNull();
  });
});

describe('ネットワークの配置', () => {
  it('送り出す側から順に左から並べる', () => {
    const layout = layoutNet(lab());
    expect(layout.nodes.map((n) => n.name)).toEqual(['pc1', 'gw', 'web']);
    expect(layout.nodes.map((n) => n.x)).toEqual([...layout.nodes.map((n) => n.x)].sort((a, b) => a - b));
    expect(layout.edges.length).toBe(2);
  });

  it('切れたリンクは up=false になる（図では赤い破線）', () => {
    const net = after(['ip link set eth0 down']);
    const view = mount(<PacketFlow net={net} self="pc1" />);
    expect(view.querySelector('[data-link="pc1:eth0-gw:eth0"]')?.getAttribute('data-up')).toBe('false');
    expect(view.querySelector('[data-link="gw:eth1-web:eth0"]')?.getAttribute('data-up')).toBe('true');
  });
});

describe('パケットの図', () => {
  it('ホップを押すと、その時点のヘッダの全項目が出て、書き換わった項目に印が付く', () => {
    const view = mount(<PacketFlow net={after(['ping 10.0.0.20'])} self="pc1" />);
    click(view, 'button[data-hop="1"]');
    const table = view.querySelector('[data-testid="headers"]');
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll('tr').length).toBe(9);
    expect(table?.querySelector('[data-field="ttl"]')?.getAttribute('data-changed')).toBe('true');
    expect(table?.querySelector('[data-field="dstMac"]')?.getAttribute('data-changed')).toBe('true');
    expect(table?.querySelector('[data-field="dstIp"]')?.getAttribute('data-changed')).toBe('false');
  });

  it('パケットを押してもヘッダが出る', () => {
    const view = mount(<PacketFlow net={after(['ping 10.0.0.20'])} self="pc1" />);
    expect(view.querySelector('[data-testid="headers"]')).toBeNull();
    click(view, '[data-testid="packet"]');
    expect(view.querySelector('[data-testid="headers"]')).not.toBeNull();
  });

  it('届かなかったら、最後のホップで止まった機器が赤く光り、理由が出る', () => {
    const view = mount(<PacketFlow net={after(['curl http://10.0.0.20:8080/'])} self="pc1" />);
    click(view, 'button[data-hop="2"]');
    expect(view.querySelector('[data-device="web"]')?.getAttribute('data-stopped')).toBe('true');
    expect(view.querySelector('[data-testid="stop-reason"]')?.textContent).toContain('Connection refused');
  });
});
