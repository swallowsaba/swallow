import { motion } from 'framer-motion';
import { useMemo } from 'react';
import type { Link, Topology } from '@/engines/net/types';
import { useMotionEnabled } from '@/ui/motion';
import { useT } from '@/i18n/useT';
import { linkIsUp, netCommands, type RunCommand } from './commands';

interface Props {
  net: Topology | null;
  /** いま自分がいる機器 */
  self: string;
  /** 図の操作をコマンドとして端末に流す。無ければ見るだけの図になる */
  onCommand?: RunCommand;
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

interface Edge {
  from: Placed;
  to: Placed;
  up: boolean;
  link: Link;
}

/** ホップ順に並ぶよう、リンクを辿って左から配置する */
function layout(net: Topology): { nodes: Placed[]; edges: Edge[] } {
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
      return from && to ? { from, to, up: linkIsUp(net, link), link } : null;
    })
    .filter((e): e is Edge => e !== null);

  return { nodes, edges };
}

const center = (node: Placed): { x: number; y: number } => ({ x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 });

/**
 * ネットワークの構成図。
 * 機器を箱として並べ、リンクを線で結ぶ。切れているリンクは赤い破線になる。
 * 直前に送ったパケットは、実際に通った機器の順（deliver の hops）に線の上を流れる。
 * 届かなかったときは、止まった機器の上に × が出る。
 */
export function PacketFlow({ net, self, onCommand }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const placed = useMemo(() => (net === null ? null : layout(net)), [net]);

  if (net === null || placed === null) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">{t('viz.noNet')}</p>
          <p className="mt-2 text-sm text-ink-soft">
            {t('viz.noNetLead')}
          </p>
        </div>
      </div>
    );
  }

  // 直前のパケットが通った道筋
  const byName = new Map(placed.nodes.map((n) => [n.name, n]));
  const path = (net.trace?.path ?? []).map((name) => byName.get(name)).filter((n): n is Placed => n !== undefined);
  const tracePairs = new Set(path.slice(1).map((n, i) => `${path[i]?.name ?? ''}>${n.name}`));
  const packet =
    path.length === 0
      ? null
      : {
          xs: path.map((n) => center(n).x),
          ys: path.map((n) => center(n).y),
          delivered: net.trace?.delivered ?? false,
        };

  const width = Math.max(...placed.nodes.map((n) => n.x + NODE_W), 400) + 20;
  const height = Math.max(...placed.nodes.map((n) => n.y + NODE_H), 200) + 40;

  return (
    <div className="h-full overflow-auto p-4">
      {onCommand ? <p className="mb-2 text-xs text-ink-soft">{t('viz.clickHint')}</p> : null}
      <div className="relative" style={{ width, height }}>
        <svg className="absolute left-0 top-0" width={width} height={height}>
          {placed.edges.map((edge, i) => {
            const from = center(edge.from);
            const to = center(edge.to);
            const onPath =
              tracePairs.has(`${edge.from.name}>${edge.to.name}`) || tracePairs.has(`${edge.to.name}>${edge.from.name}`);
            const toggle = netCommands.toggleLink(net, edge.link, self);
            return (
              <g key={`edge-${String(i)}`}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={edge.up ? 'var(--wood)' : 'var(--bad)'}
                  strokeWidth={edge.up ? 8 : 5}
                  strokeDasharray={edge.up ? undefined : '10 8'}
                />
                {onPath && edge.up ? (
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--gold)" strokeWidth={3} />
                ) : null}
                {onCommand ? (
                  // 押しやすいよう、見えない太い線を重ねる
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="transparent"
                    strokeWidth={22}
                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                    onClick={() => {
                      onCommand(toggle);
                    }}
                  >
                    <title>{toggle}</title>
                  </line>
                ) : null}
              </g>
            );
          })}
          {packet !== null && animate ? (
            <motion.circle
              key={`packet-${String(net.trace?.id ?? 0)}`}
              r={9}
              fill="var(--gold)"
              stroke="var(--wood-dark)"
              strokeWidth={3}
              initial={{ cx: packet.xs[0], cy: packet.ys[0], opacity: 1 }}
              animate={{ cx: packet.xs, cy: packet.ys, opacity: packet.delivered ? [1, 1, 0] : 1 }}
              transition={{ duration: Math.max(0.6, 0.7 * (packet.xs.length - 1)), ease: 'linear' }}
              style={{ pointerEvents: 'none' }}
            />
          ) : null}
          {packet !== null && !packet.delivered ? (
            <text
              x={packet.xs[packet.xs.length - 1]}
              y={(packet.ys[packet.ys.length - 1] ?? 0) - NODE_H / 2 - 6}
              textAnchor="middle"
              fontSize={22}
              fontWeight={800}
              fill="var(--bad)"
              style={{ pointerEvents: 'none' }}
            >
              ×
            </text>
          ) : null}
        </svg>

        {placed.nodes.map((node) => {
          const isSelf = node.name === self;
          const ping = netCommands.pingTo(net, node.name);
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
                {/* 箱を押すと、いまいる機器からこの機器へ ping を打つ */}
                <button
                  type="button"
                  disabled={!onCommand || ping === null || isSelf}
                  aria-label={t('viz.pingTo', { name: node.name })}
                  title={ping ?? undefined}
                  className="block w-full text-left disabled:cursor-default"
                  onClick={() => {
                    if (ping !== null) onCommand?.(ping);
                  }}
                >
                  {node.ips.map((ip) => (
                    <span key={ip} className="block truncate font-mono text-xs">
                      {ip}
                    </span>
                  ))}
                </button>
                {isSelf ? (
                  <p className="mt-1 font-mono text-xs text-[var(--bad)]">
                    {t('viz.youAreHere')}
                  </p>
                ) : onCommand && node.kind !== 'switch' ? (
                  <button
                    type="button"
                    className="mt-1 border-2 border-wood-dark px-1 font-mono text-[11px]"
                    title={netCommands.operateOn(node.name)}
                    onClick={() => {
                      onCommand(netCommands.operateOn(node.name));
                    }}
                  >
                    {t('viz.operateHere')}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* キーボードでも抜き挿しできるよう、ケーブルの一覧も置く */}
      {onCommand && placed.edges.length > 0 ? (
        <div className="mt-4 border-4 border-wood-dark bg-cream p-3">
          <p className="text-sm font-bold">{t('viz.toggleLink')}</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {placed.edges.map((edge) => {
              const toggle = netCommands.toggleLink(net, edge.link, self);
              return (
                <li key={`${edge.link.a}-${edge.link.b}`}>
                  <button
                    type="button"
                    className={`border-2 px-2 py-0.5 font-mono text-xs ${
                      edge.up ? 'border-wood-dark' : 'border-[var(--bad)] text-[var(--bad)]'
                    }`}
                    title={toggle}
                    onClick={() => {
                      onCommand(toggle);
                    }}
                  >
                    {edge.link.a} – {edge.link.b} {edge.up ? '🔌' : '✂'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {net.dns.size > 0 ? (
        <div className="mt-4 border-4 border-wood-dark bg-cream p-3">
          <p className="text-sm font-bold">{t('viz.dns')}</p>
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
