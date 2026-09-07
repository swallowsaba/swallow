import { BROADCAST_MAC } from './factory';
import { contains, parseCidr, sameNetwork } from './subnet';
import type {
  Device, DeliveryResult, HopRecord, Interface, Link, NatConfig, Packet, Route, Topology,
} from './types';

const MAX_HOPS = 16;

/** 最長プレフィックス一致。より具体的な経路が勝つ */
export function selectRoute(routes: readonly Route[], destination: string): Route | null {
  let best: Route | null = null;
  let bestPrefix = -1;
  for (const route of routes) {
    if (!contains(route.destination, destination)) continue;
    const prefix = parseCidr(route.destination).prefix;
    if (prefix > bestPrefix) {
      best = route;
      bestPrefix = prefix;
    }
  }
  return best;
}

/** その機器が持つ IP のどれかに一致するか */
export function ownsIp(device: Device, ip: string): boolean {
  return device.interfaces.some((i) => i.ip === ip);
}

function interfaceFor(device: Device, name: string): Interface | undefined {
  return device.interfaces.find((i) => i.name === name);
}

/** リンクの向こう側（機器名とポート名） */
function otherEnd(topology: Topology, deviceName: string, ifName: string): { link: Link; device: string; port: string } | null {
  const endpoint = `${deviceName}:${ifName}`;
  for (const link of topology.links) {
    const other = link.a === endpoint ? link.b : link.b === endpoint ? link.a : null;
    if (other === null) continue;
    const [name, portName] = other.split(':');
    if (name === undefined || portName === undefined) continue;
    return { link, device: name, port: portName };
  }
  return null;
}

function i2cidr(ip: string, prefix: number): string {
  return `${parseCidr(`${ip}/${String(prefix)}`).network}/${String(prefix)}`;
}

/** VLAN の突き合わせ。アクセスポートは自分の VLAN だけ、トランクは載せた VLAN だけ通す */
function vlanAllowed(port: Interface, vlan: number | null): boolean {
  if (port.trunkVlans.length > 0) return vlan !== null && port.trunkVlans.includes(vlan);
  if (port.vlan === null) return true;
  return vlan === null || vlan === port.vlan;
}

interface Walk {
  topology: Topology;
  hops: HopRecord[];
  learned: Map<string, Device>;
}

function deviceOf(walk: Walk, name: string): Device | undefined {
  return walk.learned.get(name) ?? walk.topology.devices.get(name);
}

function remember(walk: Walk, device: Device): void {
  walk.learned.set(device.name, device);
}

/**
 * スイッチを通す。
 *
 * 入ってきたポートと送信元 MAC を覚え（MAC 学習）、
 * 宛先 MAC を知っていればそのポートだけへ、知らなければ全ポートへ流す（フラッディング）。
 * VLAN が違うポートには出さない。
 */
function throughSwitch(
  walk: Walk,
  sw: Device,
  inPort: string,
  frame: Packet,
): { device: Device; port: string } | { error: string } {
  const learnedTable = { ...sw.macTable, [frame.ethernet.srcMac]: inPort };
  remember(walk, { ...sw, macTable: learnedTable });

  const incoming = interfaceFor(sw, inPort);
  const vlan = frame.ethernet.vlan ?? incoming?.vlan ?? null;

  const known = learnedTable[frame.ethernet.dstMac];
  const candidates = sw.interfaces
    .filter((p) => p.name !== inPort && p.up && vlanAllowed(p, vlan))
    .map((p) => p.name);

  const outPorts = known !== undefined && known !== inPort && candidates.includes(known)
    ? [known]
    : candidates;

  walk.hops.push({
    device: sw.name,
    packet: frame,
    note:
      known === undefined
        ? `MAC 未学習のためフラッディング（${String(outPorts.length)} ポート）`
        : `MAC 学習済み → ${known}`,
  });

  for (const out of outPorts) {
    const next = otherEnd(walk.topology, sw.name, out);
    if (next === null || !next.link.up) continue;
    const target = deviceOf(walk, next.device);
    if (target === undefined) continue;
    // 宛先 MAC を持つ機器か、ブロードキャストなら、そこへ渡す
    const owns = target.interfaces.some((i) => i.mac === frame.ethernet.dstMac);
    if (owns || frame.ethernet.dstMac === BROADCAST_MAC || target.kind === 'switch') {
      return { device: target, port: next.port };
    }
  }
  return {
    error:
      vlan === null
        ? `${sw.name} から先へ届きませんでした`
        : `${sw.name}: VLAN ${String(vlan)} に宛先がいません`,
  };
}

/**
 * ARP。次のホップの MAC を引く。
 * 知らなければブロードキャストで問い合わせ、答えを表に覚える。
 */
function resolveArp(
  walk: Walk,
  sender: Device,
  targetIp: string,
  viaPort: Interface,
): { mac: string; asked: boolean } | null {
  const cached = sender.arp[targetIp];
  if (cached !== undefined) return { mac: cached, asked: false };

  const next = otherEnd(walk.topology, sender.name, viaPort.name);
  if (next === null || !next.link.up) return null;

  // 直結の相手か、その先のスイッチにぶら下がっている機器を探す
  const seen = new Set<string>();
  const queue = [next.device];
  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    const device = deviceOf(walk, name);
    if (device === undefined) continue;
    const owner = device.interfaces.find((i) => i.ip === targetIp && i.up);
    if (owner !== undefined) {
      remember(walk, {
        ...(deviceOf(walk, sender.name) ?? sender),
        arp: { ...(deviceOf(walk, sender.name) ?? sender).arp, [targetIp]: owner.mac },
      });
      return { mac: owner.mac, asked: true };
    }
    if (device.kind === 'switch') {
      for (const p of device.interfaces) {
        const beyond = otherEnd(walk.topology, device.name, p.name);
        if (beyond !== null && beyond.link.up) queue.push(beyond.device);
      }
    }
  }
  return null;
}

/** NAT。内側から外へ出るときに送信元を書き換え、対応を覚える */
function translateOut(config: NatConfig, packet: Packet): { config: NatConfig; packet: Packet } {
  const transport = packet.transport;
  if (transport === null) return { config, packet };
  // 対応は5つ組（内側 IP・内側ポート・相手 IP・相手ポート）で1つ。本物と同じ粒度
  const existing = config.table.find(
    (e) =>
      e.insideIp === packet.ip.srcIp &&
      e.insidePort === transport.srcPort &&
      e.destinationIp === packet.ip.dstIp &&
      e.destinationPort === transport.dstPort,
  );
  const outsidePort = existing?.outsidePort ?? config.nextPort;
  const nextConfig: NatConfig =
    existing !== undefined
      ? config
      : {
          ...config,
          nextPort: config.nextPort + 1,
          table: [
            ...config.table,
            {
              insideIp: packet.ip.srcIp,
              insidePort: transport.srcPort,
              outsidePort,
              destinationIp: packet.ip.dstIp,
              destinationPort: transport.dstPort,
            },
          ],
        };
  return {
    config: nextConfig,
    packet: {
      ...packet,
      ip: { ...packet.ip, srcIp: config.outsideIp },
      transport: { ...transport, srcPort: outsidePort },
    },
  };
}

/**
 * パケットを宛先まで運ぶ。
 *
 * ホップごとに TTL を減らし、MAC を書き換える。IP は変わらない（NAT を通る場合を除く）。
 * 途中で学んだこと（ARP 表・MAC 表・NAT 表）は learned に載せて返す。
 * 届かない場合は、どこで止まったかを理由付きで返す。
 */
export function deliver(topology: Topology, from: string, packet: Packet): DeliveryResult {
  const walk: Walk = { topology, hops: [], learned: new Map() };
  let current = topology.devices.get(from);
  let inFlight: Packet = {
    ...packet,
    ip: { ...packet.ip },
    ethernet: { ...packet.ethernet },
    transport: packet.transport === null ? null : { ...packet.transport },
  };

  if (!current) {
    return { hops: [], delivered: false, error: `機器がありません: ${from}`, learned: walk.learned };
  }

  const fail = (error: string): DeliveryResult => ({
    hops: walk.hops,
    delivered: false,
    error,
    learned: walk.learned,
  });

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    current = deviceOf(walk, current.name) ?? current;

    // 自分宛てか
    if (ownsIp(current, inFlight.ip.dstIp)) {
      const port = inFlight.transport?.dstPort ?? null;
      if (port !== null && current.blockedPorts.includes(port)) {
        walk.hops.push({ device: current.name, packet: inFlight, note: `ファイアウォールで拒否 (port ${String(port)})` });
        return fail(`ポート ${String(port)} はファイアウォールで塞がれています`);
      }
      if (port !== null && !current.listening.includes(port) && inFlight.ip.protocol !== 'icmp') {
        walk.hops.push({ device: current.name, packet: inFlight, note: `待ち受けていない (port ${String(port)})` });
        return fail(`Connection refused: ${inFlight.ip.dstIp}:${String(port)}`);
      }
      walk.hops.push({ device: current.name, packet: inFlight, note: '宛先に到着' });
      return { hops: walk.hops, delivered: true, error: null, learned: walk.learned };
    }

    // 同じセグメントに宛先がいるか
    const direct = current.interfaces.find(
      (i) => i.up && i.ip !== '' && sameNetwork(i.ip, inFlight.ip.dstIp, i.prefix),
    );
    const route = direct
      ? ({ destination: i2cidr(direct.ip, direct.prefix), via: null, dev: direct.name } satisfies Route)
      : selectRoute(current.routes, inFlight.ip.dstIp);

    if (!route) {
      walk.hops.push({ device: current.name, packet: inFlight, note: '経路が無い' });
      return fail(`Network is unreachable: ${inFlight.ip.dstIp}`);
    }

    const out = interfaceFor(current, route.dev);
    const wire = otherEnd(topology, current.name, route.dev);
    if (!out || !out.up || wire === null || !wire.link.up) {
      walk.hops.push({ device: current.name, packet: inFlight, note: `${route.dev} が落ちている` });
      return fail(`リンクが切れています: ${current.name}:${route.dev}`);
    }

    // MTU。分割禁止なら、超えた時点で落として ICMP を返すのが本来の動き
    const mtu = Math.min(out.mtu, wire.link.mtu);
    if (inFlight.size > mtu) {
      walk.hops.push({
        device: current.name,
        packet: inFlight,
        note: `MTU 超過（${String(inFlight.size)} > ${String(mtu)}）`,
      });
      return fail(
        inFlight.ip.dontFragment
          ? `Frag needed and DF set (mtu = ${String(mtu)}): ${current.name}:${route.dev}`
          : `分割が必要ですが、この経路では扱えません (mtu = ${String(mtu)})`,
      );
    }

    // 次のホップの IP（直結なら宛先そのもの、そうでなければゲートウェイ）
    const nextHopIp = route.via ?? inFlight.ip.dstIp;
    const arp = resolveArp(walk, current, nextHopIp, out);
    if (arp === null) {
      walk.hops.push({ device: current.name, packet: inFlight, note: `ARP が返らない (${nextHopIp})` });
      return fail(`${nextHopIp} の MAC を解決できません（ARP 応答なし）`);
    }
    // NAT。内側から外へ出るときだけ書き換える
    let natNote = '';
    let outgoing = inFlight;
    if (current.nat !== null && contains(current.nat.insideCidr, inFlight.ip.srcIp)) {
      const translated = translateOut(current.nat, inFlight);
      if (translated.packet !== inFlight) {
        natNote = ` / NAT ${inFlight.ip.srcIp}:${String(inFlight.transport?.srcPort ?? 0)} → ${translated.packet.ip.srcIp}:${String(translated.packet.transport?.srcPort ?? 0)}`;
      }
      remember(walk, { ...current, nat: translated.config });
      outgoing = translated.packet;
    }

    const next0 = deviceOf(walk, wire.device);
    if (next0 === undefined) {
      walk.hops.push({ device: current.name, packet: inFlight, note: '接続先がない' });
      return fail(`${current.name}:${route.dev} の先に機器がありません`);
    }

    // 記録するのは「その機器に入ってきた時点」のパケット。書き換えはこの後に起きる
    walk.hops.push({
      device: current.name,
      packet: inFlight,
      note:
        `${hop === 0 ? '送出' : '転送'} → ${next0.name}` +
        (arp.asked ? ` / ARP 要求で ${nextHopIp} は ${arp.mac} と判明` : '') +
        natNote,
    });

    const ttl = outgoing.ip.ttl - 1;
    if (ttl <= 0) return fail(`Time to live exceeded (${current.name})`);

    inFlight = {
      ...outgoing,
      ip: { ...outgoing.ip, ttl },
      ethernet: {
        srcMac: out.mac,
        dstMac: arp.mac,
        vlan: out.trunkVlans.length > 0 ? (outgoing.ethernet.vlan ?? out.vlan) : null,
      },
    };

    let next = next0;

    // スイッチは L2 で通り抜ける。何段あっても TTL は減らない
    let inPort = wire.port;
    let guard = 0;
    while (next.kind === 'switch' && guard < MAX_HOPS) {
      guard += 1;
      const forwarded = throughSwitch(walk, next, inPort, inFlight);
      if ('error' in forwarded) return fail(forwarded.error);
      next = forwarded.device;
      inPort = forwarded.port;
    }

    current = next;
  }

  return fail('ホップ数が上限を超えました');
}
