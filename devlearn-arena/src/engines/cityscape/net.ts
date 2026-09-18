import { parseCidr } from '@/engines/net/subnet';
import type { Topology } from '@/engines/net/types';
import { layoutNet, stoppedAt } from '@/visual/netModel';
import { planTown, type PlanDistrict } from './plan';
import type { Scene, SceneItem, Translate } from './types';

/**
 * ネットワークの街（郵便網）。
 *
 * サブネット = 町（街区）、ホスト = 町の家、ルータ = 郵便局、スイッチ = 交差点、
 * リンク = 家と局をつなぐ道（切れていれば通行止め）、IP = 住所の札、
 * ファイアウォール = 検問、DNS = 電話帳局、直前に送ったパケット = 道を走る郵便車。
 *
 * 同じサブネットの家は同じ街区に集まるので、「どこまでが同じ町か」が地図の形で分かる。
 */

/** その機器が属する町（サブネット）。複数あるルータ・スイッチは郵便局街区に置く */
function wardOf(net: Topology, name: string): string | null {
  const device = net.devices.get(name);
  if (!device || device.kind !== 'host') return null;
  const first = device.interfaces.find((i) => i.ip !== null && i.prefix !== null);
  if (!first || first.ip === null || first.prefix === null) return null;
  try {
    return `${parseCidr(`${first.ip}/${String(first.prefix)}`).network}/${String(first.prefix)}`;
  } catch {
    return null;
  }
}

export function netScene(net: Topology | null, self: string, t: Translate): Scene {
  const legend = [
    { sample: 'solid' as const, name: t('scape.net.legend.house'), meaning: t('scape.net.legend.houseMeaning'), command: 'ip addr' },
    { sample: 'marker' as const, icon: '🏤', name: t('scape.net.legend.post'), meaning: t('scape.net.legend.postMeaning'), command: 'ip route' },
    { sample: 'link' as const, name: t('scape.net.legend.road'), meaning: t('scape.net.legend.roadMeaning'), command: 'ip link set <名前> up' },
    { sample: 'plan' as const, name: t('scape.net.legend.blocked'), meaning: t('scape.net.legend.blockedMeaning'), command: 'ip link set <名前> up' },
    { sample: 'link' as const, name: t('scape.net.legend.mail'), meaning: t('scape.net.legend.mailMeaning'), command: 'ping <宛先>' },
    { sample: 'marker' as const, icon: '🛂', name: t('scape.net.legend.checkpoint'), meaning: t('scape.net.legend.checkpointMeaning'), command: 'iptables -L' },
    { sample: 'marker' as const, icon: '📒', name: t('scape.net.legend.dns'), meaning: t('scape.net.legend.dnsMeaning'), command: 'nslookup <名前>' },
  ];
  if (net === null) {
    const plan = planTown([{ id: 'vacant', label: t('scape.net.vacant'), tone: 'muted', members: [], min: 6 }]);
    return {
      width: plan.width,
      height: plan.height,
      plan,
      items: [],
      stats: [],
      legend,
      empty: { title: t('scape.net.noNetTitle'), text: t('scape.net.noNet') },
      focus: { x: plan.width / 2, y: plan.height / 2 },
    };
  }
  const layout = layoutNet(net);
  const items: SceneItem[] = [];

  // 町（サブネット）ごとに家をまとめ、郵便局とスイッチは中央の街区に集める
  const byWard = new Map<string, string[]>();
  const hub: string[] = [];
  for (const node of layout.nodes) {
    const ward = wardOf(net, node.name);
    if (ward === null) {
      hub.push(node.name);
      continue;
    }
    const list = byWard.get(ward) ?? [];
    list.push(node.name);
    byWard.set(ward, list);
  }

  const districts: PlanDistrict[] = [
    ...(hub.length > 0 || net.dns.size > 0
      ? [
          {
            id: 'ward:post',
            label: t('scape.net.wardPost'),
            tone: 'accent' as const,
            members: [...hub.map((n) => `device:${n}`), ...(net.dns.size > 0 ? ['dns'] : [])],
            min: 2,
          },
        ]
      : []),
    ...[...byWard.entries()].map(([ward, names]): PlanDistrict => ({
      id: `ward:${ward}`,
      label: ward,
      tone: names.includes(self) ? 'accent' : 'info',
      members: names.map((n) => `device:${n}`),
      min: 2,
    })),
  ];
  const plan = planTown(districts);
  const center = (name: string) => {
    const lot = plan.lots.get(`device:${name}`);
    return lot ? { x: lot.x + lot.w / 2, y: lot.y + lot.d / 2 } : null;
  };

  // 建物（機器）
  for (const node of layout.nodes) {
    const lot = plan.lots.get(`device:${node.name}`);
    const device = net.devices.get(node.name);
    if (!lot || !device) continue;
    const kind = device.kind;
    const badges = [
      ...(node.name === self ? [{ icon: '🚩', tone: 'accent' as const }] : []),
      ...(device.blockedPorts.length > 0 ? [{ icon: '🛂', tone: 'warn' as const }] : []),
      ...(!node.up ? [{ icon: '🚫', tone: 'bad' as const }] : []),
    ];
    items.push({
      type: 'building',
      id: `device:${node.name}`,
      x: lot.x + (kind === 'switch' ? 0.35 : 0.15),
      y: lot.y + (kind === 'switch' ? 0.35 : 0.15),
      w: lot.w - (kind === 'switch' ? 0.7 : 0.3),
      d: lot.d - (kind === 'switch' ? 0.7 : 0.3),
      facing: lot.facing,
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

  // 道（リンク）。切れていれば通行止め
  let blocked = 0;
  layout.edges.forEach((e, i) => {
    const a = center(e.from.name);
    const b = center(e.to.name);
    if (!a || !b) return;
    if (!e.up) blocked += 1;
    items.push({
      type: 'link',
      id: `link:${String(i)}`,
      from: a,
      to: b,
      style: e.up ? 'solid' : 'dashed',
      tone: e.up ? 'muted' : 'bad',
      info: {
        title: `${e.link.a} ⇄ ${e.link.b}`,
        kind: t('scape.net.roadKind'),
        lines: [e.up ? t('scape.net.roadUp') : t('scape.net.roadDown'), `MTU ${String(e.link.mtu)}`],
        next: e.up ? undefined : t('scape.net.roadNext'),
      },
    });
  });

  // 電話帳局（DNS）
  const dnsLot = plan.lots.get('dns');
  if (net.dns.size > 0 && dnsLot) {
    items.push({
      type: 'marker',
      id: 'dns',
      x: dnsLot.x + dnsLot.w / 2,
      y: dnsLot.y + dnsLot.d / 2,
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
      const a = center(trace.path[i] ?? '');
      const b = center(trace.path[i + 1] ?? '');
      if (!a || !b) continue;
      items.push({ type: 'link', id: `trace:${String(trace.id)}:${String(i)}`, from: a, to: b, style: 'solid', tone: trace.delivered ? 'ok' : 'bad', flow: true });
    }
    const stop = stoppedAt(trace);
    const at = stop === null ? null : center(stop);
    if (at) {
      items.push({
        type: 'marker',
        id: 'trace:stop',
        x: at.x,
        y: at.y - 1.2,
        icon: '✉️❌',
        label: trace.error ?? t('scape.net.undelivered'),
        tone: 'bad',
        info: { title: t('scape.net.undelivered'), kind: t('scape.net.mailKind'), lines: [trace.error ?? ''], next: t('scape.net.traceNext') },
      });
    }
  }

  const devices = [...net.devices.values()];
  return {
    width: plan.width,
    height: plan.height,
    plan,
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
    focus: center(self) ?? { x: plan.width / 2, y: plan.height / 2 },
  };
}
