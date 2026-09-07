import type { Device, Interface, Link, NatConfig, Packet, Route, Topology } from './types';

let macCounter = 0;

/** MAC は連番で払い出す（乱数を使わない） */
export function nextMac(): string {
  macCounter += 1;
  const hex = macCounter.toString(16).padStart(4, '0');
  return `02:00:00:00:${hex.slice(0, 2)}:${hex.slice(2)}`;
}

export function resetMac(): void {
  macCounter = 0;
}

export const DEFAULT_MTU = 1500;
export const BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff';

export function iface(
  name: string,
  ip: string,
  prefix: number,
  options: boolean | { up?: boolean; vlan?: number | null; trunkVlans?: number[]; mtu?: number } = {},
): Interface {
  const opts = typeof options === 'boolean' ? { up: options } : options;
  return {
    name,
    ip,
    prefix,
    mac: nextMac(),
    up: opts.up ?? true,
    vlan: opts.vlan ?? null,
    trunkVlans: opts.trunkVlans ?? [],
    mtu: opts.mtu ?? DEFAULT_MTU,
  };
}

interface DeviceOptions {
  routes?: Route[];
  listening?: number[];
  blockedPorts?: number[];
  arp?: Record<string, string>;
  macTable?: Record<string, string>;
  nat?: NatConfig | null;
}

function build(name: string, kind: Device['kind'], interfaces: Interface[], options: DeviceOptions): Device {
  return {
    name,
    kind,
    interfaces,
    routes: options.routes ?? [],
    listening: options.listening ?? [],
    blockedPorts: options.blockedPorts ?? [],
    arp: options.arp ?? {},
    macTable: options.macTable ?? {},
    nat: options.nat ?? null,
  };
}

export function host(name: string, interfaces: Interface[], options: DeviceOptions = {}): Device {
  return build(name, 'host', interfaces, options);
}

export function router(
  name: string,
  interfaces: Interface[],
  routes: Route[] = [],
  options: DeviceOptions = {},
): Device {
  return build(name, 'router', interfaces, { ...options, routes });
}

/** スイッチ。IP を持たず、MAC を見て転送する */
export function switchDevice(name: string, ports: Interface[], options: DeviceOptions = {}): Device {
  return build(name, 'switch', ports, options);
}

/** スイッチのポート。IP は持たない */
export function port(name: string, options: { vlan?: number | null; trunkVlans?: number[]; up?: boolean } = {}): Interface {
  return iface(name, '', 0, { ...options });
}

export function nat(insideCidr: string, outsideIp: string, firstPort = 50000): NatConfig {
  return { insideCidr, outsideIp, table: [], nextPort: firstPort };
}

export function link(a: string, b: string, options: boolean | { up?: boolean; mtu?: number } = {}): Link {
  const opts = typeof options === 'boolean' ? { up: options } : options;
  return { a, b, up: opts.up ?? true, mtu: opts.mtu ?? DEFAULT_MTU };
}

export function topology(devices: Device[], links: Link[], dns: Record<string, string> = {}): Topology {
  return {
    devices: new Map(devices.map((d) => [d.name, d])),
    links,
    dns: new Map(Object.entries(dns)),
  };
}

let packetCounter = 0;

export function packet(
  srcIp: string,
  dstIp: string,
  options: {
    protocol?: 'tcp' | 'udp' | 'icmp';
    srcPort?: number;
    dstPort?: number;
    ttl?: number;
    payload?: string;
    size?: number;
    dontFragment?: boolean;
    vlan?: number | null;
  } = {},
): Packet {
  packetCounter += 1;
  const protocol = options.protocol ?? 'tcp';
  return {
    id: packetCounter,
    ethernet: { srcMac: '02:00:00:00:00:00', dstMac: BROADCAST_MAC, vlan: options.vlan ?? null },
    ip: {
      srcIp,
      dstIp,
      ttl: options.ttl ?? 64,
      protocol,
      dontFragment: options.dontFragment ?? false,
    },
    transport:
      protocol === 'icmp'
        ? null
        : {
            srcPort: options.srcPort ?? 40000,
            dstPort: options.dstPort ?? 80,
            flags: ['SYN'],
            seq: 1000,
            ack: 0,
          },
    payload: options.payload ?? '',
    size: options.size ?? 64,
  };
}

export function resetPacketCounter(): void {
  packetCounter = 0;
}
