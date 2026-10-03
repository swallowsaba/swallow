import type { VfsState } from '@/engines/kernel/vfs';
import { isAncestor } from './history';
import { parseCommit } from './objects';
import { currentBranch, materialize, status } from './repository';
import type { GitState } from './types';

/**
 * 実戦の達成条件 `{ kind: 'git', expr }`（docs/content-spec.md 2.4）を、リポジトリの状態で判定する。純粋な関数。
 *
 * expr は空白で区切った条件の並びで、全てを満たせば達成:
 *   branch:<枝>                  その枝がある
 *   branch:<枝> merged-into:<枝>  前の枝の先端が、後の枝に取り込まれている
 *   on:<枝>                      今いる枝
 *   clean                        記録していない変更が無く、統合の途中でもない
 *   commits:<枝>>=<数>           その枝から辿れるコミットの数
 *   resolved                     今の版のどのファイルにも、衝突の印（<<<<<<< など）が無い
 */

const MARKERS = /^(<{7}|={7}|>{7})( |$)/m;

function tip(git: GitState, branch: string): string | undefined {
  return git.refs.get(`refs/heads/${branch}`);
}

function countCommits(git: GitState, from: string): number {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const hash = stack.pop();
    if (hash === undefined || seen.has(hash)) continue;
    const object = git.objects.read(hash);
    if (!object || object.type !== 'commit') continue;
    seen.add(hash);
    stack.push(...parseCommit(object.body).parents);
  }
  return seen.size;
}

export function gitHolds(git: GitState | null, vfs: VfsState, expr: string): boolean {
  if (!git) return false;
  const terms = expr.trim().split(/\s+/);
  let subject: string | null = null;
  for (const term of terms) {
    const [key = '', value = ''] = term.split(/:(.*)/s);
    if (term === 'clean') {
      if (!status(git, vfs).clean || git.mergeHead !== null) return false;
    } else if (term === 'resolved') {
      const head = git.refs.get(`refs/heads/${currentBranch(git) ?? ''}`);
      if (!head) return false;
      for (const content of materialize(git, head).values()) if (MARKERS.test(content)) return false;
    } else if (key === 'branch') {
      if (!tip(git, value)) return false;
      subject = value;
    } else if (key === 'merged-into') {
      const from = subject === null ? undefined : tip(git, subject);
      const into = tip(git, value);
      if (!from || !into || !isAncestor(git, from, into)) return false;
    } else if (key === 'on') {
      if (currentBranch(git) !== value) return false;
    } else if (key === 'commits') {
      const m = /^([^>=<]+)>=(\d+)$/.exec(value);
      const from = m?.[1] ? tip(git, m[1]) : undefined;
      if (!m || !from || countCommits(git, from) < Number(m[2])) return false;
    } else {
      throw new Error(`git の条件「${term}」は知らない形`);
    }
  }
  return true;
}
