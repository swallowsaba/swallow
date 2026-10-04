import { localCurl } from './httpLocal';
import { addressOf, deviceAt, resolveName, roundTrip, rttOf, traceHops } from '@/engines/net/probe';
import { parseCidr } from '@/engines/net/subnet';
import type { DeliveryResult, Device, Topology } from '@/engines/net/types';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { fromLines, parseArgs } from './args';
import { ipAddr, ipLink, ipRoute } from './netBuild';

const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;
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
      t.hops.forEach((h, i) => lines.push(`${String(i + 1).padStart(2)}  ${h === null ? '* * *' : `${h}  ${rttOf(i, 1)} ms`}`));
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
        return {
          stdout: fromLines(verbose),
          stderr: `curl: (${refused ? '7' : '28'}) Failed to connect to ${hostName} port ${String(port)}: ${refused ? 'Connection refused' : 'Connection timed out'}\n`,
          code: refused ? 7 : 28,
          patch,
        };
      }
      if (flags.has('v')) {
        verbose.push(`* Connected to ${hostName} (${ip}) port ${String(port)}`, `> GET ${path} HTTP/1.1`, `> Host: ${hostName}`, '>', '< HTTP/1.1 200 OK', '< Content-Type: text/html', '<');
      }
      const body = deviceAt(net, ip)?.body ?? `<html><body>It works: ${hostName}</body></html>`;
      return { stdout: `${fromLines(verbose)}${body}\n`, patch };
    },
  },
  {
    name: 'dig',
    summary: '名前を引く（名前に結び付いたアドレスを DNS に問い合わせる）',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const short = argv.includes('+short');
      const target = argv.slice(1).find((a) => !a.startsWith('+') && !a.startsWith('@') && a.toUpperCase() !== 'A');
      if (target === undefined) return { stderr: 'usage: dig <名前>\n', code: 1 };
      const name = target.replace(/\.$/, '');
      const ip = IPV4.test(name) ? null : resolveName(net, name);
      if (short) return { stdout: ip === null ? '' : `${ip}\n` };
      const lines = [
        `; <<>> DiG 9.18.28 <<>> ${target}`,
        `;; ->>HEADER<<- opcode: QUERY, status: ${ip === null ? 'NXDOMAIN' : 'NOERROR'}, id: 4242`,
        '',
        ';; QUESTION SECTION:',
        `;${name}.\t\t\tIN\tA`,
        ...(ip === null ? [] : ['', ';; ANSWER SECTION:', `${name}.\t\t300\tIN\tA\t${ip}`]),
        '',
        `;; SERVER: ${addressOf(net, selfName(shell))}#53`,
      ];
      return { stdout: fromLines(lines) };
    },
  },
  {
    name: 'ip',
    summary: 'インタフェースと経路を見る / 設定する（addr / link / route）',
    complete: ({ argv, prefix }) =>
      (argv.length <= 2 ? ['addr', 'link', 'route'] : ['add', 'del', 'set', 'show']).filter((s) =>
        s.startsWith(prefix),
      ),
    handler: ({ argv: raw, shell }) => {
      const net = shell.net;
      if (net === null) return ownAddresses(shell, raw);
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
