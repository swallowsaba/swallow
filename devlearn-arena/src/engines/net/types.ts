/** パケットは構造体として生成し、ホップごとにヘッダが書き換わる */
export interface EthernetHeader {
  srcMac: string;
  dstMac: string;
}

export interface IpHeader {
  srcIp: string;
  dstIp: string;
  ttl: number;
  protocol: 'tcp' | 'udp' | 'icmp';
}

export interface TransportHeader {
  srcPort: number;
  dstPort: number;
  flags: string[];
  seq: number;
  ack: number;
}

export interface Packet {
  id: number;
  ethernet: EthernetHeader;
  ip: IpHeader;
  transport: TransportHeader | null;
  payload: string;
}

export interface Route {
  /** 宛先 CIDR */
  destination: string;
  /** 次のホップ。直結なら null */
  via: string | null;
  /** 出ていくインタフェース名 */
  dev: string;
}

export interface Interface {
  name: string;
  ip: string;
  prefix: number;
  mac: string;
  /** ケーブルが繋がっているか */
  up: boolean;
}

export type DeviceKind = 'host' | 'router' | 'switch';

export interface Device {
  name: string;
  kind: DeviceKind;
  interfaces: Interface[];
  routes: Route[];
  /** 受け入れる待ち受けポート */
  listening: number[];
  /** ファイアウォールで落とす宛先ポート */
  blockedPorts: number[];
}

export interface Link {
  /** 'host1:eth0' の形 */
  a: string;
  b: string;
  up: boolean;
}

export interface Topology {
  devices: Map<string, Device>;
  links: Link[];
  /** 名前解決の表 */
  dns: Map<string, string>;
}

export interface HopRecord {
  device: string;
  /** そのホップに入ってきた時点のパケット */
  packet: Packet;
  note: string;
}

export interface DeliveryResult {
  hops: HopRecord[];
  delivered: boolean;
  /** 届かなかった理由 */
  error: string | null;
}
