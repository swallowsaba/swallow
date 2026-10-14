import type { CommandSpec } from '../registry';
import { portsOf } from '../services';
import { fromLines } from './args';
import { currentUser } from './perm';

interface Row {
  netid: 'tcp' | 'udp';
  state: string;
  local: string;
  peer: string;
  proc?: string;
}

/** 実戦の setup の、待ち受け以外の接続（ss で見える。src/engines/environments.ts の sockets） */
function connectionsOf(raw: string | undefined): Row[] {
  if (raw === undefined) return [];
  return (JSON.parse(raw) as { state: string; local: string; peer: string }[]).map((s) => ({ netid: 'tcp' as const, state: s.state, local: s.local, peer: s.peer }));
}

/**
 * ss（ソケットを見る）。待ち受けは、この機械の動いているサービスから作る（src/engines/kernel/services.ts）。
 * 待ち受け以外の接続（ESTAB・SYN-SENT・TIME-WAIT など）は、実戦の setup の sockets から出す。
 * 本物と同じく、-l は待ち受けだけ、-a は全て、どちらも無ければ待ち受け以外だけ。-t は TCP、-u は UDP（待ち受けの状態は UNCONN）、
 * どちらも無ければ両方。両方を出す時は、先頭に Netid の欄を付ける。
 * -p は管理者の時だけプログラムを出す（ほかの利用者のプログラムは見えない）
 */
export const socketCommands: CommandSpec[] = [
  {
    name: 'ss',
    summary: 'ソケット（待ち受けと接続）の状態を見る（-tlnp・-ulnp・-tuln・-tan）',
    handler: ({ argv, shell }) => {
      const flags = new Set(argv.slice(1).filter((a) => a.startsWith('-')).flatMap((a) => a.slice(1).split('')));
      const showProc = flags.has('p') && currentUser(shell) === 'root';
      const tcp = flags.has('t') || !flags.has('u');
      const udp = flags.has('u') || !flags.has('t');
      const services = [...(shell.services?.services.values() ?? [])].filter((s) => s.active === 'active');
      const proc = (name: string, i: number, fd: number): string => `users:(("${name}",pid=${String(800 + i)},fd=${String(fd)}))`;
      const listening: Row[] = [
        ...(udp ? services.flatMap((s, i) => (s.udp ?? []).map((port) => ({ netid: 'udp' as const, state: 'UNCONN', local: `${s.address ?? '0.0.0.0'}:${String(port)}`, peer: '0.0.0.0:*', proc: proc(s.program ?? s.name, i, 5) }))) : []),
        ...(tcp ? services.flatMap((s, i) => portsOf(s).map((port) => ({ netid: 'tcp' as const, state: 'LISTEN', local: `${s.address ?? '0.0.0.0'}:${String(port)}`, peer: '0.0.0.0:*', proc: proc(s.program ?? s.name, i, 6) }))) : []),
      ];
      const connections = tcp ? connectionsOf(shell.vars.get('__SOCKETS')) : [];
      const rows = flags.has('a') ? [...listening, ...connections] : flags.has('l') ? listening : connections;
      const both = tcp && udp;
      const width = Math.max(18, ...rows.map((r) => r.local.length + 2));
      const peerWidth = Math.max(17, ...rows.map((r) => r.peer.length));
      const head = `${both ? 'Netid ' : ''}State      Recv-Q Send-Q ${'Local Address:Port'.padStart(width)}  ${'Peer Address:Port'.padEnd(peerWidth)}${showProc ? ' Process' : ''}`;
      const lines = rows.map((r) => `${both ? r.netid.padEnd(6) : ''}${r.state.padEnd(10)} 0      ${r.state === 'LISTEN' ? '511' : '0  '}    ${r.local.padStart(width)}  ${r.peer.padEnd(peerWidth)}${showProc && r.proc ? ` ${r.proc}` : ''}`.trimEnd());
      return { stdout: fromLines([head.trimEnd(), ...lines]) };
    },
  },
];
