import type { Topology } from '@/engines/net/types';
import { layoutNet, NODE_W, stoppedAt } from '@/visual/netModel';
import type { Scene, SceneItem, Translate } from './types';

/**
 * ネットワークの街（郵便網）。
 * ホスト = 家、ルータ = 郵便局、スイッチ = 交差点、リンク = 道路（切れていれば通行止め）、
 * IP = 住所の札、ファイアウォール = 検問、DNS = 電話帳局、直前に送ったパケット = 道を走る郵便車。
 */

const GAP = 7;

export function netScene(net: Topology | null, self: string, t: Translate): Scene {
  const legend = [
    { sample: 'solid' as const, name: t('scape.net.legend.house'), meaning: t('scape.net.legend.houseMeaning'), command: 'ip addr' },
    { sample: 'marker' as const, icon: '🏤', name: t('scape.net.legend.post'), meaning: t('scape.net.legend.postMeaning'), command: 'ip route' },
    { sample: 'road' as const, name: t('scape.net.legend.road'), meaning: t('scape.net.legend.roadMeaning'), command: 'ip link set <名前> up' },
    { sample: 'plan' as const, name: t('scape.net.legend.blocked'), meaning: t('scape.net.legend.blockedMeaning'), command: 'ip link set <名前> up' },
    { sample: 'link' as const, name: t('scape.net.legend.mail'), meaning: t('scape.net.legend.mailMeaning'), command: 'ping <宛先>' },
    { sample: 'marker' as const, icon: '🛂', name: t('scape.net.legend.checkpoint'), meaning: t('scape.net.legend.checkpointMeaning'), command: 'iptables -L' },
    { sample: 'marker' as const, icon: '📒', name: t('scape.net.legend.dns'), meaning: t('scape.net.legend.dnsMeaning'), command: 'nslookup <名前>' },
  ];
  if (net === null) {
    return {
      width: 16,
      height: 10,
      items: [{ type: 'plot', id: 'vacant', x: 2, y: 2, w: 10, d: 6, tone: 'muted', label: t('scape.net.vacant') }],
      stats: [],
      legend,
      empty: { title: t('scape.net.noNetTitle'), text: t('scape.net.noNet') },
      focus: { x: 7, y: 5 },
    };
  }
  const layout = layoutNet(net);
  const items: SceneItem[] = [];
  const tile = new Map(
    layout.nodes.map((n) => {
      const col = Math.round((n.x - 20) / (NODE_W + 90));
      const row = Math.round((n.y - 36) / 150);
      return [n.name, { x: 1 + col * GAP, y: 1 + row * GAP }];
    }),
  );

  // 道路（リンク）
  let blocked = 0;
  layout.edges.forEach((e, i) => {
    const a = tile.get(e.from.name);
    const b = tile.get(e.to.name);
    if (!a || !b) return;
    if (!e.up) blocked += 1;
    const cells: { x: number; y: number }[] = [];
    const ay = a.y + 3;
    const bx = b.x + 1;
    for (let x = Math.min(a.x + 1, bx); x <= Math.max(a.x + 1, bx); x += 1) cells.push({ x, y: ay });
    for (let y = Math.min(ay, b.y + 3); y <= Math.max(ay, b.y + 3); y += 1) cells.push({ x: bx, y });
    items.push({
      type: 'road',
      id: `link:${String(i)}`,
      cells,
      kind: e.up ? 'street' : 'blocked',
      info: {
        title: `${e.link.a} ⇄ ${e.link.b}`,
        kind: t('scape.net.roadKind'),
        lines: [e.up ? t('scape.net.roadUp') : t('scape.net.roadDown'), `MTU ${String(e.link.mtu)}`],
        next: e.up ? undefined : t('scape.net.roadNext'),
      },
    });
  });

  // 建物（機器）
  for (const node of layout.nodes) {
    const p = tile.get(node.name);
    const device = net.devices.get(node.name);
    if (!p || !device) continue;
    const kind = device.kind;
    const badges = [
      ...(node.name === self ? [{ icon: '🚩', tone: 'accent' as const }] : []),
      ...(device.blockedPorts.length > 0 ? [{ icon: '🛂', tone: 'warn' as const }] : []),
      ...(!node.up ? [{ icon: '🚫', tone: 'bad' as const }] : []),
    ];
    items.push({
      type: 'building',
      id: `device:${node.name}`,
      x: p.x,
      y: p.y,
      w: kind === 'switch' ? 2 : 2.5,
      d: kind === 'switch' ? 2 : 2.5,
      floors: kind === 'router' ? 2 : kind === 'switch' ? 1 : 2,
      style: node.up ? 'solid' : 'dark',
      color: kind === 'router' ? '#e05a47' : kind === 'switch' ? '#9aa4ad' : '#f2e4cf',
      roof: kind === 'router' ? 'hall' : kind === 'switch' ? 'flat' : 'gable',
      label: `${node.name}${node.ips[0] !== undefined ? ` ${node.ips[0]}` : ''}`,
      badges: badges.length > 0 ? badges : undefined,
      info: {
        title: node.name,
        kind: kind === 'router' ? t('scape.net.postKind') : kind === 'switch' ? t('scape.net.switchKind') : t('scape.net.houseKind'),
        lines: [
          ...node.ips.map((ip) => t('scape.net.address', { ip })),
          t('scape.net.routes', { n: device.routes.length }),
          ...(device.listening.length > 0 ? [t('scape.net.listening', { ports: device.listening.join(', ') })] : []),
          ...(device.blockedPorts.length > 0 ? [t('scape.net.blockedPorts', { ports: device.blockedPorts.join(', ') })] : []),
        ],
        next: node.name === self ? t('scape.net.selfNext') : t('scape.net.pingNext', { name: node.name }),
      },
    });
  }

  // 電話帳局（DNS）
  const maxX = Math.max(8, ...[...tile.values()].map((p) => p.x + 3));
  if (net.dns.size > 0) {
    items.push({
      type: 'marker',
      id: 'dns',
      x: maxX + 1,
      y: 1,
      icon: '📒',
      label: t('scape.net.dnsLabel', { n: net.dns.size }),
      tone: 'info',
      info: { title: t('scape.net.dnsLabel', { n: net.dns.size }), kind: t('scape.net.dnsKind'), lines: [...net.dns.entries()].slice(0, 6).map(([name, ip]) => `${name} → ${ip}`), next: t('scape.net.dnsNext') },
    });
  }

  // 郵便車（直前のパケット）
  const trace = net.trace;
  if (trace) {
    for (let i = 0; i < trace.path.length - 1; i += 1) {
      const a = tile.get(trace.path[i] ?? '');
      const b = tile.get(trace.path[i + 1] ?? '');
      if (!a || !b) continue;
      items.push({ type: 'link', id: `trace:${String(trace.id)}:${String(i)}`, from: { x: a.x + 1.2, y: a.y + 1.2 }, to: { x: b.x + 1.2, y: b.y + 1.2 }, style: 'solid', tone: trace.delivered ? 'ok' : 'bad', flow: true });
    }
    const stop = stoppedAt(trace);
    const at = stop === null ? undefined : tile.get(stop);
    if (at) {
      items.push({
        type: 'marker',
        id: 'trace:stop',
        x: at.x + 1,
        y: at.y - 0.5,
        icon: '✉️❌',
        label: trace.error ?? t('scape.net.undelivered'),
        tone: 'bad',
        info: { title: t('scape.net.undelivered'), kind: t('scape.net.mailKind'), lines: [trace.error ?? ''], next: t('scape.net.traceNext') },
      });
    }
  }

  const devices = [...net.devices.values()];
  return {
    width: maxX + 5,
    height: Math.max(8, ...[...tile.values()].map((p) => p.y + 5)),
    items,
    legend,
    stats: [
      { icon: '🏠', label: t('scape.net.stat.houses'), value: devices.filter((d) => d.kind === 'host').length },
      { icon: '🏤', label: t('scape.net.stat.posts'), value: devices.filter((d) => d.kind === 'router').length },
      { icon: '🔀', label: t('scape.net.stat.switches'), value: devices.filter((d) => d.kind === 'switch').length },
      { icon: '🛣', label: t('scape.net.stat.roads'), value: net.links.length },
      { icon: '🚧', label: t('scape.net.stat.blocked'), value: blocked },
      { icon: '✉️', label: t('scape.net.stat.mail'), value: trace ? (trace.delivered ? t('scape.net.delivered') : t('scape.net.undelivered')) : '—' },
    ],
    focus: tile.get(self) ?? { x: 3, y: 3 },
  };
}
