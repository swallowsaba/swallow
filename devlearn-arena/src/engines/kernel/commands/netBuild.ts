import {
  addDevice, addLink, addRoute, clearAddress, delRoute, removeDevice, removeLink,
  setAddress, setBlocked, setDnsRecord, setInterfaceUp, setLinkUp, setListening, setMtu,
  setNat, setPortVlans, setVlan, type BuildResult,
} from '@/engines/net/build';
import { nat as natConfig } from '@/engines/net/factory';
import { sameNetwork } from '@/engines/net/subnet';
import type { DeviceKind, Topology } from '@/engines/net/types';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { fromLines, parseArgs } from './args';

const NO_NET = 'ネットワークが用意されていません。ネットワークの任務を選んでください。\n';

/** いま操作している機器。`export NET_SELF=r1` で切り替える */
export function selfName(shell: ShellState): string {
  return shell.vars.get('NET_SELF') ?? 'pc1';
}

export function render(result: BuildResult, stdout = ''): CommandResult {
  if (result.error !== null) return { stderr: `${result.error}\n`, code: 2 };
  return { stdout, patch: { net: result.topology } };
}

const KINDS: Record<string, DeviceKind> = {
  host: 'host', pc: 'host',
  router: 'router', r: 'router',
  switch: 'switch', sw: 'switch',
};

function labAdd(net: Topology, argv: readonly string[]): CommandResult {
  const kind = KINDS[argv[2] ?? ''];
  const name = argv[3];
  if (kind === undefined || name === undefined) {
    return { stderr: 'usage: netlab add <host|router|switch> <name>\n', code: 2 };
  }
  return render(addDevice(net, kind, name), `${kind} ${name} を用意しました\n`);
}

function labLink(net: Topology, argv: readonly string[]): CommandResult {
  const { operands, values } = parseArgs(['netlab', ...argv.slice(2)], { withValue: ['mtu'] });
  const a = operands[0];
  const b = operands[1];
  if (a === undefined || b === undefined) {
    return { stderr: 'usage: netlab link <dev>:<if> <dev>:<if> [--mtu N]\n', code: 2 };
  }
  const mtu = values.has('mtu') ? Number(values.get('mtu')) : undefined;
  if (mtu !== undefined && (!Number.isInteger(mtu) || mtu < 68)) {
    return { stderr: 'mtu は 68 以上の整数で指定してください\n', code: 2 };
  }
  return render(addLink(net, a, b, mtu), `${a} <-> ${b} を繋ぎました\n`);
}

function labList(net: Topology): CommandResult {
  const lines: string[] = [];
  for (const device of [...net.devices.values()].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const ports = device.interfaces
      .map((i) => `${i.name}${i.ip === '0.0.0.0' ? '' : `(${i.ip}/${String(i.prefix)})`}${i.up ? '' : ' DOWN'}`)
      .join(' ');
    lines.push(`${device.kind.padEnd(6)} ${device.name.padEnd(10)} ${ports}`);
  }
  for (const link of net.links) {
    lines.push(`cable  ${link.a} <-> ${link.b}${link.up ? '' : ' (抜けている)'} mtu=${String(link.mtu)}`);
  }
  if (lines.length === 0) return { stdout: 'まだ何もありません\n' };
  return { stdout: fromLines(lines) };
}

/**
 * 実機では「機器を用意する」「ケーブルを挿す」は手でやる仕事なので、
 * それに当たる操作だけをこの演習用の道具にまとめる。
 * 用意したあとの設定は本物と同じ ip / bridge / nat で行う。
 */
export const netLabCommands: CommandSpec[] = [
  {
    name: 'netlab',
    summary: '機器とケーブルを用意する（add / link / unlink / rm / cable / list）',
    complete: ({ argv, prefix }) =>
      (argv.length <= 2 ? ['add', 'link', 'unlink', 'rm', 'cable', 'list'] : Object.keys(KINDS)).filter((s) =>
        s.startsWith(prefix),
      ),
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const sub = argv[1] ?? 'list';
      switch (sub) {
        case 'add':
          return labAdd(net, argv);
        case 'rm': {
          const name = argv[2];
          if (name === undefined) return { stderr: 'usage: netlab rm <name>\n', code: 2 };
          return render(removeDevice(net, name), `${name} を片付けました\n`);
        }
        case 'link':
          return labLink(net, argv);
        case 'unlink': {
          const a = argv[2];
          const b = argv[3];
          if (a === undefined || b === undefined) {
            return { stderr: 'usage: netlab unlink <dev>:<if> <dev>:<if>\n', code: 2 };
          }
          return render(removeLink(net, a, b), 'ケーブルを外しました\n');
        }
        case 'cable': {
          // 挿したまま「抜く / 挿す」を切り替える。障害の再現に使う
          const state = argv[2];
          const a = argv[3];
          const b = argv[4];
          if ((state !== 'up' && state !== 'down') || a === undefined || b === undefined) {
            return { stderr: 'usage: netlab cable <up|down> <dev>:<if> <dev>:<if>\n', code: 2 };
          }
          return render(setLinkUp(net, a, b, state === 'up'), `ケーブルを${state === 'up' ? '挿し' : '抜き'}ました\n`);
        }
        case 'list':
          return labList(net);
        default:
          return { stderr: `netlab: unknown command "${sub}"\n`, code: 2 };
      }
    },
  },

  {
    name: 'service',
    summary: '待ち受けポートを開け閉めする（listen / close / block / unblock）',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const sub = argv[1] ?? '';
      const port = Number(argv[2]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { stderr: 'usage: service <listen|close|block|unblock> <port>\n', code: 2 };
      }
      const me = selfName(shell);
      switch (sub) {
        case 'listen':
          return render(setListening(net, me, port, true), `${me}: ${String(port)} を待ち受けます\n`);
        case 'close':
          return render(setListening(net, me, port, false), `${me}: ${String(port)} を閉じました\n`);
        case 'block':
          return render(setBlocked(net, me, port, true), `${me}: ${String(port)} を落とします\n`);
        case 'unblock':
          return render(setBlocked(net, me, port, false), `${me}: ${String(port)} を通します\n`);
        default:
          return { stderr: 'usage: service <listen|close|block|unblock> <port>\n', code: 2 };
      }
    },
  },

  {
    name: 'hosts',
    summary: '名前と IP の対応を足す / 消す',
    handler: ({ argv, shell }) => {
      const net = shell.net;
      if (net === null) return { stderr: NO_NET, code: 1 };
      const sub = argv[1] ?? 'list';
      if (sub === 'list') {
        return { stdout: fromLines([...net.dns].sort().map(([n, ip]) => `${ip}\t${n}`)) };
      }
      const name = argv[2];
      if (name === undefined) return { stderr: 'usage: hosts <add|rm> <name> [ip]\n', code: 2 };
      if (sub === 'rm') return render(setDnsRecord(net, name, null), `${name} を消しました\n`);
      const ip = argv[3];
      if (sub !== 'add' || ip === undefined) {
        return { stderr: 'usage: hosts <add|rm> <name> [ip]\n', code: 2 };
      }
      return render(setDnsRecord(net, name, ip), `${name} -> ${ip}\n`);
    },
  },
];

export interface IpEditContext {
  net: Topology;
  me: string;
  argv: readonly string[];
}

/** `ip addr add 10.0.0.1/24 dev eth0` */
export function ipAddr({ net, me, argv }: IpEditContext): CommandResult {
  const action = argv[2] ?? '';
  const dev = devOf(argv);
  if (dev === null) return { stderr: 'usage: ip addr <add|del> <cidr> dev <if>\n', code: 2 };
  if (action === 'add' || action === 'replace') {
    const cidr = argv[3];
    if (cidr === undefined) return { stderr: 'usage: ip addr add <cidr> dev <if>\n', code: 2 };
    return render(setAddress(net, me, dev, cidr));
  }
  if (action === 'del' || action === 'flush') {
    return render(clearAddress(net, me, dev));
  }
  return { stderr: `ip: unknown command "addr ${action}"\n`, code: 2 };
}

/** `ip link set eth0 up` / `ip link set eth0 mtu 1400` */
export function ipLink({ net, me, argv }: IpEditContext): CommandResult {
  if (argv[2] !== 'set') return { stderr: 'usage: ip link set <if> <up|down|mtu N>\n', code: 2 };
  const dev = argv[3] === 'dev' ? argv[4] : argv[3];
  const rest = argv.slice(argv[3] === 'dev' ? 5 : 4);
  if (dev === undefined) return { stderr: 'usage: ip link set <if> <up|down|mtu N>\n', code: 2 };
  const what = rest[0];
  if (what === 'up' || what === 'down') {
    return render(setInterfaceUp(net, me, dev, what === 'up'));
  }
  if (what === 'mtu') {
    return render(setMtu(net, me, dev, Number(rest[1])));
  }
  return { stderr: 'usage: ip link set <if> <up|down|mtu N>\n', code: 2 };
}

/** `ip route add 10.1.0.0/16 via 10.0.0.254 dev eth0` */
export function ipRoute({ net, me, argv }: IpEditContext): CommandResult {
  const action = argv[2] ?? '';
  const destinationRaw = argv[3];
  if (destinationRaw === undefined) {
    return { stderr: 'usage: ip route <add|del> <cidr|default> [via <ip>] dev <if>\n', code: 2 };
  }
  const destination = destinationRaw === 'default' ? '0.0.0.0/0' : destinationRaw;
  const via = valueAfter(argv, 'via');
  // dev を書かなければ、本物と同じく次のアドレスと同じ網の口を使う
  const dev = devOf(argv) ?? (via !== undefined ? devToward(net, me, via) : null);
  if (dev === null) return { stderr: via !== undefined ? 'Error: Nexthop has invalid gateway.\n' : 'Error: Device for nexthop is not up.\n', code: 2 };
  const route = { destination, via: via ?? null, dev };
  if (action === 'add') return render(addRoute(net, me, route));
  if (action === 'del') return render(delRoute(net, me, route));
  if (action === 'replace') {
    const cleared = delRoute(net, me, route);
    return render(addRoute(cleared.error === null ? cleared.topology : net, me, route));
  }
  return { stderr: `ip: unknown command "route ${action}"\n`, code: 2 };
}

/** そのアドレスと同じ網にある、自分の口の名前 */
function devToward(net: Topology, me: string, ip: string): string | null {
  const d = net.devices.get(me);
  return d?.interfaces.find((i) => i.up && i.prefix > 0 && sameNetwork(i.ip, ip, i.prefix))?.name ?? null;
}

function valueAfter(argv: readonly string[], keyword: string): string | undefined {
  const at = argv.indexOf(keyword);
  return at === -1 ? undefined : argv[at + 1];
}

function devOf(argv: readonly string[]): string | null {
  return valueAfter(argv, 'dev') ?? null;
}

/** `bridge vlan add dev sw1:p1 vid 10` / `... vid 10,20 trunk` */
/**
 * `bridge vlan add dev 口 vid 番号 [pvid] [untagged]`・`bridge vlan del dev 口 vid 番号`・`bridge vlan show [dev 口]`（本物の Linux のブリッジの書き方。
 * スイッチの中で打つ: ip netns exec スイッチ bridge vlan …）。前からの書き方 `dev スイッチ:口` も受け取る
 */
export function bridgeVlan(net: Topology, argv: readonly string[], me: string): CommandResult {
  const action = argv[2] ?? 'show';
  const target = valueAfter(argv, 'dev');
  if (action === 'show') {
    const sw = net.devices.get(me);
    if (!sw || sw.kind !== 'switch') return { stdout: 'port              vlan-id\n' };
    const ports = sw.interfaces.filter((i) => target === undefined || i.name === target);
    const lines = ['port              vlan-id'];
    for (const i of ports) {
      const ids = [...new Set([...(i.vlans ?? (i.vlan !== null ? [i.vlan] : [])), ...i.trunkVlans])].sort((x, y) => x - y);
      ids.forEach((id, k) => {
        const tags = [id === i.vlan ? 'PVID' : '', (i.vlans ?? [i.vlan]).includes(id) ? 'Egress Untagged' : ''].filter(Boolean).join(' ');
        lines.push(`${(k === 0 ? i.name : '').padEnd(18)}${String(id)}${tags ? ` ${tags}` : ''}`);
      });
    }
    return { stdout: fromLines(lines) };
  }
  const vid = valueAfter(argv, 'vid');
  if (target === undefined) return { stderr: 'Device and VLAN ID are required arguments.\n', code: 255 };
  const at = target.indexOf(':');
  const device = at > 0 ? target.slice(0, at) : me;
  const portName = at > 0 ? target.slice(at + 1) : target;
  const sw = net.devices.get(device);
  const p = sw?.interfaces.find((i) => i.name === portName);
  if (!sw || !p) return { stderr: `Cannot find device "${portName}"\n`, code: 1 };
  // 前からの書き方（dev スイッチ:口）は、口をその VLAN だけにする（trunk・vid の並びはタグを付けて通す。del は VLAN を外す）
  if (at > 0) {
    if (action === 'del') return render(setVlan(net, device, portName, null, []));
    if (action !== 'add') return { stderr: `bridge: unknown command "vlan ${action}"\n`, code: 2 };
    if (vid === undefined) return { stderr: 'vid を指定してください\n', code: 2 };
    const ids = vid.split(',').map(Number);
    if (ids.some((x) => !Number.isInteger(x) || x < 1 || x > 4094)) return { stderr: 'vid は 1..4094 の整数です\n', code: 2 };
    return argv.includes('trunk') || ids.length > 1 ? render(setVlan(net, device, portName, null, ids)) : render(setVlan(net, device, portName, ids[0] ?? null, []));
  }
  if (vid === undefined) return { stderr: 'Device and VLAN ID are required arguments.\n', code: 255 };
  const n = Number(vid);
  if (!Number.isInteger(n) || n < 1 || n > 4094) return { stderr: `Invalid VLAN ID "${vid}"\n`, code: 255 };
  const members = p.vlans ?? (p.vlan !== null ? [p.vlan] : []);
  if (action === 'del') {
    if (!members.includes(n) && !p.trunkVlans.includes(n)) return {};
    return render(setPortVlans(net, device, portName, p.vlan === n ? null : p.vlan, members.filter((x) => x !== n), p.trunkVlans.filter((x) => x !== n)));
  }
  if (action !== 'add') return { stderr: `Command "${action}" is unknown, try "bridge vlan help".\n`, code: 255 };
  const untagged = argv.includes('untagged');
  const pvid = argv.includes('pvid');
  return render(setPortVlans(net, device, portName, pvid ? n : p.vlan, untagged ? [...new Set([...members, n])] : members, untagged ? p.trunkVlans : [...new Set([...p.trunkVlans, n])]));
}

/** `nat enable --inside 10.0.0.0/24 --outside 203.0.113.1` */
export function natConfigure(net: Topology, me: string, argv: readonly string[]): CommandResult {
  const { values } = parseArgs(['nat', ...argv.slice(2)], { withValue: ['inside', 'outside'] });
  const action = argv[1] ?? '';
  if (action === 'disable') return render(setNat(net, me, null), `${me}: NAT を止めました\n`);
  const inside = values.get('inside');
  const outside = values.get('outside');
  if (inside === undefined || outside === undefined) {
    return { stderr: 'usage: nat enable --inside <cidr> --outside <ip>\n', code: 2 };
  }
  return render(setNat(net, me, natConfig(inside, outside)), `${me}: ${inside} を ${outside} で外に出します\n`);
}
