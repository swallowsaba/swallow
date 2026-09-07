/** IPv4 / CIDR の計算。BigInt を使って IPv6 にも広げられる形にする */

export function ipToInt(ip: string): bigint {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`不正な IPv4 アドレスです: ${ip}`);
  }
  return parts.reduce((acc, n) => (acc << 8n) | BigInt(n), 0n);
}

export function intToIp(value: bigint): string {
  const out: number[] = [];
  let v = value;
  for (let i = 0; i < 4; i += 1) {
    out.unshift(Number(v & 255n));
    v >>= 8n;
  }
  return out.join('.');
}

export interface Cidr {
  address: string;
  prefix: number;
  network: string;
  broadcast: string;
  mask: string;
  firstHost: string;
  lastHost: string;
  /** 使えるホスト数 */
  hosts: number;
}

export function parseCidr(input: string): Cidr {
  const [address, prefixText] = input.split('/');
  if (address === undefined || prefixText === undefined) {
    throw new Error(`CIDR の形式ではありません: ${input}`);
  }
  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`プレフィックス長が不正です: ${prefixText}`);
  }

  const value = ipToInt(address);
  const maskValue = prefix === 0 ? 0n : (0xffffffffn << BigInt(32 - prefix)) & 0xffffffffn;
  const network = value & maskValue;
  const broadcast = network | (~maskValue & 0xffffffffn);
  const size = 2 ** (32 - prefix);
  const hosts = prefix >= 31 ? (prefix === 32 ? 1 : 2) : size - 2;

  return {
    address,
    prefix,
    network: intToIp(network),
    broadcast: intToIp(broadcast),
    mask: intToIp(maskValue),
    firstHost: intToIp(prefix >= 31 ? network : network + 1n),
    lastHost: intToIp(prefix >= 31 ? broadcast : broadcast - 1n),
    hosts,
  };
}

/** その IP が CIDR の範囲に入るか */
export function contains(cidr: string, ip: string): boolean {
  const parsed = parseCidr(cidr);
  const value = ipToInt(ip);
  return value >= ipToInt(parsed.network) && value <= ipToInt(parsed.broadcast);
}

/** 同じネットワークにいるか（同一セグメントの判定） */
export function sameNetwork(a: string, b: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0n : (0xffffffffn << BigInt(32 - prefix)) & 0xffffffffn;
  return (ipToInt(a) & mask) === (ipToInt(b) & mask);
}

/** より長いプレフィックスほど優先。ルーティングの最長一致に使う */
export function prefixLength(cidr: string): number {
  return parseCidr(cidr).prefix;
}

/** 与えた CIDR を、指定の数だけ均等に分割する */
export function split(cidr: string, count: number): string[] {
  const parsed = parseCidr(cidr);
  const bits = Math.ceil(Math.log2(count));
  const newPrefix = parsed.prefix + bits;
  if (newPrefix > 32) throw new Error('これ以上分割できません');
  const step = BigInt(2 ** (32 - newPrefix));
  const start = ipToInt(parsed.network);
  return Array.from({ length: count }, (_, i) => `${intToIp(start + step * BigInt(i))}/${String(newPrefix)}`);
}
