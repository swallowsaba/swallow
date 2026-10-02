import { displayPath } from '@/engines/kernel/path';
import type { ShellState } from '@/engines/kernel/registry';

/** プロンプト（利用者@機械:場所$。管理者は #） */
export function promptOf(shell: ShellState): string {
  const user = shell.vars.get('USER') ?? 'learner';
  const host = shell.vars.get('HOSTNAME') ?? 'arena';
  return `${user}@${host}:${displayPath(shell.cwd)}${user === 'root' ? '#' : '$'} `;
}
