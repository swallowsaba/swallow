import { allows } from './perm';
import { dirname, resolve } from './path';
import type { ShellState } from './registry';
import { metaOf, stat } from './vfs';

export interface ScriptLookup {
  /** 見つかった実体のパス */
  path: string;
  content: string;
  /** 実行権が無い */
  denied: boolean;
}

/**
 * その名前で実行できるファイルを探す。
 *
 * `/` を含むならその場所を直接、含まないなら PATH を順に見る。
 * 実機と同じく、見つかっても実行権が無ければ拒む。
 */
export function findScript(state: ShellState, name: string): ScriptLookup | null {
  const candidates = name.includes('/')
    ? [resolve(state.cwd, name)]
    : (state.vars.get('PATH') ?? '').split(':').filter((p) => p !== '').map((dir) => `${dir}/${name}`);

  for (const path of candidates) {
    const node = stat(state.vfs, path);
    if (node?.kind !== 'file') continue;
    const user = state.vars.get('USER') ?? 'learner';
    return {
      path,
      content: node.content,
      denied: !allows(metaOf(state.vfs, path), user, 'exec'),
    };
  }
  return null;
}

/** shebang と空行・注釈を落として、実行すべき行だけにする */
export function scriptLines(content: string): string[] {
  return content
    .split('\n')
    .filter((line, index) => !(index === 0 && line.startsWith('#!')))
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * 引数を位置パラメータとして置いた状態を作る。
 * スクリプトの中だけで見えるようにするため、呼び出し元には戻さない。
 */
export function withPositional(state: ShellState, scriptPath: string, args: readonly string[]): ShellState {
  const vars = new Map(state.vars);
  vars.set('0', scriptPath);
  args.forEach((arg, i) => {
    vars.set(String(i + 1), arg);
  });
  vars.set('#', String(args.length));
  vars.set('@', args.join(' '));
  // 呼び出したスクリプトの置き場所。実機の慣習に寄せる
  vars.set('SCRIPT_DIR', dirname(scriptPath));
  return { ...state, vars };
}

/** スクリプトを抜けたあと、位置パラメータだけを元に戻す */
export function withoutPositional(after: ShellState, before: ShellState): ShellState {
  const vars = new Map(after.vars);
  for (const key of [...vars.keys()]) {
    if (/^\d+$/.test(key) || key === '#' || key === '@' || key === 'SCRIPT_DIR') {
      const original = before.vars.get(key);
      if (original === undefined) vars.delete(key);
      else vars.set(key, original);
    }
  }
  return { ...after, vars };
}
