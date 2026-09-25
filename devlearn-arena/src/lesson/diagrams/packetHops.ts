import { emptyTopology } from '@/engines/net/build';
import { packet } from '@/engines/net/factory';
import { deliver } from '@/engines/net/stack';
import type { Topology } from '@/engines/net/types';
import { applyCommand, boot, unknownMove, type Playground, type Sim } from './sim';

/**
 * `packet-hops`: 荷物（パケット）が機器を 1 つずつ渡る。
 *
 * 送るのは本物の `ping`、渡り方は本物の `deliver`。
 * 中継所（ルータ）を 1 つ越えるたびに TTL が 1 減るのは、図ではなく配送の計算がそうしている。
 * 線を押すと、その差し込み口を `ip link set ... down` で止める。
 */

/** 並び順（左から右）。pc1 から送る */
export const DEVICES = ['pc1', 'r1', 'r2', 'pc2'] as const;
const ADDRESS: Readonly<Record<string, string>> = {
  pc1: '10.0.1.1',
  r1: '10.0.1.254',
  r2: '10.0.2.2',
  pc2: '10.0.3.1',
};
/** 機器の間の線。どちらの差し込み口を止めるかは左側の機器で決める */
export const LINKS: readonly { from: string; ifname: string; to: string }[] = [
  { from: 'pc1', ifname: 'eth0', to: 'r1' },
  { from: 'r1', ifname: 'eth1', to: 'r2' },
  { from: 'r2', ifname: 'eth1', to: 'pc2' },
];

export interface PacketHopsView {
  links: { from: string; to: string; ifname: string; up: boolean }[];
  /** 直近に送った荷物。まだ送っていなければ null */
  trip: {
    to: string;
    /** 渡った機器と、そこに入った時点の TTL */
    hops: { device: string; ttl: number }[];
    delivered: boolean;
    /** 届かなかった理由 */
    error: string | null;
  } | null;
}

function netOf(sim: Sim): Topology {
  const net = sim.session.state.net;
  if (net === null) throw new Error('図解のネットワークがありません');
  return net;
}

function start(): Sim {
  return boot({ net: emptyTopology(), vars: { NET_SELF: 'pc1' }, files: { '/home/learner': null } }, [
    ...DEVICES.map((d) => `netlab add ${d.startsWith('r') ? 'router' : 'host'} ${d}`),
    'netlab link pc1:eth0 r1:eth0',
    'netlab link r1:eth1 r2:eth0',
    'netlab link r2:eth1 pc2:eth0',
    'ip addr add 10.0.1.1/24 dev eth0',
    'ip route add default via 10.0.1.254 dev eth0',
    'ip -n r1 addr add 10.0.1.254/24 dev eth0',
    'ip -n r1 addr add 10.0.2.1/24 dev eth1',
    'ip -n r1 route add 10.0.3.0/24 via 10.0.2.2 dev eth1',
    'ip -n r2 addr add 10.0.2.2/24 dev eth0',
    'ip -n r2 addr add 10.0.3.254/24 dev eth1',
    'ip -n r2 route add 10.0.1.0/24 via 10.0.2.1 dev eth0',
    'ip -n pc2 addr add 10.0.3.1/24 dev eth0',
    'ip -n pc2 route add default via 10.0.3.254 dev eth0',
    // はじめは r1 と r2 の間の差し込み口が止まっている。荷物は途中で止まる
    'ip -n r1 link set eth1 down',
  ]);
}

function ifaceUp(net: Topology, device: string, ifname: string): boolean {
  return net.devices.get(device)?.interfaces.find((i) => i.name === ifname)?.up ?? false;
}

function view(sim: Sim): PacketHopsView {
  const net = netOf(sim);
  const target = DEVICES[(sim.notes['target'] ?? 0) - 1];
  let trip: PacketHopsView['trip'] = null;
  if (target !== undefined) {
    const result = deliver(net, 'pc1', packet(ADDRESS['pc1'] ?? '', ADDRESS[target] ?? '', { protocol: 'icmp' }));
    trip = {
      to: target,
      hops: result.hops.map((h) => ({ device: h.device, ttl: h.packet.ip.ttl })),
      delivered: result.delivered,
      error: result.error,
    };
  }
  return {
    links: LINKS.map((l) => ({ ...l, up: ifaceUp(net, l.from, l.ifname) })),
    trip,
  };
}

function moves(sim: Sim) {
  const current = view(sim);
  return [
    ...DEVICES.filter((d) => d !== 'pc1').map((d) => ({
      id: `send:${d}`,
      label: `${d} へ送る`,
      command: `ping ${ADDRESS[d] ?? ''}`,
    })),
    ...current.links.map((l) => {
      const netns = l.from === 'pc1' ? '' : `-n ${l.from} `;
      return {
        id: `link:${l.from}:${l.ifname}`,
        label: l.up ? `${l.from} と ${l.to} の間を切る` : `${l.from} と ${l.to} の間をつなぐ`,
        command: `ip ${netns}link set ${l.ifname} ${l.up ? 'down' : 'up'}`,
      };
    }),
  ];
}

function apply(sim: Sim, moveId: string) {
  const found = moves(sim).find((m) => m.id === moveId);
  if (found === undefined) return unknownMove(sim, moveId);
  if (found.id.startsWith('send:')) {
    const to = found.id.slice('send:'.length);
    // 届かなくても ping は「届かなかった」と答えるだけ。図は止まった所を赤く描く
    const applied = applyCommand(sim, found.command);
    const base = applied.ok ? applied.sim : sim;
    const marked = { ...base, notes: { ...base.notes, target: DEVICES.findIndex((d) => d === to) + 1 } };
    const trip = view(marked).trip;
    return {
      sim: marked,
      command: found.command,
      ok: trip?.delivered === true,
      reason: trip?.delivered === true ? null : `途中で止まった: ${trip?.error ?? ''}`,
    };
  }
  return applyCommand(sim, found.command);
}

export const packetHops: Playground<PacketHopsView> = {
  id: 'packet-hops',
  goal: 'pc1 から pc2 まで荷物を届けよ',
  notes: [
    'パケットは荷札の付いた荷物。ルータは荷札の宛先を見て、次にどこへ渡すかを決める。',
    'ルータを 1 つ越えるたびに TTL（越えてよい残り回数）が 1 減る。',
    '線を押すと、その差し込み口を止めたりつないだりできる。切れた先へは届かない。',
  ],
  start,
  moves,
  apply,
  view,
  reached: (sim) => {
    const trip = view(sim).trip;
    return trip?.to === 'pc2' && trip.delivered;
  },
  solution: ['link:r1:eth1', 'send:pc2'],
};
