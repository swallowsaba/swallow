import { packet } from '@/engines/net/factory';
import { deliver } from '@/engines/net/stack';
import { parseCidr } from '@/engines/net/subnet';
import type { Device, Topology } from '@/engines/net/types';
import type { CommandSpec, ShellState } from '../registry';
import { fromLines, parseArgs } from './args';
import { ipAddr, ipLink, ipRoute } from './netBuild';

const NO_NET = 'ネットワークが用意されていません。ネットワークの任務を選んでください。\n';

function selfName(shell: ShellState): string {
  return shell.vars.get('NET_SELF') ?? 'pc1';
}

function selfIp(topology: Topology, name: string): string {
  return topology.devices.get(name)?.interfaces.find((i) => i.up)?.ip ?? '0.0.0.0';
}

/** 名前なら DNS を引く。IP ならそのまま */
function resolve(topology: Topology, target: string): { ip: string | null; note: string } {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(target)) return { ip: target, note: '' };
  const ip = topology.dns.get(target);
  if (ip === undefined) return { ip: null, note: `${target}: Name or service not known` };
  return { ip, note: `${target} has address ${ip}` };
}

/** 配送で学んだこと（ARP 表・MAC 表・NAT 表）を構成に書き戻す */
function withLearned(net: Topology, learned: ReadonlyMap<string, Device>): Topology {
  if (learned.size === 0) return net;
  return { ...net, devices: new Map([...net.devices, ...learned]) };
}

export const netCommands: CommandSpec[] = [
  {
    name: 'ping',
    summary: '到達性を確かめる（ICMP）',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const target = argv[1];
      if (target === undefined) return { stderr: 'usage: ping <host>\n', code: 2 };

      const resolved = resolve(net, target);
      if (resolved.ip === null) return { stderr: `ping: ${resolved.note}\n`, code: 2 };

      const me = selfName(shell);
      const result = deliver(net, me, packet(selfIp(net, me), resolved.ip, { protocol: 'icmp' }));
      const patch = { net: withLearned(net, result.learned) };
      if (!result.delivered) {
        return {
          stdout: `PING ${target} (${resolved.ip})\n`,
          stderr: `${result.error ?? '到達できません'}\n`,
          code: 1,
          patch,
        };
      }
      const hops = result.hops.length - 1;
      return {
        stdout:
          `PING ${target} (${resolved.ip})\n` +
          `64 bytes from ${resolved.ip}: icmp_seq=1 ttl=${String(
            result.hops[result.hops.length - 1]?.packet.ip.ttl ?? 64,
          )} hops=${String(hops)}\n` +
          '\n1 packets transmitted, 1 received, 0% packet loss\n',
        patch,
      };
    },
  },
  {
    name: 'traceroute',
    summary: '経路を1ホップずつ表示する',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const target = argv[1];
      if (target === undefined) return { stderr: 'usage: traceroute <host>\n', code: 2 };
      const resolved = resolve(net, target);
      if (resolved.ip === null) return { stderr: `traceroute: ${resolved.note}\n`, code: 2 };

      const me = selfName(shell);
      const result = deliver(net, me, packet(selfIp(net, me), resolved.ip, { protocol: 'icmp' }));
      const lines = [`traceroute to ${target} (${resolved.ip}), 16 hops max`];
      result.hops.forEach((hop, i) => {
        const ip = hop.packet.ip;
        lines.push(
          `${String(i + 1).padStart(2)}  ${hop.device}  ttl=${String(ip.ttl)}  ${hop.note}`,
        );
      });
      if (!result.delivered) lines.push(`  * * *  ${result.error ?? ''}`);
      return {
        stdout: fromLines(lines),
        code: result.delivered ? 0 : 1,
        patch: { net: withLearned(net, result.learned) },
      };
    },
  },
  {
    name: 'curl',
    summary: 'HTTP で取りに行く',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const { flags, operands } = parseArgs(argv);
      const url = operands[0];
      if (url === undefined) return { stderr: 'usage: curl [-v] <url>\n', code: 2 };

      const match = /^(?:https?:\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/.exec(url);
      const hostName = match?.[1] ?? url;
      const port = Number(match?.[2] ?? (url.startsWith('https') ? 443 : 80));
      const path = match?.[3] ?? '/';

      const resolved = resolve(net, hostName);
      if (resolved.ip === null) {
        return { stderr: `curl: (6) Could not resolve host: ${hostName}\n`, code: 6 };
      }

      const me = selfName(shell);
      const result = deliver(net, me, packet(selfIp(net, me), resolved.ip, { dstPort: port }));
      const verbose: string[] = [];
      if (flags.has('v')) {
        verbose.push(`* Trying ${resolved.ip}:${String(port)}...`);
        for (const hop of result.hops) verbose.push(`* via ${hop.device} (ttl ${String(hop.packet.ip.ttl)})`);
      }

      const patch = { net: withLearned(net, result.learned) };
      if (!result.delivered) {
        const reason = result.error ?? '';
        const code = reason.includes('Connection refused') ? 7 : 28;
        return {
          stdout: fromLines(verbose),
          stderr: `curl: (${String(code)}) ${reason}\n`,
          code,
          patch,
        };
      }
      if (flags.has('v')) {
        verbose.push(`* Connected to ${hostName} (${resolved.ip}) port ${String(port)}`);
        verbose.push(`> GET ${path} HTTP/1.1`);
        verbose.push(`> Host: ${hostName}`);
        verbose.push('>');
        verbose.push('< HTTP/1.1 200 OK');
        verbose.push('< Content-Type: text/html');
        verbose.push('<');
      }
      return {
        stdout: `${fromLines(verbose)}<html><body>It works: ${hostName}</body></html>\n`,
        patch,
      };
    },
  },
  {
    name: 'dig',
    summary: '名前を引く',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const target = argv[1];
      if (target === undefined) return { stderr: 'usage: dig <name>\n', code: 2 };
      const ip = net.dns.get(target);
      if (ip === undefined) {
        return { stdout: `;; ->>HEADER<<- status: NXDOMAIN\n;; QUESTION SECTION:\n;${target}.\tIN\tA\n\n` , code: 1 };
      }
      return {
        stdout:
          ';; ->>HEADER<<- status: NOERROR\n' +
          ';; QUESTION SECTION:\n' +
          `;${target}.\tIN\tA\n\n` +
          ';; ANSWER SECTION:\n' +
          `${target}.\t30\tIN\tA\t${ip}\n`,
      };
    },
  },
  {
    name: 'ip',
    summary: 'インタフェースと経路を見る / 設定する（addr / link / route）',
    complete: ({ argv, prefix }) =>
      (argv.length <= 2 ? ['addr', 'link', 'route'] : ['add', 'del', 'set', 'show']).filter((s) =>
        s.startsWith(prefix),
      ),
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const me = net.devices.get(selfName(shell));
      if (!me) return { stderr: '自分の機器が見つかりません\n', code: 1 };
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
