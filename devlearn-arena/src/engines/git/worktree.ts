import { resolve } from '@/engines/kernel/path';
import { exists, remove, writeFile, type VfsState } from '@/engines/kernel/vfs';
import { matchesSparse, sparsePatterns } from './gitdir';
import { materialize, treeFiles } from './repository';
import type { GitState } from './types';

/**
 * 作業ツリーを、あるコミットの内容に揃える。
 *
 * `materialize` を書き戻すだけでは、切り替え元にあって切り替え先に無いファイルが
 * 残ってしまう。本物の checkout / reset --hard / revert は追跡中のファイルを消すので、
 * 消えた分をここで取り除く。追跡していないファイルは本物と同じく残す。
 *
 * sparse-checkout が設定されていれば、パターンに合うものだけを展開する。
 */
export function checkoutWorktree(
  vfs: VfsState,
  git: GitState,
  from: string | null,
  to: string | null,
  options: { into?: string } = {},
): VfsState {
  const root = options.into ?? git.root;
  const patterns = sparsePatterns(vfs, git);
  const keep = (path: string): boolean => patterns === null || matchesSparse(patterns, path);

  const next = to === null ? new Map<string, string>() : materialize(git, to);
  const previous = from === null ? new Map<string, string>() : treeFiles(git, from);
  let out = vfs;
  for (const path of previous.keys()) {
    if (next.has(path) && keep(path)) continue;
    const full = resolve(root, path);
    if (exists(out, full)) out = remove(out, full);
  }
  for (const [path, content] of next) {
    if (!keep(path)) continue;
    out = writeFile(out, resolve(root, path), content, true);
  }
  return out;
}
