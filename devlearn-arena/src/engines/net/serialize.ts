import type { Device, Link, PacketTrace, Topology } from './types';
import type { ZoneRecord } from './zone';

/** ネットワーク構成を、保存できる素のデータに落とす */
export interface TopologySnapshot {
  devices: [string, Device][];
  links: Link[];
  dns: [string, string][];
  records?: ZoneRecord[];
  trace?: PacketTrace;
}

export function snapshotTopology(net: Topology): TopologySnapshot {
  return {
    devices: [...net.devices.entries()],
    links: [...net.links],
    dns: [...net.dns.entries()],
    ...(net.records ? { records: net.records } : {}),
    ...(net.trace ? { trace: net.trace } : {}),
  };
}

export function restoreTopology(snapshot: TopologySnapshot): Topology {
  return {
    devices: new Map(snapshot.devices),
    links: [...snapshot.links],
    dns: new Map(snapshot.dns),
    ...(snapshot.records ? { records: snapshot.records } : {}),
    ...(snapshot.trace ? { trace: snapshot.trace } : {}),
  };
}
