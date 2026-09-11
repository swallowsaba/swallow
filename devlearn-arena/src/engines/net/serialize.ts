import type { Device, Link, PacketTrace, Topology } from './types';

/** ネットワーク構成を、保存できる素のデータに落とす */
export interface TopologySnapshot {
  devices: [string, Device][];
  links: Link[];
  dns: [string, string][];
  trace?: PacketTrace;
}

export function snapshotTopology(net: Topology): TopologySnapshot {
  return {
    devices: [...net.devices.entries()],
    links: [...net.links],
    dns: [...net.dns.entries()],
    ...(net.trace ? { trace: net.trace } : {}),
  };
}

export function restoreTopology(snapshot: TopologySnapshot): Topology {
  return {
    devices: new Map(snapshot.devices),
    links: [...snapshot.links],
    dns: new Map(snapshot.dns),
    ...(snapshot.trace ? { trace: snapshot.trace } : {}),
  };
}
