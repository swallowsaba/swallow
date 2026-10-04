import { resolve } from '../path';
import type { CommandContext, CommandResult, CommandSpec, ShellState } from '../registry';
import { scriptLines, withoutPositional, withPositional } from '../script';
import { stat } from '../vfs';
import { denied } from './perm';

/**
 * ファイルに書いた手順を動かす sh / bash と、今のシェルで読み込む source（.）。
 * sh・bash は別のシェルで動かすので、中で変えた変数と現在地は戻る（ファイルへの変更は残る）。
 * source は今のシェルで動かすので、変数と現在地が残る（~/.bashrc を読み直す時に使う）
 */
function runFile({ argv, shell, runLine }: CommandContext, keep: boolean): CommandResult {
  const [name = 'sh', file, ...args] = argv;
  if (file === undefined) return { stderr: `${name}: 動かすファイルを書く（例: ${name} script.sh）\n`, code: 2 };
  const full = resolve(shell.cwd, file);
  const node = stat(shell.vfs, full);
  if (!node) return { stderr: `${name}: ${file}: No such file or directory\n`, code: keep ? 1 : 127 };
  if (node.kind === 'dir') return { stderr: `${name}: ${file}: Is a directory\n`, code: 126 };
  const blocked = denied(shell, file, 'read', name);
  if (blocked) return blocked;

  let state: ShellState = withPositional(shell, full, args);
  let stdout = '';
  let stderr = '';
  let code = 0;
  for (const line of scriptLines(node.content)) {
    const r = runLine(line, state);
    state = r.state;
    stdout += r.stdout;
    stderr += r.stderr;
    code = r.code;
  }
  const after = withoutPositional(state, shell);
  const patch: Partial<ShellState> = keep ? after : { ...after, vars: shell.vars, cwd: shell.cwd };
  return { stdout, stderr, code, patch };
}

export const shellRunCommands: CommandSpec[] = [
  { name: 'sh', summary: 'ファイルに書いた手順を、別のシェルで動かす', handler: (ctx) => runFile(ctx, false) },
  { name: 'bash', summary: 'ファイルに書いた手順を、別のシェルで動かす', handler: (ctx) => runFile(ctx, false) },
  { name: 'source', summary: 'ファイルに書いた手順を、今のシェルで読み込む（~/.bashrc を読み直す）', handler: (ctx) => runFile(ctx, true) },
  { name: '.', summary: 'source と同じ', handler: (ctx) => runFile(ctx, true) },
];
