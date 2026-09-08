import { formatUnified } from '@/engines/kernel/diff';
import type { VfsState } from '@/engines/kernel/vfs';
import { decode } from './objects';
import { FILE_MODE, headCommit, treeFiles, walkWorktree } from './repository';
import type { GitState } from './types';

/**
 * 差分の表示。
 * 3面のうちどの2つを比べるかで、見えるものが変わる。
 * diff は 作業ツリー↔インデックス、diff --staged は インデックス↔HEAD。
 */
/** git diff。インデックスと作業ツリーの差分を unified 形式で返す */
export function diffWorktree(git: GitState, vfs: VfsState): string {
  const worktree = walkWorktree(vfs, git.root);
  const out: string[] = [];
  for (const [path, entry] of [...git.index].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const object = git.objects.read(entry.hash);
    const before = object ? decode(object.body) : '';
    const after = worktree.get(path) ?? '';
    if (before === after) continue;
    out.push(
      formatUnified(before.split('\n'), after.split('\n'), {
        from: `a/${path}`,
        to: `b/${path}`,
      }),
    );
  }
  return out.join('');
}

/** git diff --staged。HEAD とインデックスの差分 */
export function diffStaged(git: GitState): string {
  const committed = treeFiles(git, headCommit(git));
  const out: string[] = [];
  for (const [path, entry] of [...git.index].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const beforeHash = committed.get(path);
    const before = beforeHash === undefined ? '' : decode(git.objects.read(beforeHash)?.body ?? new Uint8Array());
    const object = git.objects.read(entry.hash);
    const after = object ? decode(object.body) : '';
    if (before === after) continue;
    out.push(
      formatUnified(before.split('\n'), after.split('\n'), {
        from: `a/${path}`,
        to: `b/${path}`,
      }),
    );
  }
  return out.join('');
}

/** git restore --staged。インデックスを HEAD の内容に戻す */
export function unstage(git: GitState, paths: readonly string[]): GitState {
  const committed = treeFiles(git, headCommit(git));
  const index = new Map(git.index);
  for (const path of paths) {
    const targets = [...index.keys()].filter((p) => p === path || p.startsWith(`${path}/`) || path === '.');
    for (const target of targets) {
      const original = committed.get(target);
      if (original === undefined) index.delete(target);
      else index.set(target, { path: target, mode: FILE_MODE, hash: original });
    }
  }
  return { ...git, index };
}
