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
  /** 返事が来ない（途中で止まった・塞がれた・帰り道が無い） */
  | { kind: 'timeout'; result: DeliveryResult };

const routersOn = (net: Topology, r: DeliveryResult): number => r.hops.slice(1, -1).filter((h) => net.devices.get(h.device)?.kind === 'router').length;

/** 行きと帰り。port を書かなければ ping（ICMP） */
export function roundTrip(net: Topology, from: string, dstIp: string, port?: number): Outcome {
  const src = addressOf(net, from);
  const go = deliver(net, from, packet(src, dstIp, port === undefined ? { protocol: 'icmp' } : { dstPort: port }));
  if (!go.delivered) {
    if (go.hops.length <= 1 && (go.error ?? '').startsWith('Network is unreachable')) return { kind: 'no-route', result: go };
    const last = go.hops[go.hops.length - 1]?.device;
    // 拒否の返事は、宛先まで行けて、宛先から送り元へ戻れる時だけ届く
    if ((go.error ?? '').startsWith('Connection refused') && last !== undefined && deliver(net, last, packet(dstIp, src, { protocol: 'icmp' })).delivered) {
      return { kind: 'refused', result: go };
    }
    return { kind: 'timeout', result: go };
  }
  const target = go.hops[go.hops.length - 1]?.device ?? '';
  const back = deliver(net, target, packet(dstIp, src, { protocol: 'icmp' }));
  return back.delivered ? { kind: 'ok', result: go, routers: routersOn(net, go) } : { kind: 'timeout', result: go };
}

/** 往復の時間（ms）。通るルータの数で決める（同じ網からは同じ値） */
export const rttOf = (routers: number, seq = 1): string => (0.4 + routers * 0.6 + (seq - 1) * 0.1).toFixed(1);

/**
 * traceroute の各段: 答えた機器のアドレス、答えない・届かない段は null。max 段まで。宛先に着いたら、そこで終わる。
 * 段の機器が答えるのは、その機器から送り元へ返事が戻れる時だけ
 */
export function traceHops(net: Topology, from: string, dstIp: string, max: number): { hops: (string | null)[]; reached: boolean } {
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
    const answers = ip !== null && !d?.silent && deliver(net, h.device, packet(ip, src, { protocol: 'icmp' })).delivered;
    hops.push(answers ? ip : null);
    if (isTarget) return { hops, reached: true };
  }
  while (hops.length < max) hops.push(null);
  return { hops, reached: false };
}
