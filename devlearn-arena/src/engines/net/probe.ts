import { packet } from './factory';
import { deliver } from './stack';
import type { DeliveryResult, Device, Topology } from './types';

/**
 * 網を確かめる道具（ping・traceroute・curl）と、判定の net が使う、行きと帰りの計算。純粋な関数。
 * 届いたかは、行き（送り元 → 宛先）と帰り（宛先 → 送り元）の両方が通るかで決める（返事が戻らなければ、送った側には届いていないのと同じ）
 */

const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;

/** 名前ならその答え、アドレスならそのまま。引けなければ null */
export function resolveName(net: Topology, target: string): string | null {
  if (IPV4.test(target)) return target;
  return net.dns.get(target.replace(/\.$/, '')) ?? null;
}

/** 機械の最初の口のアドレス（送り元に使う） */
export function addressOf(net: Topology, device: string): string {
  return net.devices.get(device)?.interfaces.find((i) => i.up && i.ip !== '')?.ip ?? '0.0.0.0';
}

/** そのアドレスを持つ機器 */
export function deviceAt(net: Topology, ip: string): Device | undefined {
  return [...net.devices.values()].find((d) => d.interfaces.some((i) => i.ip === ip));
}

export type Outcome =
  | { kind: 'ok'; result: DeliveryResult; routers: number }
  /** 待ち受けていない（拒否の返事が来る） */
  | { kind: 'refused'; result: DeliveryResult }
  /** 送り元が出口を知らない（送る前に分かる） */
  | { kind: 'no-route'; result: DeliveryResult }
  /** 途中のルータが宛先の網への経路を持たず、届かないと知らせてきた（ICMP の Destination Net Unreachable）。from はそのルータのアドレス */
  | { kind: 'net-unreachable'; result: DeliveryResult; from: string }
  /** 返事が来ない（途中で止まった・塞がれた・帰り道が無い） */
  | { kind: 'timeout'; result: DeliveryResult };

const routersOn = (net: Topology, r: DeliveryResult): number => r.hops.slice(1, -1).filter((h) => net.devices.get(h.device)?.kind === 'router').length;

/** 途中のルータが経路を持たずに止めた時の、そのルータの入ってきた口のアドレス（送り元へ知らせが戻れる時だけ） */
function unreachableFrom(net: Topology, go: DeliveryResult, src: string): string | null {
  if (go.hops.length <= 1 || !(go.error ?? '').startsWith('Network is unreachable')) return null;
  const last = go.hops[go.hops.length - 1];
  if (!last) return null;
  const ip = net.devices.get(last.device)?.interfaces.find((i) => i.mac === last.packet.ethernet.dstMac)?.ip;
  return ip !== undefined && deliver(net, last.device, packet(ip, src, { protocol: 'icmp', established: true })).delivered ? ip : null;
}

/** 行きと帰り。port を書かなければ ping（ICMP） */
export function roundTrip(net: Topology, from: string, dstIp: string, port?: number): Outcome {
  const src = addressOf(net, from);
  const go = deliver(net, from, packet(src, dstIp, port === undefined ? { protocol: 'icmp' } : { dstPort: port }));
  if (!go.delivered) {
    if (go.hops.length <= 1 && (go.error ?? '').startsWith('Network is unreachable')) return { kind: 'no-route', result: go };
    const router = unreachableFrom(net, go, src);
    if (router !== null) return { kind: 'net-unreachable', result: go, from: router };
    const last = go.hops[go.hops.length - 1]?.device;
    // 拒否の返事は、宛先まで行けて、宛先から送り元へ戻れる時だけ届く
    if ((go.error ?? '').startsWith('Connection refused') && last !== undefined && deliver(net, last, packet(dstIp, src, { protocol: 'icmp', established: true })).delivered) {
      return { kind: 'refused', result: go };
    }
    return { kind: 'timeout', result: go };
  }
  const target = go.hops[go.hops.length - 1]?.device ?? '';
  const back = deliver(net, target, packet(dstIp, src, { protocol: 'icmp', established: true }));
  return back.delivered ? { kind: 'ok', result: go, routers: routersOn(net, go) } : { kind: 'timeout', result: go };
}

/** 機械の最初の口の MTU */
export function mtuOf(net: Topology, device: string): number {
  return net.devices.get(device)?.interfaces.find((i) => i.up && i.ip !== '')?.mtu ?? 1500;
}

export type SizedProbe =
  | { kind: 'ok' }
  /** 途中の機器が、分割禁止の荷物を上限の小さい区間へ送れなかった。from はその機器の入ってきた口のアドレス */
  | { kind: 'too-big'; from: string; mtu: number; device: string }
  | { kind: 'lost' };

/** 分割を禁じた大きさ size の荷物を片道送る（ping -M do・tracepath）。届いた機器は問わない */
export function sizedProbe(net: Topology, from: string, dstIp: string, size: number): SizedProbe {
  const src = addressOf(net, from);
  const go = deliver(net, from, packet(src, dstIp, { protocol: 'icmp', size, dontFragment: true }));
  if (go.delivered) return { kind: 'ok' };
  const m = /^Frag needed and DF set \(mtu = (\d+)\): ([^:]+):/.exec(go.error ?? '');
  if (!m) return { kind: 'lost' };
  const last = go.hops[go.hops.length - 1];
  const device = net.devices.get(m[2] ?? '');
  const ip = device?.interfaces.find((i) => i.mac === last?.packet.ethernet.dstMac)?.ip ?? addressOf(net, m[2] ?? '');
  return { kind: 'too-big', from: ip, mtu: Number(m[1]), device: m[2] ?? '' };
}

/**
 * 大きな返事が戻るか。TCP の 1 つの荷物は、両端の口の小さいほうの上限まで（接続の時に伝える MSS）。
 * 本物の TCP の荷物は分割を禁じているので、途中に上限の小さい区間があり、知らせ（ICMP）が送り手に届かなければ、ここで消え続ける
 */
export function replyPasses(net: Topology, from: string, server: string, dstIp: string, bytes: number): boolean {
  const size = Math.min(bytes + 40, mtuOf(net, from), mtuOf(net, server));
  return deliver(net, server, packet(dstIp, addressOf(net, from), { protocol: 'icmp', size, dontFragment: true, established: true })).delivered;
}

/** 往復の時間（ms）。通るルータの数で決める（同じ網からは同じ値） */
export const rttOf = (routers: number, seq = 1): string => (0.4 + routers * 0.6 + (seq - 1) * 0.1).toFixed(1);

/**
 * traceroute の各段: 答えた機器のアドレス、答えない・届かない段は null。max 段まで。宛先に着いたら、そこで終わる。
 * 段の機器が答えるのは、その機器から送り元へ返事が戻れる時だけ
 */
export function traceHops(net: Topology, from: string, dstIp: string, max: number): { hops: (string | null)[]; reached: boolean; netUnreachable?: boolean } {
  const src = addressOf(net, from);
  const go = deliver(net, from, packet(src, dstIp, { protocol: 'icmp' }));
  const l3 = go.hops.slice(1).filter((h) => net.devices.get(h.device)?.kind !== 'switch');
  const hops: (string | null)[] = [];
  for (const h of l3) {
    if (hops.length >= max) break;
    const d = net.devices.get(h.device);
    const isTarget = d?.interfaces.some((i) => i.ip === dstIp) === true;
    if (isTarget && !go.delivered) break;
    // 入ってきた口のアドレス（宛先なら宛先のアドレス）
    const ip = isTarget ? dstIp : (d?.interfaces.find((i) => i.mac === h.packet.ethernet.dstMac)?.ip ?? null);
    const answers = ip !== null && !d?.silent && deliver(net, h.device, packet(ip, src, { protocol: 'icmp', established: true })).delivered;
    hops.push(answers ? ip : null);
    if (isTarget) return { hops, reached: true };
    // 経路を持たないルータは、本物と同じく !N（網に届かない）と知らせ、そこで終わる
    if (answers && h === go.hops[go.hops.length - 1] && unreachableFrom(net, go, src) !== null) return { hops, reached: false, netUnreachable: true };
  }
  while (hops.length < max) hops.push(null);
  return { hops, reached: false };
}
