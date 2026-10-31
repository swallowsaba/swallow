import { compress, expand, slaac } from '@/engines/net/ipv6';
import { roundTrip, rttOf, addressOf } from '@/engines/net/probe';
import type { Device, Topology } from '@/engines/net/types';
import type { CommandResult } from '../registry';
import { fromLines } from './args';

/**
 * IPv6 の端の道具（net.a.04）: ip -6・ping -6・curl -6。
 * 模擬の網は同じ線の上で 4 と 6 の両方を通す（デュアルスタック）。線と経路は 4 の網の計算をそのまま使い、住所だけを 6 で持つ
 */

const addrOnly = (cidr: string): string => cidr.split('/')[0] ?? cidr;

function sameAddr(a: string, b: string): boolean {
  try {
    return expand(a) === expand(b);
  } catch {
    return false;
  }
}

/** その 6 の住所を持つ機器 */
function owner(net: Topology, addr: string): Device | undefined {
  return [...net.devices.values()].find((d) => d.interfaces.some((i) => (i.ip6 ?? []).some((x) => sameAddr(addrOnly(x), addr))));
}

/** 名前の 6 の住所（AAAA）。住所そのものならそのまま。無ければ null */
function resolve6(net: Topology, target: string): string | null {
  if (target.includes(':')) return target;
  const name = target.replace(/\.$/, '').toLowerCase();
  return (net.records ?? []).find((r) => r.name.toLowerCase() === name && r.type === 'AAAA')?.value ?? null;
}

const hasGlobal = (d: Device | undefined): boolean => d?.interfaces.some((i) => (i.ip6 ?? []).length > 0) === true;

/** 判定の net の addr6: その機器に、その住所がある */
export function has6(net: Topology, device: string, addr: string): boolean {
  return net.devices.get(device)?.interfaces.some((i) => (i.ip6 ?? []).some((x) => sameAddr(addrOnly(x), addr))) === true;
}

type Reached = { kind: 'no-route' } | { kind: 'no-answer' } | { kind: 'refused' } | { kind: 'ok'; to: Device };

function attempt(net: Topology, from: string, addr: string, port?: number): Reached {
  if (!hasGlobal(net.devices.get(from))) return { kind: 'no-route' };
  const to = owner(net, addr);
  if (!to) return { kind: 'no-answer' };
  const r = roundTrip(net, from, addressOf(net, to.name), port);
  if (r.kind === 'refused') return { kind: 'refused' };
  return r.kind === 'ok' ? { kind: 'ok', to } : { kind: 'no-answer' };
}

/** 判定の net の reach6: 名前か住所に 6 で届く */
export function reach6(net: Topology, from: string, target: string, port?: number): boolean {
  const addr = resolve6(net, target);
  return addr !== null && attempt(net, from, addr, port).kind === 'ok';
}

export function ping6(net: Topology, from: string, target: string, count: number): CommandResult {
  const addr = resolve6(net, target);
  if (addr === null) return { stderr: `ping: ${target}: Name or service not known\n`, code: 2 };
  const r = attempt(net, from, addr);
  if (r.kind === 'no-route') return { stderr: 'ping: connect: Network is unreachable\n', code: 2 };
  const n = Math.max(1, Math.min(10, count));
  const shown = compress(addr);
  const head = target.includes(':') ? `PING ${target}(${shown}) 56 data bytes` : `PING ${target}(${shown} (${shown})) 56 data bytes`;
  const stats = (got: number) => [`--- ${target} ping statistics ---`, `${String(n)} packets transmitted, ${String(got)} received, ${got === n ? '0' : '100'}% packet loss`];
  if (r.kind !== 'ok') return { stdout: fromLines([head, '', ...stats(0)]), code: 1 };
  const replies = Array.from({ length: n }, (_, i) => `64 bytes from ${shown}: icmp_seq=${String(i + 1)} ttl=64 time=${rttOf(0, i + 1)} ms`);
  return { stdout: fromLines([head, ...replies, '', ...stats(n)]) };
}

export function curl6(net: Topology, from: string, url: string): CommandResult {
  const m = /^(?:https?:\/\/)?(\[[^\]]+\]|[^/:]+)(?::(\d+))?(\/.*)?$/.exec(url);
  const host = (m?.[1] ?? url).replace(/[[\]]/g, '');
  const port = Number(m?.[2] ?? (url.startsWith('https') ? 443 : 80));
  const addr = resolve6(net, host);
  if (addr === null) return { stderr: `curl: (6) Could not resolve host: ${host}\n`, code: 6 };
  const r = attempt(net, from, addr, port);
  if (r.kind === 'ok') return { stdout: `${r.to.body ?? `<html><body>It works: ${host}</body></html>`}\n` };
  const text = `curl: (7) Failed to connect to ${host} port ${String(port)}: ${r.kind === 'refused' ? 'Connection refused' : r.kind === 'no-route' ? 'Network is unreachable' : 'No route to host'}\n`;
  return { stderr: text, code: 7 };
}

const withIfaces = (net: Topology, me: Device, interfaces: Device['interfaces']): Topology => ({ ...net, devices: new Map([...net.devices, [me.name, { ...me, interfaces }]]) });

/** ip -6 addr・ip -6 route と、住所に : がある ip addr add・del。argv は家族の旗を除いた物 */
export function ip6Command(net: Topology, me: Device, argv: readonly string[]): CommandResult {
  const what = argv[1] ?? 'addr';
  const verb = argv[2] ?? 'show';
  const dev = argv[argv.indexOf('dev') + 1];
  if (what === 'route' || what === 'r') {
    const nets = me.interfaces.flatMap((i) => (i.ip6 ?? []).map((a) => `${networkOf(a)} dev ${i.name} proto kernel metric 256`));
    return { stdout: fromLines([...nets, ...me.interfaces.filter((i) => i.up).map((i) => `fe80::/64 dev ${i.name} proto kernel metric 256`)]) };
  }
  if (!['addr', 'address', 'a'].includes(what)) return { stderr: `Object "${what}" is unknown, try "ip help".\n`, code: 255 };
  if (verb === 'show' || verb === 'list' || verb === 'ls') {
    const named = argv.includes('dev') ? dev : argv[3];
    const shown = named === undefined ? me.interfaces : me.interfaces.filter((i) => i.name === named);
    if (named !== undefined && shown.length === 0) return { stderr: `Device "${named}" does not exist.\n`, code: 1 };
    return {
      stdout: fromLines(shown.flatMap((i) => [
        `${String(me.interfaces.indexOf(i) + 2)}: ${i.name}: <${i.up ? 'BROADCAST,MULTICAST,UP,LOWER_UP' : 'BROADCAST,MULTICAST'}> mtu ${String(i.mtu)}`,
        ...(i.ip6 ?? []).map((a) => `    inet6 ${a} scope global`),
        `    inet6 ${slaac('fe80::/64', i.mac)}/64 scope link`,
      ])),
    };
  }
  const cidr = argv[3];
  if (verb !== 'add' && verb !== 'del') return { stderr: `Command "${verb}" is unknown, try "ip address help".\n`, code: 255 };
  if (cidr === undefined || !argv.includes('dev') || dev === undefined) return { stderr: 'Not enough information: "dev" argument is required.\n', code: 1 };
  if (!/^[0-9a-fA-F:]*:[0-9a-fA-F:]*\/\d+$/.test(cidr)) return { stderr: `Error: inet6 prefix is expected rather than "${cidr}".\n`, code: 1 };
  const iface = me.interfaces.find((i) => i.name === dev);
  if (!iface) return { stderr: `Cannot find device "${dev}"\n`, code: 1 };
  const held = iface.ip6 ?? [];
  const same = held.some((a) => sameAddr(addrOnly(a), addrOnly(cidr)));
  if (verb === 'add' && same) return { stderr: 'RTNETLINK answers: File exists\n', code: 2 };
  if (verb === 'del' && !same) return { stderr: 'RTNETLINK answers: Cannot assign requested address\n', code: 2 };
  const next = verb === 'add' ? [...held, cidr] : held.filter((a) => !sameAddr(addrOnly(a), addrOnly(cidr)));
  return { patch: { net: withIfaces(net, me, me.interfaces.map((i) => (i.name === dev ? { ...i, ip6: next } : i))) } };
}

/** 住所の /64 などの網の書き方（2001:db8:10::/64）。0 埋めの計算だけなので 4 の parseCidr は使わない */
function networkOf(cidr: string): string {
  const [addr = '', prefix = '64'] = cidr.split('/');
  const groups = expand(addr).split(':');
  const keep = Math.ceil(Number(prefix) / 16);
  const head = groups.slice(0, keep).concat(Array.from({ length: 8 - keep }, () => '0000')).join(':');
  return `${compress(head)}/${prefix}`;
}
