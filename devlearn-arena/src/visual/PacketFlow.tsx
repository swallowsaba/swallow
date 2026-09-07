import { motion } from 'framer-motion';
import { useMemo } from 'react';
import type { Topology } from '@/engines/net/types';
import { useMotionEnabled } from '@/ui/motion';

interface Props {
  net: Topology | null;
  /** いま自分がいる機器 */
  self: string;
}

const NODE_W = 150;
const NODE_H = 92;
const GAP_X = 90;
const ROW_H = 150;

interface Placed {
  name: string;
  kind: string;
  x: number;
  y: number;
  ips: string[];
  up: boolean;
}

/** ホップ順に並ぶよう、リンクを辿って左から配置する */
function layout(net: Topology): { nodes: Placed[]; edges: { from: Placed; to: Placed; up: boolean }[] } {
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

  const perRow = 4;
  const nodes: Placed[] = order.map((name, i) => {
    const device = net.devices.get(name);
    const row = Math.floor(i / perRow);
    const col = row % 2 === 0 ? i % perRow : perRow - 1 - (i % perRow);
    return {
      name,
      kind: device?.kind ?? 'host',
      x: col * (NODE_W + GAP_X) + 20,
      y: row * ROW_H + 20,
      ips: device?.interfaces.map((iface) => `${iface.ip}/${String(iface.prefix)}`) ?? [],
      up: device?.interfaces.some((iface) => iface.up) ?? true,
    };
  });

  const byName = new Map(nodes.map((n) => [n.name, n]));
  const edges = net.links
    .map((link) => {
      const from = byName.get(link.a.split(':')[0] ?? '');
      const to = byName.get(link.b.split(':')[0] ?? '');
      return from && to ? { from, to, up: link.up } : null;
    })
    .filter((e): e is { from: Placed; to: Placed; up: boolean } => e !== null);

  return { nodes, edges };
}

/**
 * ネットワークの構成図。
 * 機器を箱として並べ、リンクを線で結ぶ。切れているリンクは赤い破線になる。
 * 線の上を粒が流れ、通信が動いていることを示す。
 */
export function PacketFlow({ net, self }: Props) {
  const animate = useMotionEnabled();
  const placed = useMemo(() => (net === null ? null : layout(net)), [net]);

  if (net === null || placed === null) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">ネットワークがありません</p>
          <p className="mt-2 text-sm text-ink-soft">
            ネットワークの任務を選ぶと、ここに構成図が出ます。
          </p>
        </div>
      </div>
    );
  }

  const width = Math.max(...placed.nodes.map((n) => n.x + NODE_W), 400) + 20;
  const height = Math.max(...placed.nodes.map((n) => n.y + NODE_H), 200) + 40;

  return (
    <div className="h-full overflow-auto p-4">
      <div className="relative" style={{ width, height }}>
        <svg className="absolute left-0 top-0" width={width} height={height} aria-hidden>
          {placed.edges.map((edge, i) => {
            const x1 = edge.from.x + NODE_W / 2;
            const y1 = edge.from.y + NODE_H / 2;
            const x2 = edge.to.x + NODE_W / 2;
            const y2 = edge.to.y + NODE_H / 2;
            return (
              <g key={`edge-${String(i)}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={edge.up ? 'var(--wood)' : 'var(--bad)'}
                  strokeWidth={edge.up ? 8 : 5}
                  strokeDasharray={edge.up ? undefined : '10 8'}
                />
                {edge.up && animate ? (
                  <motion.circle
                    r={6}
                    fill="var(--gold)"
                    stroke="var(--wood-dark)"
                    strokeWidth={2}
                    animate={{ cx: [x1, x2], cy: [y1, y2] }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'linear' }}
                  />
                ) : null}
              </g>
            );
          })}
        </svg>

        {placed.nodes.map((node) => {
          const isSelf = node.name === self;
          return (
            <div
              key={node.name}
              className={`absolute border-4 ${isSelf ? 'border-[var(--bad)]' : 'border-wood-dark'}`}
              style={{
                left: node.x,
                top: node.y,
                width: NODE_W,
                backgroundColor: node.up ? 'var(--cream)' : 'var(--cream-dark)',
                boxShadow: '0 5px 0 rgba(0,0,0,0.2)',
              }}
            >
              <div
                className={`flex items-center gap-1 px-2 py-1 text-sm font-extrabold ${
                  isSelf ? 'bg-[var(--bad)] text-cream' : 'plate'
                }`}
              >
                <span aria-hidden>{node.kind === 'router' ? '🔀' : node.kind === 'switch' ? '🔗' : '💻'}</span>
                <span className="truncate">{node.name}</span>
              </div>
              <div className="px-2 py-1">
                {node.ips.map((ip) => (
                  <p key={ip} className="truncate font-mono text-xs">
                    {ip}
                  </p>
                ))}
                {isSelf ? <p className="mt-1 font-mono text-xs text-[var(--bad)]">ここにいる</p> : null}
              </div>
            </div>
          );
        })}
      </div>

      {net.dns.size > 0 ? (
        <div className="mt-4 border-4 border-wood-dark bg-cream p-3">
          <p className="text-sm font-bold">名前解決</p>
          <ul className="mt-1">
            {[...net.dns.entries()].map(([name, ip]) => (
              <li key={name} className="font-mono text-sm">
                {name} → {ip}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
