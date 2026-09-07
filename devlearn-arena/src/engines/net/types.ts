/** パケットは構造体として生成し、ホップごとにヘッダが書き換わる */
export interface EthernetHeader {
  srcMac: string;
  dstMac: string;
  /** VLAN タグ。付いていなければ null（タグなしフレーム） */
  vlan: number | null;
}

export interface IpHeader {
  srcIp: string;
  dstIp: string;
  ttl: number;
  protocol: 'tcp' | 'udp' | 'icmp';
  /** 分割禁止ビット。立っていると MTU を超えたら落ちる */
  dontFragment: boolean;
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
  /** バイト数。MTU と比べる */
  size: number;
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
  /** そのポートが属する VLAN。トランクなら null */
  vlan: number | null;
  /** トランクポートが通す VLAN。アクセスポートなら空 */
  trunkVlans: number[];
  /** そのリンクに載せられる最大サイズ */
  mtu: number;
}

export type DeviceKind = 'host' | 'router' | 'switch';

/** NAT の変換表の1行 */
export interface NatEntry {
  insideIp: string;
  insidePort: number;
  outsidePort: number;
  destinationIp: string;
  destinationPort: number;
}

export interface NatConfig {
  /** 変換の対象になる内側のネットワーク */
  insideCidr: string;
  /** 外へ出るときに名乗るアドレス */
  outsideIp: string;
  /** 払い出し済みの対応。ポート番号で多重化する（PAT） */
  table: NatEntry[];
  /** 次に払い出すポート番号 */
  nextPort: number;
}

export interface Device {
  name: string;
  kind: DeviceKind;
  interfaces: Interface[];
  routes: Route[];
  /** 受け入れる待ち受けポート */
  listening: number[];
  /** ファイアウォールで落とす宛先ポート */
  blockedPorts: number[];
  /** ARP 表。IP → MAC。解決したものを覚える */
  arp: Record<string, string>;
  /** スイッチの MAC アドレステーブル。MAC → ポート名 */
  macTable: Record<string, string>;
  /** ルータなら NAT の設定を持てる */
  nat: NatConfig | null;
}

export interface Link {
  /** 'host1:eth0' の形 */
  a: string;
  b: string;
  up: boolean;
  /** そのリンクに載せられる最大サイズ */
  mtu: number;
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
  /** 配送の途中で変わった機器（ARP 表・MAC 表・NAT 表の学習結果） */
  learned: Map<string, Device>;
}
