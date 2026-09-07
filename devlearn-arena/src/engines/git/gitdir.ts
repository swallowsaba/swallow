import { resolve } from '@/engines/kernel/path';
import { exists, readFile, remove, writeFile, type VfsState } from '@/engines/kernel/vfs';
import type { GitState } from './types';

/**
 * `.git` の下に置く管理ファイル。
 *
 * hook・sparse-checkout・worktree・rebase の todo は、本物も作業ツリーの
 * `.git/` に置いている。同じ場所に同じ名前で置けば、学習者が `cat` で覗けるし、
 * 保存も仮想FSに乗るので専用のスキーマが要らない。
 */
export const SPARSE_FILE = 'info/sparse-checkout';
export const HOOKS_DIR = 'hooks';
export const REBASE_DIR = 'rebase-merge';
export const REBASE_TODO = `${REBASE_DIR}/git-rebase-todo`;
export const REBASE_ONTO = `${REBASE_DIR}/onto`;
export const WORKTREES_DIR = 'worktrees';

export function gitPath(git: GitState, relative: string): string {
  return resolve(git.root, `.git/${relative}`);
}

export function readGitFile(vfs: VfsState, git: GitState, relative: string): string | null {
  const path = gitPath(git, relative);
  return exists(vfs, path) ? readFile(vfs, path) : null;
}

export function writeGitFile(
  vfs: VfsState,
  git: GitState,
  relative: string,
  content: string,
): VfsState {
  return writeFile(vfs, gitPath(git, relative), content, true);
}

export function removeGitFile(vfs: VfsState, git: GitState, relative: string): VfsState {
  const path = gitPath(git, relative);
  return exists(vfs, path) ? remove(vfs, path, true) : vfs;
}

/** sparse-checkout のパターン。設定されていなければ null（＝全部を展開する） */
export function sparsePatterns(vfs: VfsState, git: GitState): string[] | null {
  const text = readGitFile(vfs, git, SPARSE_FILE);
  if (text === null) return null;
  const patterns = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
  return patterns.length === 0 ? null : patterns;
}

/**
 * cone モードと同じ判定。
 * `/` で終わるか単なるディレクトリ名ならその配下、`/*` なら直下、それ以外は完全一致。
 */
export function matchesSparse(patterns: readonly string[], path: string): boolean {
  return patterns.some((raw) => {
    const pattern = raw.startsWith('/') ? raw.slice(1) : raw;
    if (pattern === '/*' || pattern === '*') return true;
    if (pattern.endsWith('/*')) {
      const dir = pattern.slice(0, -2);
      return path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/');
    }
    const dir = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
    return path === dir || path.startsWith(`${dir}/`);
  });
}
