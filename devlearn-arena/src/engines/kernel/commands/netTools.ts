import { resolve as dnsResolve, type DnsWorld } from '@/engines/net/dns';
import { BROADCAST_MAC, packet } from '@/engines/net/factory';
import { dhcpRequest, dhcpServer, runHttp, tlsHandshake, type Certificate } from '@/engines/net/services';
import { deliver } from '@/engines/net/stack';
import { advance, clientAction, openConnection, retransmit, retransmitTimeout, type Connection } from '@/engines/net/tcp';
import type { Topology } from '@/engines/net/types';
import type { CommandSpec, ShellState } from '../registry';
import { fromLines, parseArgs } from './args';

const NO_NET = 'ネットワークが用意されていません。ネットワークの任務を選んでください。\n';

function selfName(shell: ShellState): string {
  return shell.vars.get('NET_SELF') ?? 'pc1';
}

function selfIp(topology: Topology, name: string): string {
  return topology.devices.get(name)?.interfaces.find((i) => i.up && i.ip !== '')?.ip ?? '0.0.0.0';
}

function table(rows: string[][]): string {
  if (rows.length === 0) return '';
  const widths = (rows[0] ?? []).map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length)));
  return fromLines(
    rows.map((row) => row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  ').trimEnd()),
  );
}

/**
 * ARP 表・MAC 表・NAT 表・VLAN を覗く道具と、
 * TCP / DNS / DHCP / TLS / HTTP のふるまいを見る道具。
 * どれも状態から導く。表示のために別の値を持たない。
 */
export const netToolCommands: CommandSpec[] = [
  {
    name: 'arp',
    summary: 'ARP 表を見る（-a）／通信して学習させる',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const me = selfName(shell);
      const device = net.devices.get(me);
      if (device === undefined) return { stderr: `arp: ${me} がありません\n`, code: 1 };

      const { operands } = parseArgs(argv);
      const target = operands[0];
      if (target !== undefined) {
        // 実際にパケットを1つ送って解決させる
        const result = deliver(net, me, packet(selfIp(net, me), target, { protocol: 'icmp' }));
        const learned = result.learned.get(me);
        if (learned === undefined || learned.arp[target] === undefined) {
          return { stderr: `arp: ${target} の MAC を解決できません\n`, code: 1 };
        }
        return {
          stdout: `${target} は ${learned.arp[target]}\n`,
          patch: { net: { ...net, devices: new Map([...net.devices, ...result.learned]) } },
        };
      }

      const entries = Object.entries(device.arp);
      if (entries.length === 0) return { stdout: 'ARP 表は空です（まだ誰とも話していません）\n' };
      return {
        stdout: table([['ADDRESS', 'HWADDRESS'], ...entries.map(([ip, mac]) => [ip, mac])]),
      };
    },
  },

  {
    name: 'bridge',
    summary: 'スイッチの MAC アドレステーブルと VLAN を見る',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const { operands } = parseArgs(argv);
      const name = operands[1] ?? operands[0];
      const switches = [...net.devices.values()].filter((d) => d.kind === 'switch');
      const target = name === undefined ? switches[0] : net.devices.get(name);
      if (target === undefined || target.kind !== 'switch') {
        return { stderr: 'usage: bridge fdb <switch>\n', code: 1 };
      }

      const rows = [['MAC', 'PORT', 'VLAN']];
      for (const [mac, port] of Object.entries(target.macTable)) {
        const iface = target.interfaces.find((p) => p.name === port);
        rows.push([mac, port, iface?.vlan === null || iface === undefined ? '-' : String(iface.vlan)]);
      }
      if (rows.length === 1) {
        return { stdout: `${target.name}: MAC テーブルは空です（まだ何も通っていません）\n` };
      }
      return { stdout: table(rows) };
    },
  },

  {
    name: 'nat',
    summary: 'NAT の変換表を見る',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const { operands } = parseArgs(argv);
      const routers = [...net.devices.values()].filter((d) => d.nat !== null);
      const target = operands[0] === undefined ? routers[0] : net.devices.get(operands[0]);
      if (target?.nat == null) return { stderr: 'NAT を持つ機器がありません\n', code: 1 };

      const rows = [['INSIDE', 'OUTSIDE', 'DESTINATION']];
      for (const entry of target.nat.table) {
        rows.push([
          `${entry.insideIp}:${String(entry.insidePort)}`,
          `${target.nat.outsideIp}:${String(entry.outsidePort)}`,
          entry.destinationIp,
        ]);
      }
      if (rows.length === 1) {
        return { stdout: `${target.name}: 変換表は空です（まだ外に出ていません）\n` };
      }
      return { stdout: table(rows) };
    },
  },

  {
    name: 'tcp',
    summary: 'TCP の状態遷移を1手ずつ進める（connect/send/close/tick/retransmit/state）',
    handler: ({ argv, shell }) => {
      const raw = shell.vars.get('TCP_STATE');
      const connection: Connection = raw === undefined ? openConnection() : (JSON.parse(raw) as Connection);
      const action = argv[1] ?? 'state';
      const save = (next: Connection) =>
        new Map([...shell.vars, ['TCP_STATE', JSON.stringify(next)]]);

      if (action === 'reset') {
        const fresh = openConnection();
        const dropList = argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
        const next = { ...fresh, dropped: dropList };
        return {
          stdout:
            dropList.length === 0
              ? '接続を初期化しました\n'
              : `接続を初期化しました（${dropList.join(',')} 番目のセグメントを落とします）\n`,
          patch: { vars: save(next) },
        };
      }

      if (action === 'state') {
        const lines = [
          `client: ${connection.client.state} (seq=${String(connection.client.seq)} ack=${String(connection.client.ack)})`,
          `server: ${connection.server.state} (seq=${String(connection.server.seq)} ack=${String(connection.server.ack)})`,
          `tick=${String(connection.tick)} 再送=${String(connection.retransmits)} 回`,
          '',
          ...connection.segments.map(
            (s, i) =>
              `${String(i).padStart(2)} ${s.from === 'client' ? '→' : '←'} [${s.flags.join(',')}] seq=${String(s.seq)} ack=${String(s.ack)} len=${String(s.length)}`,
          ),
        ];
        return { stdout: fromLines(lines) };
      }

      if (action === 'tick') {
        const ticks = Number(argv[2] ?? 1);
        const next = advance(connection, Number.isFinite(ticks) ? ticks : 1);
        return {
          stdout: `tick=${String(next.tick)} client=${next.client.state}\n`,
          patch: { vars: save(next) },
        };
      }

      if (action === 'retransmit') {
        const result = retransmit(connection);
        if (result.error !== null) return { stderr: `${result.error}\n`, code: 1 };
        const wait = retransmitTimeout(result.connection.retransmits);
        return {
          stdout: `${result.note}（次の待ち時間は ${String(wait)} tick）\n`,
          patch: { vars: save(result.connection) },
        };
      }

      if (action === 'connect' || action === 'send' || action === 'close') {
        const length = action === 'send' ? Number(argv[2] ?? 100) : undefined;
        const result = clientAction(connection, action, { length });
        if (result.error !== null) return { stderr: `${result.error}\n`, code: 1 };
        return {
          stdout: `${result.note}\nclient=${result.connection.client.state} server=${result.connection.server.state}\n`,
          patch: { vars: save(result.connection) },
        };
      }

      return { stderr: 'usage: tcp <connect|send|close|tick|retransmit|state|reset>\n', code: 2 };
    },
  },

  {
    name: 'dnstrace',
    summary: 'DNS をルートから再帰的に辿る',
    handler: ({ argv, shell }) => {
      const raw = shell.vars.get('DNS_WORLD');
      if (raw === undefined) return { stderr: 'DNS の世界が用意されていません\n', code: 1 };
      const world = JSON.parse(raw) as Omit<DnsWorld, 'cache'> & { cache: [string, { record: { name: string; type: 'A'; value: string; ttl: number }; expiresAt: number }][] };
      const hydrated: DnsWorld = { ...world, cache: new Map(world.cache) };

      const name = argv[1];
      if (name === undefined) return { stderr: 'usage: dnstrace <name>\n', code: 2 };
      const result = dnsResolve(hydrated, name);

      const lines = result.steps.map(
        (s) => `${s.server.padEnd(16)} ${s.question.padEnd(24)} ${s.answer}`,
      );
      if (result.fromCache) lines.unshift('（キャッシュから返答）');
      if (result.error !== null) lines.push(result.error);
      else lines.push(`答え: ${result.record?.value ?? ''}（TTL ${String(result.record?.ttl ?? 0)}）`);

      const saved = JSON.stringify({ ...result.world, cache: [...result.world.cache] });
      return {
        stdout: fromLines(lines),
        code: result.error === null ? 0 : 1,
        patch: { vars: new Map([...shell.vars, ['DNS_WORLD', saved]]) },
      };
    },
  },

  {
    name: 'dhclient',
    summary: 'DHCP でアドレスを借りる（DORA を表示する）',
    handler: ({ shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const me = selfName(shell);
      const device = net.devices.get(me);
      const mac = device?.interfaces[0]?.mac ?? BROADCAST_MAC;

      const raw = shell.vars.get('DHCP_SERVER');
      const server = raw === undefined ? dhcpServer() : (JSON.parse(raw) as ReturnType<typeof dhcpServer>);
      const result = dhcpRequest(server, mac);

      const lines = result.steps.map((s) => `${s.from === 'client' ? '→' : '←'} ${s.kind.padEnd(9)} ${s.detail}`);
      if (result.error !== null) lines.push(result.error);
      const vars = new Map([...shell.vars, ['DHCP_SERVER', JSON.stringify(result.server)]]);

      // 借りたアドレスを実際にインタフェースへ載せる
      if (result.lease !== null && device !== undefined) {
        const interfaces = device.interfaces.map((i, index) =>
          index === 0 ? { ...i, ip: result.lease?.ip ?? i.ip } : i,
        );
        const devices = new Map(net.devices);
        devices.set(me, { ...device, interfaces });
        return {
          stdout: fromLines(lines),
          patch: { net: { ...net, devices }, vars },
        };
      }
      return { stdout: fromLines(lines), code: result.error === null ? 0 : 1, patch: { vars } };
    },
  },

  {
    name: 'tlscheck',
    summary: '証明書を検証してハンドシェイクを試す',
    handler: ({ argv, shell }) => {
      const host = argv[1];
      if (host === undefined) return { stderr: 'usage: tlscheck <host>\n', code: 2 };
      const raw = shell.vars.get('TLS_CERTS');
      if (raw === undefined) return { stderr: '証明書が用意されていません\n', code: 1 };
      const certs = JSON.parse(raw) as Record<string, Certificate>;
      const now = Number(shell.vars.get('TLS_NOW') ?? '0');
      const trusted = (shell.vars.get('TLS_TRUSTED') ?? 'DevLearn CA').split(',');

      const certificate = certs[host];
      if (certificate === undefined) {
        return { stderr: `${host}: 証明書がありません\n`, code: 1 };
      }
      const result = tlsHandshake(certificate, host, now, trusted);
      const lines = result.steps.map((s) => `${s.from === 'client' ? '→' : '←'} ${s.message.padEnd(12)} ${s.detail}`);
      lines.push(
        result.established
          ? `ハンドシェイク成立（${String(result.roundTrips)} 往復）`
          : `失敗: ${result.error ?? ''}`,
      );
      return { stdout: fromLines(lines), code: result.established ? 0 : 1 };
    },
  },

  {
    name: 'httpbench',
    summary: '同じ要求列を HTTP/1.1 と HTTP/2 で流して所要時間を比べる',
    handler: ({ argv }) => {
      const count = Number(argv[1] ?? 12);
      const cost = Number(argv[2] ?? 2);
      if (!Number.isFinite(count) || !Number.isFinite(cost)) {
        return { stderr: 'usage: httpbench [要求数] [1件あたりの時間]\n', code: 2 };
      }
      const requests = Array.from({ length: count }, (_, i) => ({
        path: `/asset-${String(i + 1)}.js`,
        cost,
      }));
      const one = runHttp(requests, '1.1');
      const two = runHttp(requests, '2');
      return {
        stdout: fromLines([
          `要求 ${String(count)} 件 / 1件あたり ${String(cost)} tick`,
          `HTTP/1.1: 接続 ${String(one.connections)} 本, 完了 ${String(one.finishedAt)} tick, 待たされた回数 ${String(one.blocked)}`,
          `HTTP/2  : 接続 ${String(two.connections)} 本, 完了 ${String(two.finishedAt)} tick, 待たされた回数 ${String(two.blocked)}`,
          '',
          '1.1 は1接続に1要求ずつ。先頭が終わるまで後ろは待つ（Head-of-Line ブロッキング）。',
          '2 は1接続に多重化するので、互いを待たない。',
        ]),
      };
    },
  },
];
