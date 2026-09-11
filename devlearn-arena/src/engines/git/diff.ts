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

/**
 * 2つのコミットのツリーの差分。git show がコミットの中身を見せるのに使う。
 * before が null なら最初のコミットとして、全部のファイルを「足された」として出す。
 */
export function diffCommits(git: GitState, before: string | null, after: string): string {
  const read = (hash: string | undefined): string =>
    hash === undefined ? '' : decode(git.objects.read(hash)?.body ?? new Uint8Array());
  const from = treeFiles(git, before);
  const to = treeFiles(git, after);
  const paths = [...new Set([...from.keys(), ...to.keys()])].sort();
  const out: string[] = [];
  for (const path of paths) {
    const a = from.get(path);
    const b = to.get(path);
    if (a === b) continue;
    const body = formatUnified(read(a).split('\n'), read(b).split('\n'), {
      from: a === undefined ? '/dev/null' : `a/${path}`,
      to: b === undefined ? '/dev/null' : `b/${path}`,
    });
    out.push(`diff --git a/${path} b/${path}\n`);
    if (a === undefined) out.push('new file mode 100644\n');
    if (b === undefined) out.push('deleted file mode 100644\n');
    out.push(body);
  }
  return out.join('');
}
