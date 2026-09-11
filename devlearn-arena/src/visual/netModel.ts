import type { Link, PacketTrace, Topology, TraceHop } from '@/engines/net/types';
import { linkIsUp } from './commands';

/**
 * ネットワークの図に出すものを、構成と直前の配送の記録から組み立てる。
 * 描画から切り離し、どこに箱が置かれるか・ホップごとに何が書き換わったかをテストで確かめる。
 */

export const NODE_W = 150;
export const NODE_H = 92;
const GAP_X = 90;
const ROW_H = 150;
const PER_ROW = 4;
const MARGIN = 20;

export interface PlacedDevice {
  name: string;
  kind: string;
  x: number;
  y: number;
  ips: string[];
  up: boolean;
}

export interface PlacedLink {
  from: PlacedDevice;
  to: PlacedDevice;
  up: boolean;
  link: Link;
}

export interface NetLayout {
  nodes: PlacedDevice[];
  edges: PlacedLink[];
  width: number;
  height: number;
}

/** ホップ順に並ぶよう、送り出す側（最初のホスト）からリンクを辿って左から置く。4台ごとに折り返す */
export function layoutNet(net: Topology): NetLayout {
  const names = [...net.devices.keys()];
  const order: string[] = [];
  const seen = new Set<string>();

  const neighborsOf = (name: string): string[] => {
    const out: string[] = [];
    for (const link of net.links) {
      const a = link.a.split(':')[0] ?? '';
      const b = link.b.split(':')[0] ?? '';
      if (a === name) out.push(b);
      if (b === name) out.push(a);
    }
    return out;
  };

  const start = names.find((n) => net.devices.get(n)?.kind === 'host') ?? names[0] ?? '';
  const queue = [start];
  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    order.push(name);
    queue.push(...neighborsOf(name).filter((n) => !seen.has(n)));
  }
  for (const name of names) if (!seen.has(name)) order.push(name);

  const nodes: PlacedDevice[] = order.map((name, i) => {
    const device = net.devices.get(name);
    const row = Math.floor(i / PER_ROW);
    // 折り返した段は右から左へ並べ、線が交差しないようにする
    const col = row % 2 === 0 ? i % PER_ROW : PER_ROW - 1 - (i % PER_ROW);
    return {
      name,
      kind: device?.kind ?? 'host',
      x: col * (NODE_W + GAP_X) + MARGIN,
      y: row * ROW_H + MARGIN + 16,
      ips: device?.interfaces.filter((iface) => iface.ip !== '').map((iface) => `${iface.ip}/${String(iface.prefix)}`) ?? [],
      up: device?.interfaces.some((iface) => iface.up) ?? true,
    };
  });

  const byName = new Map(nodes.map((n) => [n.name, n]));
  const edges = net.links
    .map((link) => {
      const from = byName.get(link.a.split(':')[0] ?? '');
      const to = byName.get(link.b.split(':')[0] ?? '');
      return from && to ? { from, to, up: linkIsUp(net, link), link } : null;
    })
    .filter((e): e is PlacedLink => e !== null);

  return {
    nodes,
    edges,
    width: Math.max(...nodes.map((n) => n.x + NODE_W), 400) + MARGIN,
    height: Math.max(...nodes.map((n) => n.y + NODE_H), 200) + MARGIN * 3,
  };
}

export const deviceCenter = (node: PlacedDevice): { x: number; y: number } => ({
  x: node.x + NODE_W / 2,
  y: node.y + NODE_H / 2,
});

/* ---------------- ヘッダの項目と、ホップごとの書き換わり ---------------- */

export type HeaderField = 'srcIp' | 'dstIp' | 'srcMac' | 'dstMac' | 'ttl' | 'protocol' | 'srcPort' | 'dstPort' | 'vlan';

/** 表に並べる順。層の外側（Ethernet）から内側（ポート）へ */
export const HEADER_FIELDS: readonly { field: HeaderField; label: string; layer: 'L2' | 'L3' | 'L4' }[] = [
  { field: 'srcMac', label: '送信元 MAC', layer: 'L2' },
  { field: 'dstMac', label: '宛先 MAC', layer: 'L2' },
  { field: 'vlan', label: 'VLAN', layer: 'L2' },
  { field: 'srcIp', label: '送信元 IP', layer: 'L3' },
  { field: 'dstIp', label: '宛先 IP', layer: 'L3' },
  { field: 'ttl', label: 'TTL', layer: 'L3' },
  { field: 'protocol', label: 'プロトコル', layer: 'L3' },
  { field: 'srcPort', label: '送信元ポート', layer: 'L4' },
  { field: 'dstPort', label: '宛先ポート', layer: 'L4' },
];

export function headerValue(hop: TraceHop, field: HeaderField): string {
  const value = hop[field];
  return value === null ? '—' : String(value);
}

/** 1つ前のホップと比べて、書き換わった項目。最初のホップは何も変わっていない */
export function changedFields(previous: TraceHop | undefined, hop: TraceHop): Set<HeaderField> {
  const out = new Set<HeaderField>();
  if (previous === undefined) return out;
  for (const { field } of HEADER_FIELDS) if (previous[field] !== hop[field]) out.add(field);
  return out;
}

/** 届かなかったとき、止まった機器の名前。届いたなら null */
export function stoppedAt(trace: PacketTrace | undefined): string | null {
  if (trace === undefined || trace.delivered) return null;
  return trace.hops[trace.hops.length - 1]?.device ?? trace.path[trace.path.length - 1] ?? null;
}
