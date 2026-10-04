import { resolve } from '../path';
import type { CommandContext, CommandResult, CommandSpec, ShellState } from '../registry';
import { scriptText, withoutPositional, withPositional } from '../script';
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

  // 本文を 1 つのまとまりとして読む（if・for は複数の行にまたがる）
  const r = runLine(scriptText(node.content), withPositional(shell, full, args));
  // exit で抜けた印と set -e は、呼んだ側に持ち出さない
  const vars = new Map(r.state.vars);
  vars.delete('__EXIT');
  vars.delete('__ERREXIT');
  const after = withoutPositional({ ...r.state, vars }, shell);
  const { stdout, stderr, code } = r;
  const patch: Partial<ShellState> = keep ? after : { ...after, vars: shell.vars, cwd: shell.cwd };
  return { stdout, stderr, code, patch };
}

export const shellRunCommands: CommandSpec[] = [
  { name: 'sh', summary: 'ファイルに書いた手順を、別のシェルで動かす', handler: (ctx) => runFile(ctx, false) },
  { name: 'bash', summary: 'ファイルに書いた手順を、別のシェルで動かす', handler: (ctx) => runFile(ctx, false) },
  { name: 'source', summary: 'ファイルに書いた手順を、今のシェルで読み込む（~/.bashrc を読み直す）', handler: (ctx) => runFile(ctx, true) },
  { name: '.', summary: 'source と同じ', handler: (ctx) => runFile(ctx, true) },
];
