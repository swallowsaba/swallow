import { contains } from './subnet';

/**
 * DHCP のサーバ（ISC dhcpd）の模型（docs/lessons/net.md の net.b.08）。純粋な関数。
 *
 * - 設定は本物の dhcpd.conf の書き方（`subnet 網 netmask マスク { range 始め 終わり; option routers …; }`・`default-lease-time 秒;`）。
 *   `dhcpd -t` と同じ確かめをし、誤りは本物と同じ言い方で返す（; の書き忘れ・網の外の範囲）
 * - サーバを動かすと、網で待っている機械（来客のパソコン）が順に借りに来る。範囲の小さい方から貸す
 * - 既に使われているアドレス（固定の機械）を貸すと、借りた機械が使用中と気付いて断り（DHCPDECLINE）、サーバはそのアドレスを
 *   捨てて（abandoned）次を貸す。貸せるアドレスが尽きると no free leases
 * - 貸した記録は、本物と同じ形のリースのファイル（/var/lib/dhcp/dhcpd.leases）に書く
 */

export interface DhcpClient {
  /** 機械の名前（client-hostname） */
  host: string;
  mac: string;
}

export interface DhcpSubnet {
  network: string;
  netmask: string;
  prefix: number;
  ranges: [string, string][];
  routers?: string;
}

export interface DhcpConfig {
  leaseTime: number;
  subnets: DhcpSubnet[];
}

export type DhcpParse = { ok: true; config: DhcpConfig } | { ok: false; lines: string[] };

const toNum = (ip: string): number => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0);
const toIp = (n: number): string => [24, 16, 8, 0].map((s) => String(Math.floor(n / 2 ** s) % 256)).join('.');
const maskPrefix = (mask: string): number => toNum(mask).toString(2).replace(/0+$/, '').length;
const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;

const EXIT = 'Configuration file errors encountered -- exiting';

/** dhcpd.conf を読む（dhcpd -t と同じ確かめ）。file は言い方に使う場所 */
export function parseDhcpConf(text: string, file: string): DhcpParse {
  const lines = text.split('\n');
  const fail = (lineNo: number, why: string): DhcpParse => ({ ok: false, lines: [`${file} line ${String(lineNo)}: ${why}`, `${lines[lineNo - 1] ?? ''}`, '^', EXIT] });
  let leaseTime = 43200;
  const subnets: DhcpSubnet[] = [];
  let cur: DhcpSubnet | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const no = i + 1;
    const line = (lines[i] ?? '').replace(/#.*$/, '').trim();
    if (line === '') continue;
    if (line === '}') {
      if (!cur) return fail(no, 'expecting a declaration');
      subnets.push(cur);
      cur = null;
      continue;
    }
    const sub = /^subnet\s+(\S+)\s+netmask\s+(\S+)\s*\{$/.exec(line);
    if (sub) {
      const [, network = '', netmask = ''] = sub;
      if (!IPV4.test(network) || !IPV4.test(netmask)) return fail(no, 'expecting netmask');
      cur = { network, netmask, prefix: maskPrefix(netmask), ranges: [] };
      continue;
    }
    if (!line.endsWith(';')) return fail(no, 'semicolon expected.');
    const words = line.slice(0, -1).trim().split(/\s+/);
    const [head = ''] = words;
    if (head === 'range') {
      if (!cur) return fail(no, 'range declaration not allowed here.');
      const [, a = '', b = a] = words;
      if (!IPV4.test(a) || !IPV4.test(b)) return fail(no, 'expecting IP address.');
      const net = `${cur.network}/${String(cur.prefix)}`;
      if (!contains(net, a) || !contains(net, b)) return { ok: false, lines: [`Address range ${a} to ${b} not on net ${cur.network}/${cur.netmask}!`, EXIT] };
      cur.ranges.push(toNum(a) <= toNum(b) ? [a, b] : [b, a]);
    } else if (head === 'option' && words[1] === 'routers') {
      if (!cur) continue;
      cur.routers = words[2] ?? '';
    } else if (head === 'default-lease-time') {
      leaseTime = Number(words[1]) || leaseTime;
    } else if (!['option', 'max-lease-time', 'authoritative', 'ddns-update-style', 'log-facility', 'ping-check'].includes(head)) {
      return fail(no, `unknown parameter "${head}"`);
    }
  }
  if (cur) return fail(lines.length, 'unexpected end of file');
  return { ok: true, config: { leaseTime, subnets } };
}

export interface Lease {
  ip: string;
  client: DhcpClient;
}

export interface DhcpRun {
  leases: Lease[];
  abandoned: string[];
  /** 借りられなかった機械 */
  starved: DhcpClient[];
  /** journalctl に出す、dhcpd の行 */
  log: string[];
}

/**
 * サーバを動かした時の貸し出し。clients が順に借りに来る。inUse は網で既に使われているアドレス（固定の機械）。
 * iface はサーバが待つ口の名前（ログに出す）
 */
export function serveLeases(config: DhcpConfig, clients: readonly DhcpClient[], inUse: readonly string[], iface: string): DhcpRun {
  const pool = config.subnets.flatMap((s) => s.ranges.flatMap(([a, b]) => Array.from({ length: Math.min(512, toNum(b) - toNum(a) + 1) }, (_, k) => toIp(toNum(a) + k))));
  const net = config.subnets[0];
  const netText = net ? `${net.network}/${String(net.prefix)}` : '';
  const used = new Set<string>();
  const leases: Lease[] = [];
  const abandoned: string[] = [];
  const starved: DhcpClient[] = [];
  const log: string[] = [];
  for (const c of clients) {
    let got: string | null = null;
    log.push(`DHCPDISCOVER from ${c.mac} via ${iface}`);
    for (const ip of pool) {
      if (used.has(ip)) continue;
      used.add(ip);
      log.push(`DHCPOFFER on ${ip} to ${c.mac} (${c.host}) via ${iface}`, `DHCPREQUEST for ${ip} from ${c.mac} (${c.host}) via ${iface}`, `DHCPACK on ${ip} to ${c.mac} (${c.host}) via ${iface}`);
      if (inUse.includes(ip)) {
        // 借りた機械が、そのアドレスを既に誰かが使っていると気付いて断る
        log.push(`DHCPDECLINE of ${ip} from ${c.mac} (${c.host}) via ${iface}: abandoned`, `Abandoning IP address ${ip}: declined.`, `DHCPDISCOVER from ${c.mac} via ${iface}`);
        abandoned.push(ip);
        continue;
      }
      got = ip;
      break;
    }
    if (got === null) {
      log.push(`DHCPDISCOVER from ${c.mac} via ${iface}: network ${netText}: no free leases`);
      starved.push(c);
    } else leases.push({ ip: got, client: c });
  }
  return { leases, abandoned, starved, log };
}

/** 練習の世界の時刻の始まり（2026-10-03 09:00:30 UTC。ログの時刻と同じ） */
export const DHCP_EPOCH = 1791018030;

/** 時刻の書き方（リースのファイルは UTC の「曜 年/月/日 時:分:秒」）。暦は日数から計算する（Date を使わない） */
function stamp(epoch: number): string {
  const days = Math.floor(epoch / 86400);
  const secs = epoch - days * 86400;
  // 1970-01-01 からの日数を、年・月・日にする（グレゴリオ暦）
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  const p = (n: number): string => String(n).padStart(2, '0');
  // 1970-01-01 は木曜（4）
  const weekday = (((days + 4) % 7) + 7) % 7;
  return `${String(weekday)} ${String(year)}/${p(month)}/${p(day)} ${p(Math.floor(secs / 3600))}:${p(Math.floor(secs / 60) % 60)}:${p(secs % 60)}`;
}

/** 本物と同じ形のリースのファイル。now は貸した時刻（UNIX の秒） */
export function leasesText(run: DhcpRun, leaseTime: number, now: number): string {
  const start = stamp(now);
  const end = stamp(now + leaseTime);
  const blocks = [
    ...run.abandoned.map((ip) => [`lease ${ip} {`, `  starts ${start};`, `  ends ${end};`, '  binding state abandoned;', '  next binding state free;', '}']),
    ...run.leases.map((l) => [`lease ${l.ip} {`, `  starts ${start};`, `  ends ${end};`, '  binding state active;', '  next binding state free;', `  hardware ethernet ${l.client.mac};`, `  client-hostname "${l.client.host}";`, '}']),
  ];
  return [
    '# The format of this file is documented in the dhcpd.leases(5) manual page.',
    '# This lease file was written by isc-dhcp-4.4.3-P1',
    '',
    ...blocks.flat(),
    '',
  ].join('\n');
}

/** リースのファイルを読む（dhcp-lease-list が使う）。動いている貸し出しだけ */
export function activeLeases(text: string): { ip: string; mac: string; host: string; ends: string }[] {
  const out: { ip: string; mac: string; host: string; ends: string }[] = [];
  for (const m of text.matchAll(/lease (\S+) \{([\s\S]*?)\n\}/g)) {
    const body = m[2] ?? '';
    if (!/binding state active;/.test(body)) continue;
    const ends = /ends \d (\S+) (\S+);/.exec(body);
    out.push({
      ip: m[1] ?? '',
      mac: /hardware ethernet (\S+);/.exec(body)?.[1] ?? '',
      host: /client-hostname "([^"]*)";/.exec(body)?.[1] ?? '',
      ends: ends ? `${(ends[1] ?? '').replace(/\//g, '-')} ${ends[2] ?? ''}` : '',
    });
  }
  return out;
}

