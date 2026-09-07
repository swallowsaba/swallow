/**
 * IPv6 の表記とプレフィックス計算。
 *
 * 省略記法（`::`）の展開と圧縮を実際に行う。表示用の文字列を作り置きせず、
 * 128 ビットの値から毎回組み立てる。だから展開と圧縮は必ず往復で一致する。
 */

const GROUPS = 8;

export function expand(address: string): string {
  const [head, tail] = address.split('::');
  if (tail === undefined) {
    const parts = address.split(':');
    if (parts.length !== GROUPS) throw new Error(`不正な IPv6 アドレスです: ${address}`);
    return parts.map((p) => p.padStart(4, '0')).join(':');
  }
  const left = head === undefined || head === '' ? [] : head.split(':');
  const right = tail === '' ? [] : tail.split(':');
  const missing = GROUPS - left.length - right.length;
  if (missing < 0) throw new Error(`不正な IPv6 アドレスです: ${address}`);
  return [...left, ...Array.from({ length: missing }, () => '0'), ...right]
    .map((p) => p.padStart(4, '0'))
    .join(':');
}

/** RFC 5952 の書き方。0 が一番長く続くところを1か所だけ `::` にする */
export function compress(address: string): string {
  const groups = expand(address).split(':').map((g) => g.replace(/^0+(?=.)/, ''));

  let bestStart = -1;
  let bestLength = 0;
  let start = -1;
  let length = 0;
  for (let i = 0; i <= groups.length; i += 1) {
    if (groups[i] === '0') {
      if (start === -1) start = i;
      length += 1;
    } else {
      if (length > bestLength) {
        bestLength = length;
        bestStart = start;
      }
      start = -1;
      length = 0;
    }
  }
  // 1 グループだけの 0 は縮めない（本物と同じ）
  if (bestLength < 2) return groups.join(':');

  const head = groups.slice(0, bestStart).join(':');
  const tail = groups.slice(bestStart + bestLength).join(':');
  return `${head}::${tail}`;
}

export function toInt(address: string): bigint {
  return expand(address)
    .split(':')
    .reduce((acc, group) => (acc << 16n) | BigInt(Number.parseInt(group, 16)), 0n);
}

export function fromInt(value: bigint): string {
  const groups: string[] = [];
  let v = value;
  for (let i = 0; i < GROUPS; i += 1) {
    groups.unshift((v & 0xffffn).toString(16));
    v >>= 16n;
  }
  return compress(groups.join(':'));
}

export interface Ipv6Cidr {
  address: string;
  prefix: number;
  network: string;
  first: string;
  last: string;
  /** 割り当てられるアドレス数（2^(128-prefix)） */
  size: bigint;
}

export function parseIpv6Cidr(input: string): Ipv6Cidr {
  const [address, prefixText] = input.split('/');
  if (address === undefined || prefixText === undefined) {
    throw new Error(`CIDR の形式ではありません: ${input}`);
  }
  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
    throw new Error(`プレフィックス長が不正です: ${prefixText}`);
  }
  const all = (1n << 128n) - 1n;
  const mask = prefix === 0 ? 0n : (all << BigInt(128 - prefix)) & all;
  const value = toInt(address);
  const network = value & mask;
  return {
    address: compress(address),
    prefix,
    network: fromInt(network),
    first: fromInt(network),
    last: fromInt(network | (~mask & all)),
    size: 1n << BigInt(128 - prefix),
  };
}

/** アドレスの種類。運用でまず見分けたいところ */
export function scopeOf(address: string): string {
  const groups = expand(address).split(':');
  const first = Number.parseInt(groups[0] ?? '0', 16);
  if (toInt(address) === 1n) return 'ループバック (::1)';
  if (toInt(address) === 0n) return '未指定 (::)';
  if ((first & 0xffc0) === 0xfe80) return 'リンクローカル (fe80::/10)';
  if ((first & 0xfe00) === 0xfc00) return 'ユニークローカル (fc00::/7)';
  if (groups[0] === 'ff02') return 'リンクローカルマルチキャスト (ff02::/16)';
  if ((first & 0xff00) === 0xff00) return 'マルチキャスト (ff00::/8)';
  if ((first & 0xe000) === 0x2000) return 'グローバルユニキャスト (2000::/3)';
  return 'その他';
}

/**
 * SLAAC。プレフィックスと MAC から、EUI-64 でインタフェース ID を作る。
 * 中央に fffe を挟み、7 ビット目（U/L）を反転させる。
 */
export function slaac(prefix: string, mac: string): string {
  const bytes = mac.split(':').map((b) => Number.parseInt(b, 16));
  if (bytes.length !== 6 || bytes.some((b) => Number.isNaN(b))) {
    throw new Error(`不正な MAC アドレスです: ${mac}`);
  }
  const first = bytes[0] ?? 0;
  const flipped = first ^ 0b0000_0010;
  const eui = [flipped, bytes[1] ?? 0, bytes[2] ?? 0, 0xff, 0xfe, bytes[3] ?? 0, bytes[4] ?? 0, bytes[5] ?? 0];
  const groups: string[] = [];
  for (let i = 0; i < 8; i += 2) {
    groups.push(
      ((eui[i] ?? 0) * 256 + (eui[i + 1] ?? 0)).toString(16).padStart(4, '0'),
    );
  }
  const parsed = parseIpv6Cidr(prefix);
  const interfaceId = groups.reduce((acc, g) => (acc << 16n) | BigInt(Number.parseInt(g, 16)), 0n);
  return fromInt(toInt(parsed.network) | interfaceId);
}
