import { localCurl } from './httpLocal';
import { addressOf, deviceAt, resolveName, roundTrip, rttOf, traceHops } from '@/engines/net/probe';
import { parseCidr } from '@/engines/net/subnet';
import { emptyIptables, runIptables } from '@/engines/net/firewall';
import { checkZone } from '@/engines/net/zone';
import type { DeliveryResult, Device, Topology } from '@/engines/net/types';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { fromLines, parseArgs } from './args';
import { ipAddr, ipLink, ipRoute } from './netBuild';
import { currentUser } from './perm';
import { normalize } from '../path';
import { exists, isDir, readFile } from '../vfs';

const NO_NET = 'ネットワークが用意されていません。ネットワークの任務を選んでください。\n';

/**
 * ネットワークの模擬が無い機械の ip addr。自分の口だけを出す: lo（127.0.0.1）と、__HOST_ADDR（実戦の setup の address）があれば eth0
 */
function ownAddresses(shell: ShellState, argv: readonly string[]): CommandResult {
  const what = argv[1] ?? 'addr';
  if (!['addr', 'address', 'a'].includes(what) || (argv[2] !== undefined && argv[2] !== 'show')) return { stderr: NO_NET, code: 1 };
  const own = shell.vars.get('__HOST_ADDR');
  return {
    stdout: fromLines([
      '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536',
      '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00',
      '    inet 127.0.0.1/8 scope host lo',
      ...(own === undefined ? [] : [
        '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500',
        '    link/ether 02:42:0a:00:00:05 brd ff:ff:ff:ff:ff:ff',
        `    inet ${own} scope global eth0`,
      ]),
    ]),
  };
}

function selfName(shell: ShellState): string {
  return shell.vars.get('NET_SELF') ?? 'pc1';
}

/** 配送で学んだこと（ARP 表・MAC 表・NAT 表）を構成に書き戻す */
function withLearned(net: Topology, learned: ReadonlyMap<string, Device>): Topology {
  if (learned.size === 0) return net;
  return { ...net, devices: new Map([...net.devices, ...learned]) };
}

/**
 * 配送のあとの構成。学んだことを書き戻し、通った機器の順番を残す。
 * 図はこの順番を使って、パケットが線の上を流れる様子を描く。
 */
function afterDelivery(net: Topology, result: DeliveryResult): Topology {
  return {
    ...withLearned(net, result.learned),
    trace: {
      id: (net.trace?.id ?? 0) + 1,
      path: result.hops.map((hop) => hop.device),
      delivered: result.delivered,
      hops: result.hops.map(({ device, note, packet: p }) => ({
        device,
        note,
        srcIp: p.ip.srcIp,
        dstIp: p.ip.dstIp,
        ttl: p.ip.ttl,
        protocol: p.ip.protocol,
        srcMac: p.ethernet.srcMac,
        dstMac: p.ethernet.dstMac,
        vlan: p.ethernet.vlan,
        srcPort: p.transport?.srcPort ?? null,
        dstPort: p.transport?.dstPort ?? null,
      })),
      error: result.error,
    },
  };
}

const NMAP_HEAD = 'Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-10-03 09:00 UTC';
const SERVICES: Record<number, string> = { 22: 'ssh', 25: 'smtp', 53: 'domain', 80: 'http', 139: 'netbios-ssn', 443: 'https', 445: 'microsoft-ds', 3306: 'mysql', 5432: 'postgresql', 8080: 'http-proxy' };

const DIG_TYPES: ReadonlySet<string> = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'PTR', 'SRV', 'CAA']);

interface DigRow { name: string; ttl: number; type: string; value: string }

/** 名前の値に末尾の . を付ける（dig の書き方） */
const dotted = (n: string): string => (n.endsWith('.') ? n : `${n}.`);

/**
 * dig の答え。DNS のサーバが読んだレコードがあれば種類ごとに答え、別名（CNAME）は本物と同じく先を辿って並べる。
 * レコードが無ければ、名前の表（A）から答える。名前がどこにも無ければ NXDOMAIN
 */
function digAnswer(net: Topology, name: string, type: string): { nx: boolean; rows: DigRow[] } {
  const records = net.records ?? [];
  const rows: DigRow[] = [];
  let q = name.toLowerCase();
  for (let hop = 0; hop < 8; hop += 1) {
    const here = records.filter((r) => r.name.toLowerCase() === q);
    const alias = here.find((r) => r.type === 'CNAME');
    if (alias && type !== 'CNAME') {
      rows.push({ name: alias.name, ttl: alias.ttl, type: 'CNAME', value: dotted(alias.value) });
      q = alias.value.toLowerCase();
      continue;
    }
    const matched = here.filter((r) => r.type === type);
    if (matched.length > 0) {
      rows.push(...matched.map((r) => ({ name: r.name, ttl: r.ttl, type: r.type, value: r.type === 'MX' ? r.value.replace(/(\S+)$/, (h) => dotted(h)) : r.type === 'CNAME' || r.type === 'NS' ? dotted(r.value) : r.value })));
      return { nx: false, rows };
    }
    const ip = type === 'A' ? net.dns.get(q) : undefined;
    if (ip !== undefined && here.length === 0) {
      rows.push({ name: q, ttl: 300, type: 'A', value: ip });
      return { nx: false, rows };
    }
    // 名前はあるが、その種類のレコードが無い（NOERROR で答えが空）。名前がどこにも無ければ NXDOMAIN
    return { nx: rows.length === 0 && here.length === 0 && !net.dns.has(q), rows };
  }
  return { nx: false, rows };
}

export const netCommands: CommandSpec[] = [
  {
    name: 'ping',
    summary: '相手に届くか（返事が戻るか）を確かめる',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const { values, operands } = parseArgs(argv, { withValue: ['c'] });
      const target = operands[0];
      if (target === undefined) return { stderr: 'ping: usage error: Destination address required\n', code: 1 };
      const count = Math.max(1, Math.min(10, Number(values.get('c') ?? 4) || 4));
      const ip = resolveName(net, target);
      if (ip === null) return { stderr: `ping: ${target}: Name or service not known\n`, code: 2 };
      const me = selfName(shell);
      const r = roundTrip(net, me, ip);
      if (r.kind === 'no-route') return { stderr: 'ping: connect: Network is unreachable\n', code: 2 };
      const head = `PING ${target} (${ip}) 56(84) bytes of data.`;
      const stats = (got: number) => [`--- ${target} ping statistics ---`, `${String(count)} packets transmitted, ${String(got)} received, ${got === count ? '0' : '100'}% packet loss`];
      const patch = { net: afterDelivery(net, r.result) };
      // 自分の網の相手が ARP に答えない: 本物と同じく、自分の住所から「届かない」と知らせる
      const arpFailed = r.kind === 'timeout' && r.result.hops.length === 1 && (r.result.error ?? '').includes('ARP');
      if (r.kind === 'net-unreachable') {
        const lines = Array.from({ length: count }, (_, i) => `From ${r.from} icmp_seq=${String(i + 1)} Destination Net Unreachable`);
        return { stdout: fromLines([head, ...lines, '', `--- ${target} ping statistics ---`, `${String(count)} packets transmitted, 0 received, +${String(count)} errors, 100% packet loss`]), code: 1, patch };
      }
      if (arpFailed) {
        const own = addressOf(net, me);
        const lines = Array.from({ length: count }, (_, i) => `From ${own} icmp_seq=${String(i + 1)} Destination Host Unreachable`);
        return { stdout: fromLines([head, ...lines, '', `--- ${target} ping statistics ---`, `${String(count)} packets transmitted, 0 received, +${String(count)} errors, 100% packet loss`]), code: 1, patch };
      }
      if (r.kind !== 'ok') return { stdout: fromLines([head, '', ...stats(0)]), code: 1, patch };
      const replies = Array.from({ length: count }, (_, i) => `64 bytes from ${ip}: icmp_seq=${String(i + 1)} ttl=${String(64 - r.routers)} time=${rttOf(r.routers, i + 1)} ms`);
      return { stdout: fromLines([head, ...replies, '', ...stats(count)]), patch };
    },
  },
  {
    name: 'traceroute',
    summary: '相手までの道すじ（通る機器）を 1 段ずつ表示する',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const target = argv.slice(1).find((a) => !a.startsWith('-'));
      if (target === undefined) return { stderr: 'Usage: traceroute host\n', code: 2 };
      const ip = resolveName(net, target);
      if (ip === null) return { stderr: `${target}: Name or service not known\nCannot handle "host" cmdline arg \`${target}' on position 1 (argc 1)\n`, code: 2 };
      const max = 8;
      const t = traceHops(net, selfName(shell), ip, max);
      const lines = [`traceroute to ${target} (${ip}), ${String(max)} hops max, 60 byte packets`];
      t.hops.forEach((h, i) => lines.push(`${String(i + 1).padStart(2)}  ${h === null ? '* * *' : `${h}  ${rttOf(i, 1)} ms${t.netUnreachable && i === t.hops.length - 1 ? ' !N' : ''}`}`));
      return { stdout: fromLines(lines), code: t.reached ? 0 : 1 };
    },
  },
  {
    name: 'curl',
    summary: 'HTTP でページを取りに行く',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      // ネットワークの構成が無い実戦では、手元のサービス・コンテナと、名前で引けるサイトに取りに行く
      if (net === null) return localCurl(argv, shell);
      const { flags, operands } = parseArgs(argv);
      const url = operands[0];
      if (url === undefined) return { stderr: 'curl: try \'curl --help\' for more information\n', code: 2 };

      const match = /^(?:https?:\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/.exec(url);
      const hostName = match?.[1] ?? url;
      const port = Number(match?.[2] ?? (url.startsWith('https') ? 443 : 80));
      const path = match?.[3] ?? '/';

      const ip = resolveName(net, hostName);
      if (ip === null) return { stderr: `curl: (6) Could not resolve host: ${hostName}\n`, code: 6 };

      const r = roundTrip(net, selfName(shell), ip, port);
      const verbose: string[] = flags.has('v') ? [`*   Trying ${ip}:${String(port)}...`] : [];
      const patch = { net: afterDelivery(net, r.result) };
      if (r.kind !== 'ok') {
        const refused = r.kind === 'refused';
        const fast = refused || r.kind === 'net-unreachable';
        return {
          stdout: fromLines(verbose),
          stderr: `curl: (${fast ? '7' : '28'}) Failed to connect to ${hostName} port ${String(port)}: ${refused ? 'Connection refused' : r.kind === 'net-unreachable' ? 'Network is unreachable' : 'Connection timed out'}\n`,
          code: fast ? 7 : 28,
          patch,
        };
      }
      if (flags.has('v')) {
        verbose.push(`* Connected to ${hostName} (${ip}) port ${String(port)}`, `> GET ${path} HTTP/1.1`, `> Host: ${hostName}`, '>', '< HTTP/1.1 200 OK', '< Content-Type: text/html', '<');
      }
      // 返すのは、荷物が実際に届いた機器（ポート転送の先など）
      const reached = net.devices.get(r.result.hops[r.result.hops.length - 1]?.device ?? '') ?? deviceAt(net, ip);
      const body = reached?.body ?? `<html><body>It works: ${hostName}</body></html>`;
      return { stdout: `${fromLines(verbose)}${body}\n`, patch };
    },
  },
  {
    name: 'dig',
    summary: '名前を引く（DNS に、名前と種類（A・CNAME・MX など）を問い合わせる）',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const short = argv.includes('+short');
      const words = argv.slice(1).filter((a) => !a.startsWith('+') && !a.startsWith('@'));
      const type = (words.find((w) => DIG_TYPES.has(w.toUpperCase())) ?? 'A').toUpperCase();
      const target = words.find((w) => !DIG_TYPES.has(w.toUpperCase()));
      if (target === undefined) return { stderr: 'usage: dig <名前> [種類]\n', code: 1 };
      const name = target.replace(/\.$/, '');
      const answer = digAnswer(net, name, type);
      if (short) return { stdout: fromLines(answer.rows.map((r) => r.value)) };
      const lines = [
        `; <<>> DiG 9.18.28 <<>> ${argv.slice(1).filter((a) => !a.startsWith('+')).join(' ')}`,
        `;; ->>HEADER<<- opcode: QUERY, status: ${answer.nx ? 'NXDOMAIN' : 'NOERROR'}, id: 4242`,
        `;; flags: qr aa rd ra; QUERY: 1, ANSWER: ${String(answer.rows.length)}, AUTHORITY: 0, ADDITIONAL: 1`,
        '',
        ';; QUESTION SECTION:',
        `;${name}.\t\t\tIN\t${type}`,
        ...(answer.rows.length === 0 ? [] : ['', ';; ANSWER SECTION:', ...answer.rows.map((r) => `${r.name}.\t\t${String(r.ttl)}\tIN\t${r.type}\t${r.value}`)]),
        '',
        `;; SERVER: ${addressOf(net, selfName(shell))}#53`,
      ];
      return { stdout: fromLines(lines) };
    },
  },
  {
    name: 'iptables',
    summary: 'パケットフィルタ（ファイアウォール）の規則を見る・足す・消す・並べ替える（-L・-S・-A・-I・-D・-F・-P、-t nat）',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      if (currentUser(shell) !== 'root') return { stderr: 'iptables v1.8.10 (nf_tables): Could not fetch rule set generation id: Permission denied (you must be root)\n', code: 4 };
      const me = net.devices.get(selfName(shell));
      if (!me) return { stderr: '自分の機器が見つかりません\n', code: 1 };
      const r = runIptables(me.iptables ?? emptyIptables(), argv.slice(1).filter((a) => a !== '-n' && a !== '--numeric'));
      if (!r.ok) return { stderr: r.stderr, code: r.code };
      const changed = r.table !== (me.iptables ?? null) && r.stdout === undefined;
      return { ...(r.stdout !== undefined ? { stdout: r.stdout } : {}), ...(changed ? { patch: { net: { ...net, devices: new Map([...net.devices, [me.name, { ...me, iptables: r.table }]]) } } } : {}) };
    },
  },
  {
    name: 'nmap',
    summary: '相手のポートが開いているか（open）・閉じているか（closed）・止められているか（filtered）を調べる（-p 番号,番号）',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const { values, operands } = parseArgs(argv, { withValue: ['p'] });
      const target = operands[0];
      if (target === undefined) return { stderr: 'Nmap 7.94SVN ( https://nmap.org )\nUsage: nmap [Scan Type(s)] [Options] {target specification}\n', code: 255 };
      const ip = resolveName(net, target);
      if (ip === null) return { stdout: fromLines([NMAP_HEAD, `Failed to resolve "${target}".`, 'WARNING: No targets were specified, so 0 hosts scanned.', 'Nmap done: 0 IP addresses (0 hosts up) scanned in 0.05 seconds']) };
      const ports = (values.get('p') ?? '22,80,443').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 65536);
      const me = selfName(shell);
      const rows = ports.map((port) => {
        const r = roundTrip(net, me, ip, port);
        return { port, state: r.kind === 'ok' ? 'open' : r.kind === 'refused' ? 'closed' : 'filtered' };
      });
      const width = Math.max(8, ...rows.map((r) => `${String(r.port)}/tcp`.length + 1));
      return {
        stdout: fromLines([
          NMAP_HEAD,
          `Nmap scan report for ${target === ip ? ip : `${target} (${ip})`}`,
          'Host is up (0.00040s latency).',
          '',
          `${'PORT'.padEnd(width)}STATE    SERVICE`,
          ...rows.map((r) => `${`${String(r.port)}/tcp`.padEnd(width)}${r.state.padEnd(9)}${SERVICES[r.port] ?? 'unknown'}`),
          '',
          'Nmap done: 1 IP address (1 host up) scanned in 1.23 seconds',
        ]),
      };
    },
  },
  {
    name: 'named-checkzone',
    summary: 'DNS のゾーンファイルの書き方を確かめる（named-checkzone 名前 ファイル）',
    handler: ({ argv, shell }) => {
      const [zone, file] = argv.slice(1).filter((a) => !a.startsWith('-'));
      if (zone === undefined || file === undefined) return { stderr: 'usage: named-checkzone [-djqvD] [-c class] [-f inputformat] [-F outputformat] [-J filename] [-s (full|relative)] [-t directory] [-w directory] [-k (ignore|warn|fail)] [-n (ignore|warn|fail)] [-m (ignore|warn|fail)] [-r (ignore|warn|fail)] [-i (full|full-sibling|local|local-sibling|none)] [-M (ignore|warn|fail)] [-S (ignore|warn|fail)] [-W (ignore|warn)] [-o filename] zonename [ (filename|-) ]\n', code: 1 };
      const path = normalize(file.startsWith('/') ? file : `${shell.cwd}/${file}`);
      if (!exists(shell.vfs, path) || isDir(shell.vfs, path)) return { stderr: `zone ${zone.replace(/\.$/, '')}/IN: loading from master file ${file} failed: file not found\nzone ${zone.replace(/\.$/, '')}/IN: not loaded due to errors.\n`, code: 1 };
      const r = checkZone(readFile(shell.vfs, path), zone, file);
      if (!r.ok) return { stderr: fromLines(r.lines), code: 1 };
      return { stdout: fromLines([`zone ${zone.replace(/\.$/, '')}/IN: loaded serial ${r.serial}`, 'OK']) };
    },
  },
  {
    name: 'ip',
    summary: 'インタフェースと経路を見る / 設定する（addr / link / route）',
    complete: ({ argv, prefix }) =>
      (argv.length <= 2 ? ['addr', 'link', 'route'] : ['add', 'del', 'set', 'show']).filter((s) =>
        s.startsWith(prefix),
      ),
    handler: ({ argv: raw, shell, runLine }) => {
      const net = shell.net;
      if (net === null) return ownAddresses(shell, raw);
      // 機器ごとを本物の netns に見立てる: `ip netns` で並べ、`ip netns exec 機器 コマンド` でその機器の中で打つ
      if (raw[1] === 'netns') {
        const sub = raw[2] ?? 'list';
        if (sub === 'list' || sub === 'ls' || sub === 'show') return { stdout: fromLines([...net.devices.values()].filter((d) => d.kind !== 'switch').map((d) => d.name)) };
        if (sub !== 'exec') return { stderr: `Command "${sub}" is unknown, try "ip netns help".\n`, code: 1 };
        const target = raw[3];
        const rest = raw.slice(4);
        if (target === undefined || rest.length === 0) return { stderr: 'No netns name specified\n', code: 1 };
        if (!net.devices.has(target)) return { stderr: `Cannot open network namespace "${target}": No such file or directory\n`, code: 1 };
        const inside: ShellState = { ...shell, vars: new Map([...shell.vars, ['NET_SELF', target]]) };
        const o = runLine(rest.join(' '), inside);
        return { stdout: o.stdout, stderr: o.stderr, code: o.code, patch: { net: o.state.net, vfs: o.state.vfs } };
      }
      // `ip -n <機器> ...` は、その機器の中で打ったのと同じにする（機器ごとを本物の netns に見立てる）
      const netns = raw[1] === '-n' || raw[1] === '-netns' ? raw[2] : undefined;
      if ((raw[1] === '-n' || raw[1] === '-netns') && netns === undefined) {
        return { stderr: 'Usage: ip -n <netns> OBJECT COMMAND\n', code: 255 };
      }
      const argv = netns === undefined ? raw : [raw[0] ?? 'ip', ...raw.slice(3)];
      const me = net.devices.get(netns ?? selfName(shell));
      if (!me) {
        return netns === undefined
          ? { stderr: '自分の機器が見つかりません\n', code: 1 }
          : { stderr: `Cannot open network namespace "${netns}": No such file or directory\n`, code: 1 };
      }
      const what = argv[1] ?? 'addr';
      const verb = argv[2] ?? '';

      // 表示以外（add / del / set / replace / flush）は設定として扱う
      if (verb !== '' && verb !== 'show' && verb !== 'list') {
        const ctx = { net, me: me.name, argv };
        if (what === 'addr' || what === 'address' || what === 'a') return ipAddr(ctx);
        if (what === 'link' || what === 'l') return ipLink(ctx);
        if (what === 'route' || what === 'r') return ipRoute(ctx);
      }

      if (what === 'link' || what === 'l') {
        return {
          stdout: fromLines(
            me.interfaces.flatMap((i, index) => [
              `${String(index + 1)}: ${i.name}: <${i.up ? 'UP,LOWER_UP' : 'DOWN'}> mtu ${String(i.mtu)}`,
              `    link/ether ${i.mac}`,
            ]),
          ),
        };
      }

      if (what === 'route' || what === 'r') {
        const lines = me.routes.map((r) =>
          r.via === null
            ? `${r.destination} dev ${r.dev} scope link`
            : `${r.destination === '0.0.0.0/0' ? 'default' : r.destination} via ${r.via} dev ${r.dev}`,
        );
        for (const i of me.interfaces) {
          // アドレスの付いていない口には直結経路が生えない
          if (!i.up || i.prefix === 0) continue;
          lines.push(`${parseCidr(`${i.ip}/${String(i.prefix)}`).network}/${String(i.prefix)} dev ${i.name} proto kernel scope link src ${i.ip}`);
        }
        return { stdout: fromLines(lines.sort()) };
      }

      const lines: string[] = [];
      me.interfaces.forEach((i, index) => {
        lines.push(`${String(index + 1)}: ${i.name}: <${i.up ? 'UP,LOWER_UP' : 'DOWN'}>`);
        lines.push(`    link/ether ${i.mac}`);
        lines.push(`    inet ${i.ip}/${String(i.prefix)} scope global ${i.name}`);
      });
      return { stdout: fromLines(lines) };
    },
  },
  {
    name: 'ipcalc',
    summary: 'CIDR を計算する',
    handler: ({ argv }) => {
      const target = argv[1];
      if (target === undefined) return { stderr: 'usage: ipcalc <cidr>\n', code: 2 };
      try {
        const c = parseCidr(target);
        return {
          stdout: fromLines([
            `Address:   ${c.address}`,
            `Netmask:   ${c.mask} = ${String(c.prefix)}`,
            `Network:   ${c.network}/${String(c.prefix)}`,
            `Broadcast: ${c.broadcast}`,
            `HostMin:   ${c.firstHost}`,
            `HostMax:   ${c.lastHost}`,
            `Hosts:     ${String(c.hosts)}`,
          ]),
        };
      } catch (error) {
        return { stderr: `ipcalc: ${error instanceof Error ? error.message : ''}\n`, code: 1 };
      }
    },
  },
  {
    name: 'netstat',
    summary: '待ち受けと経路の要約',
    handler: ({ shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const me = net.devices.get(selfName(shell));
      if (!me) return { stderr: '自分の機器が見つかりません\n', code: 1 };
      const rows = ['Proto  Local Address           State'];
      for (const port of me.listening) rows.push(`tcp    0.0.0.0:${String(port).padEnd(18)} LISTEN`);
      if (me.listening.length === 0) rows.push('(待ち受けているポートはありません)');
      return { stdout: fromLines(rows) };
    },
  },
];
