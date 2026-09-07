import type { Device, Interface, Link, Packet, Route, Topology } from './types';

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

export function iface(name: string, ip: string, prefix: number, up = true): Interface {
  return { name, ip, prefix, mac: nextMac(), up };
}

export function host(
  name: string,
  interfaces: Interface[],
  options: { routes?: Route[]; listening?: number[]; blockedPorts?: number[] } = {},
): Device {
  return {
    name,
    kind: 'host',
    interfaces,
    routes: options.routes ?? [],
    listening: options.listening ?? [],
    blockedPorts: options.blockedPorts ?? [],
  };
}

export function router(name: string, interfaces: Interface[], routes: Route[] = []): Device {
  return { name, kind: 'router', interfaces, routes, listening: [], blockedPorts: [] };
}

export function link(a: string, b: string, up = true): Link {
  return { a, b, up };
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
  } = {},
): Packet {
  packetCounter += 1;
  const protocol = options.protocol ?? 'tcp';
  return {
    id: packetCounter,
    ethernet: { srcMac: '02:00:00:00:00:00', dstMac: '02:00:00:00:00:01' },
    ip: { srcIp, dstIp, ttl: options.ttl ?? 64, protocol },
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
  };
}

export function resetPacketCounter(): void {
  packetCounter = 0;
}
