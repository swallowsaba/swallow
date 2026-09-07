import { contains, parseCidr, sameNetwork } from './subnet';
import type { Device, DeliveryResult, HopRecord, Packet, Route, Topology } from './types';

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

function interfaceFor(device: Device, name: string) {
  return device.interfaces.find((i) => i.name === name);
}

/** 直結している相手を探す（リンクの向こう側） */
function neighbor(topology: Topology, deviceName: string, ifName: string): Device | null {
  const endpoint = `${deviceName}:${ifName}`;
  for (const link of topology.links) {
    if (!link.up) continue;
    const other = link.a === endpoint ? link.b : link.b === endpoint ? link.a : null;
    if (other === null) continue;
    const [name] = other.split(':');
    return topology.devices.get(name ?? '') ?? null;
  }
  return null;
}

function linkUp(topology: Topology, deviceName: string, ifName: string): boolean {
  const endpoint = `${deviceName}:${ifName}`;
  return topology.links.some((l) => (l.a === endpoint || l.b === endpoint) && l.up);
}

/**
 * パケットを宛先まで運ぶ。
 * ホップごとに TTL を減らし、MAC を書き換える。IP は変わらない。
 * 届かない場合は、どこで止まったかを理由付きで返す。
 */
export function deliver(topology: Topology, from: string, packet: Packet): DeliveryResult {
  const hops: HopRecord[] = [];
  let current = topology.devices.get(from);
  let inFlight: Packet = { ...packet, ip: { ...packet.ip }, ethernet: { ...packet.ethernet } };

  if (!current) return { hops, delivered: false, error: `機器がありません: ${from}` };

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    // 自分宛てか
    if (ownsIp(current, inFlight.ip.dstIp)) {
      const port = inFlight.transport?.dstPort ?? null;
      if (port !== null && current.blockedPorts.includes(port)) {
        hops.push({ device: current.name, packet: inFlight, note: `ファイアウォールで拒否 (port ${String(port)})` });
        return { hops, delivered: false, error: `ポート ${String(port)} はファイアウォールで塞がれています` };
      }
      if (port !== null && !current.listening.includes(port) && inFlight.ip.protocol !== 'icmp') {
        hops.push({ device: current.name, packet: inFlight, note: `待ち受けていない (port ${String(port)})` });
        return { hops, delivered: false, error: `Connection refused: ${inFlight.ip.dstIp}:${String(port)}` };
      }
      hops.push({ device: current.name, packet: inFlight, note: '宛先に到着' });
      return { hops, delivered: true, error: null };
    }

    // 同じセグメントに宛先がいるか
    const direct = current.interfaces.find(
      (i) => i.up && sameNetwork(i.ip, inFlight.ip.dstIp, i.prefix),
    );
    const route = direct
      ? ({ destination: i2cidr(direct.ip, direct.prefix), via: null, dev: direct.name } satisfies Route)
      : selectRoute(current.routes, inFlight.ip.dstIp);

    if (!route) {
      hops.push({ device: current.name, packet: inFlight, note: '経路が無い' });
      return { hops, delivered: false, error: `Network is unreachable: ${inFlight.ip.dstIp}` };
    }

    const out = interfaceFor(current, route.dev);
    if (!out || !out.up || !linkUp(topology, current.name, route.dev)) {
      hops.push({ device: current.name, packet: inFlight, note: `${route.dev} が落ちている` });
      return { hops, delivered: false, error: `リンクが切れています: ${current.name}:${route.dev}` };
    }

    const next = neighbor(topology, current.name, route.dev);
    if (!next) {
      hops.push({ device: current.name, packet: inFlight, note: '接続先がない' });
      return { hops, delivered: false, error: `${current.name}:${route.dev} の先に機器がありません` };
    }

    hops.push({
      device: current.name,
      packet: inFlight,
      note: hop === 0 ? '送出' : `転送 → ${next.name}`,
    });

    // ホップごとに TTL を減らし、MAC を書き換える。IP は変わらない
    const ttl = inFlight.ip.ttl - 1;
    if (ttl <= 0) {
      return { hops, delivered: false, error: `Time to live exceeded (${current.name})` };
    }
    const nextIn = next.interfaces.find((i) => i.up) ?? next.interfaces[0];
    inFlight = {
      ...inFlight,
      ip: { ...inFlight.ip, ttl },
      ethernet: { srcMac: out.mac, dstMac: nextIn?.mac ?? 'ff:ff:ff:ff:ff:ff' },
    };
    current = next;
  }

  return { hops, delivered: false, error: 'ホップ数が上限を超えました' };
}

function i2cidr(ip: string, prefix: number): string {
  return `${parseCidr(`${ip}/${String(prefix)}`).network}/${String(prefix)}`;
}
