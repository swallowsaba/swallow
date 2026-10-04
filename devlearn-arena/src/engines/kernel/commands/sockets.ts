import type { CommandSpec } from '../registry';
import { portsOf } from '../services';
import { fromLines } from './args';
import { currentUser } from './perm';

interface Row {
  state: string;
  local: string;
  peer: string;
  proc?: string;
}

/** 実戦の setup の、待ち受け以外の接続（ss で見える。src/engines/environments.ts の sockets） */
function connectionsOf(raw: string | undefined): Row[] {
  if (raw === undefined) return [];
  return (JSON.parse(raw) as { state: string; local: string; peer: string }[]).map((s) => ({ state: s.state, local: s.local, peer: s.peer }));
}

/**
 * ss（ソケットを見る）。待ち受けは、この機械の動いているサービスから作る（src/engines/kernel/services.ts）。
 * 待ち受け以外の接続（ESTAB・SYN-SENT・TIME-WAIT など）は、実戦の setup の sockets から出す。
 * 本物と同じく、-l は待ち受けだけ、-a は全て、どちらも無ければ待ち受け以外だけ。
 * -p は管理者の時だけプログラムを出す（ほかの利用者のプログラムは見えない）
 */
export const socketCommands: CommandSpec[] = [
  {
    name: 'ss',
    summary: 'ソケット（待ち受けと接続）の状態を見る（-tlnp・-tan）',
    handler: ({ argv, shell }) => {
      const flags = new Set(argv.slice(1).filter((a) => a.startsWith('-')).flatMap((a) => a.slice(1).split('')));
      const showProc = flags.has('p') && currentUser(shell) === 'root';
      const services = [...(shell.services?.services.values() ?? [])].filter((s) => s.active === 'active');
      const listening: Row[] = services.flatMap((s, i) => portsOf(s).map((port) => ({
        state: 'LISTEN',
        local: `${s.address ?? '0.0.0.0'}:${String(port)}`,
        peer: '0.0.0.0:*',
        proc: `users:(("${s.name}",pid=${String(800 + i)},fd=6))`,
      })));
      const connections = connectionsOf(shell.vars.get('__SOCKETS'));
      const rows = flags.has('a') ? [...listening, ...connections] : flags.has('l') ? listening : connections;
      const width = Math.max(18, ...rows.map((r) => r.local.length + 2));
      const peerWidth = Math.max(17, ...rows.map((r) => r.peer.length));
      const head = `State      Recv-Q Send-Q ${'Local Address:Port'.padStart(width)}  ${'Peer Address:Port'.padEnd(peerWidth)}${showProc ? ' Process' : ''}`;
      const lines = rows.map((r) => `${r.state.padEnd(10)} 0      ${r.state === 'LISTEN' ? '511' : '0  '}    ${r.local.padStart(width)}  ${r.peer.padEnd(peerWidth)}${showProc && r.proc ? ` ${r.proc}` : ''}`.trimEnd());
      return { stdout: fromLines([head.trimEnd(), ...lines]) };
    },
  },
];
