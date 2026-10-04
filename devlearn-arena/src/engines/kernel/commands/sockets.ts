import type { CommandSpec } from '../registry';
import { portsOf } from '../services';
import { fromLines } from './args';
import { currentUser } from './perm';

/**
 * ss（待ち受けているソケットを見る）。この機械の動いているサービスの待ち受けから作る（src/engines/kernel/services.ts）。
 * 出力の形は本物の ss -tlnp に寄せる。-p は管理者の時だけプログラムを出す（ほかの利用者のプログラムは見えない）
 */
export const socketCommands: CommandSpec[] = [
  {
    name: 'ss',
    summary: '待ち受けているポートと、そのプログラムを見る（-tlnp）',
    handler: ({ argv, shell }) => {
      const flags = new Set(argv.slice(1).filter((a) => a.startsWith('-')).flatMap((a) => a.slice(1).split('')));
      const showProc = flags.has('p') && currentUser(shell) === 'root';
      const services = [...(shell.services?.services.values() ?? [])].filter((s) => s.active === 'active');
      const rows = services.flatMap((s, i) => portsOf(s).map((port) => ({
        local: `${s.address ?? '0.0.0.0'}:${String(port)}`,
        proc: `users:(("${s.name}",pid=${String(800 + i)},fd=6))`,
      })));
      const width = Math.max(18, ...rows.map((r) => r.local.length + 2));
      const head = `State  Recv-Q Send-Q ${'Local Address:Port'.padStart(width)}  Peer Address:Port${showProc ? ' Process' : ''}`;
      const lines = rows.map((r) => `LISTEN 0      511    ${r.local.padStart(width)}      0.0.0.0:*${showProc ? `      ${r.proc}` : ''}`);
      return { stdout: fromLines([head, ...lines]) };
    },
  },
];
