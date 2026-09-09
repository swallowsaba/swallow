import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { DEFAULT_MTU } from './factory';
import { parseCidr } from './subnet';
import type { Device, DeviceKind, Interface, Link, NatConfig, Route, Topology } from './types';

/** 構成を変える操作の結果。失敗しても元の構成をそのまま返す */
export interface BuildResult {
  topology: Topology;
  error: string | null;
}

function ok(topology: Topology): BuildResult {
  return { topology, error: null };
}

function no(topology: Topology, error: string): BuildResult {
  return { topology, error };
}

function withDevice(topology: Topology, device: Device): Topology {
  return { ...topology, devices: new Map([...topology.devices, [device.name, device]]) };
}

/**
 * MAC は機器名とインタフェース名から決める。
 * 払い出し順に依存しないので、同じ手順を踏めば必ず同じ値になる。
 */
export function macFor(device: string, ifname: string): string {
  const digest = bytesToHex(sha256(new TextEncoder().encode(`mac:${device}:${ifname}`)));
  const octets = [0, 1, 2, 3, 4].map((i) => digest.slice(i * 2, i * 2 + 2));
  return `02:${octets.join(':')}`;
}

export function newInterface(device: string, name: string): Interface {
  return {
    name,
    ip: '0.0.0.0',
    prefix: 0,
    mac: macFor(device, name),
    up: false,
    vlan: null,
    trunkVlans: [],
    mtu: DEFAULT_MTU,
  };
}

export function addDevice(topology: Topology, kind: DeviceKind, name: string): BuildResult {
  if (name === '') return no(topology, 'name は空にできません');
  if (topology.devices.has(name)) return no(topology, `RTNETLINK answers: File exists (${name})`);
  return ok(
    withDevice(topology, {
      name,
      kind,
      interfaces: [],
      routes: [],
      listening: [],
      blockedPorts: [],
      arp: {},
      macTable: {},
      nat: null,
    }),
  );
}

export function removeDevice(topology: Topology, name: string): BuildResult {
  if (!topology.devices.has(name)) return no(topology, `Cannot find device "${name}"`);
  const devices = new Map(topology.devices);
  devices.delete(name);
  // その機器に刺さっていたケーブルも抜ける
  const links = topology.links.filter((l) => !endpointsOf(l).some((e) => e.device === name));
  return ok({ ...topology, devices, links });
}

interface Endpoint {
  device: string;
  ifname: string;
}

export function parseEndpoint(raw: string): Endpoint | null {
  const at = raw.indexOf(':');
  if (at <= 0 || at === raw.length - 1) return null;
  return { device: raw.slice(0, at), ifname: raw.slice(at + 1) };
}

function endpointsOf(link: Link): Endpoint[] {
  return [parseEndpoint(link.a), parseEndpoint(link.b)].filter((e): e is Endpoint => e !== null);
}

/** ケーブルを繋ぐ。まだ無い口は作る */
export function addLink(topology: Topology, rawA: string, rawB: string, mtu = DEFAULT_MTU): BuildResult {
  const a = parseEndpoint(rawA);
  const b = parseEndpoint(rawB);
  if (!a || !b) return no(topology, 'ケーブルの両端は <機器>:<口> の形で指定してください');
  if (rawA === rawB) return no(topology, '同じ口どうしは繋げません');
  for (const end of [a, b]) {
    if (!topology.devices.has(end.device)) return no(topology, `Cannot find device "${end.device}"`);
  }
  const already = topology.links.some(
    (l) => (l.a === rawA && l.b === rawB) || (l.a === rawB && l.b === rawA),
  );
  if (already) return no(topology, 'その2つの口は既に繋がっています');

  // ケーブルを挿すとリンクが上がる。アドレスの有無とは別の話
  let next = topology;
  for (const end of [a, b]) {
    const device = next.devices.get(end.device);
    if (!device) continue;
    const found = device.interfaces.find((i) => i.name === end.ifname);
    const interfaces = found
      ? device.interfaces.map((i) => (i.name === end.ifname ? { ...i, up: true } : i))
      : [...device.interfaces, { ...newInterface(device.name, end.ifname), up: true }];
    next = withDevice(next, { ...device, interfaces });
  }
  return ok({ ...next, links: [...next.links, { a: rawA, b: rawB, up: true, mtu }] });
}

export function removeLink(topology: Topology, rawA: string, rawB: string): BuildResult {
  const links = topology.links.filter(
    (l) => !((l.a === rawA && l.b === rawB) || (l.a === rawB && l.b === rawA)),
  );
  if (links.length === topology.links.length) return no(topology, 'そのケーブルはありません');
  return ok({ ...topology, links });
}

/** ケーブルを抜き差しする（構成は残したまま通らなくする） */
export function setLinkUp(topology: Topology, rawA: string, rawB: string, up: boolean): BuildResult {
  let found = false;
  const links = topology.links.map((l) => {
    if ((l.a === rawA && l.b === rawB) || (l.a === rawB && l.b === rawA)) {
      found = true;
      return { ...l, up };
    }
    return l;
  });
  if (!found) return no(topology, 'そのケーブルはありません');
  return ok({ ...topology, links });
}

function mapInterface(
  topology: Topology,
  deviceName: string,
  ifname: string,
  change: (i: Interface) => Interface | string,
): BuildResult {
  const device = topology.devices.get(deviceName);
  if (!device) return no(topology, `Cannot find device "${deviceName}"`);
  const index = device.interfaces.findIndex((i) => i.name === ifname);
  if (index === -1) return no(topology, `Cannot find device "${ifname}"`);
  const current = device.interfaces[index];
  if (!current) return no(topology, `Cannot find device "${ifname}"`);
  const changed = change(current);
  if (typeof changed === 'string') return no(topology, changed);
  const interfaces = [...device.interfaces];
  interfaces[index] = changed;
  return ok(withDevice(topology, { ...device, interfaces }));
}

export function setAddress(
  topology: Topology,
  deviceName: string,
  ifname: string,
  cidr: string,
): BuildResult {
  let parsed;
  try {
    parsed = parseCidr(cidr);
  } catch {
    return no(topology, `Error: any valid prefix is expected rather than "${cidr}".`);
  }
  // アドレスを付けると同時に、その網への直結経路ができる（本物の proto kernel と同じ）
  return mapInterface(topology, deviceName, ifname, (i) => ({
    ...i,
    ip: parsed.address,
    prefix: parsed.prefix,
    up: true,
  }));
}

export function clearAddress(topology: Topology, deviceName: string, ifname: string): BuildResult {
  return mapInterface(topology, deviceName, ifname, (i) => ({ ...i, ip: '0.0.0.0', prefix: 0 }));
}

export function setInterfaceUp(
  topology: Topology,
  deviceName: string,
  ifname: string,
  up: boolean,
): BuildResult {
  return mapInterface(topology, deviceName, ifname, (i) => ({ ...i, up }));
}

export function setMtu(
  topology: Topology,
  deviceName: string,
  ifname: string,
  mtu: number,
): BuildResult {
  if (!Number.isInteger(mtu) || mtu < 68) {
    return no(topology, 'Error: argument "mtu" is wrong: 68 以上の整数を指定してください');
  }
  const changed = mapInterface(topology, deviceName, ifname, (i) => ({ ...i, mtu }));
  if (changed.error !== null) return changed;
  // ケーブルの MTU は両端の小さいほうに合わせる
  const links = changed.topology.links.map((link) => {
    const ends = endpointsOf(link);
    if (!ends.some((e) => e.device === deviceName && e.ifname === ifname)) return link;
    const sizes = ends.map((e) => {
      const dev = changed.topology.devices.get(e.device);
      return dev?.interfaces.find((i) => i.name === e.ifname)?.mtu ?? DEFAULT_MTU;
    });
    return { ...link, mtu: Math.min(...sizes) };
  });
  return ok({ ...changed.topology, links });
}

export function setVlan(
  topology: Topology,
  deviceName: string,
  ifname: string,
  vlan: number | null,
  trunkVlans: number[] = [],
): BuildResult {
  return mapInterface(topology, deviceName, ifname, (i) => ({ ...i, vlan, trunkVlans }));
}

function sameRoute(a: Route, b: Route): boolean {
  return a.destination === b.destination && a.via === b.via && a.dev === b.dev;
}

export function addRoute(topology: Topology, deviceName: string, route: Route): BuildResult {
  const device = topology.devices.get(deviceName);
  if (!device) return no(topology, `Cannot find device "${deviceName}"`);
  if (!device.interfaces.some((i) => i.name === route.dev)) {
    return no(topology, `Error: Cannot find device "${route.dev}"`);
  }
  try {
    parseCidr(route.destination);
  } catch {
    return no(topology, `Error: any valid prefix is expected rather than "${route.destination}".`);
  }
  if (device.routes.some((r) => r.destination === route.destination)) {
    return no(topology, 'RTNETLINK answers: File exists');
  }
  return ok(withDevice(topology, { ...device, routes: [...device.routes, route] }));
}

export function delRoute(topology: Topology, deviceName: string, route: Route): BuildResult {
  const device = topology.devices.get(deviceName);
  if (!device) return no(topology, `Cannot find device "${deviceName}"`);
  const routes = device.routes.filter((r) => !sameRoute(r, route) && r.destination !== route.destination);
  if (routes.length === device.routes.length) {
    return no(topology, 'RTNETLINK answers: No such process');
  }
  return ok(withDevice(topology, { ...device, routes }));
}

export function setNat(topology: Topology, deviceName: string, config: NatConfig | null): BuildResult {
  const device = topology.devices.get(deviceName);
  if (!device) return no(topology, `Cannot find device "${deviceName}"`);
  if (config !== null && device.kind !== 'router') {
    return no(topology, `${deviceName} はルータではありません`);
  }
  return ok(withDevice(topology, { ...device, nat: config }));
}

export function setListening(
  topology: Topology,
  deviceName: string,
  port: number,
  on: boolean,
): BuildResult {
  const device = topology.devices.get(deviceName);
  if (!device) return no(topology, `Cannot find device "${deviceName}"`);
  const listening = on
    ? [...new Set([...device.listening, port])].sort((a, b) => a - b)
    : device.listening.filter((p) => p !== port);
  return ok(withDevice(topology, { ...device, listening }));
}

export function setBlocked(
  topology: Topology,
  deviceName: string,
  port: number,
  blocked: boolean,
): BuildResult {
  const device = topology.devices.get(deviceName);
  if (!device) return no(topology, `Cannot find device "${deviceName}"`);
  const blockedPorts = blocked
    ? [...new Set([...device.blockedPorts, port])].sort((a, b) => a - b)
    : device.blockedPorts.filter((p) => p !== port);
  return ok(withDevice(topology, { ...device, blockedPorts }));
}

export function setDnsRecord(topology: Topology, name: string, ip: string | null): BuildResult {
  const dns = new Map(topology.dns);
  if (ip === null) dns.delete(name);
  else dns.set(name, ip);
  return ok({ ...topology, dns });
}

/** 何も無い構成 */
export function emptyTopology(): Topology {
  return { devices: new Map(), links: [], dns: new Map() };
}
