import { exists, readFile, type VfsState } from '@/engines/kernel/vfs';
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
 *   先頭に ! を付けると否定（!committed:memo.txt は、memo.txt が記録に入っていない）
 *   committed:<パス>             今の枝の先の記録に、そのファイル（リポジトリの中のパス）が作業ツリーと同じ中身で入っている
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
  let subject: string | null = null;
  /** 1 つの条件を満たすか（branch は、次の merged-into の主語も決める） */
  const holds = (term: string): boolean => {
    const [key = '', value = ''] = term.split(/:(.*)/s);
    if (term === 'clean') return status(git, vfs).clean && git.mergeHead === null;
    if (term === 'resolved') {
      const head = git.refs.get(`refs/heads/${currentBranch(git) ?? ''}`);
      return head !== undefined && ![...materialize(git, head).values()].some((content) => MARKERS.test(content));
    }
    if (key === 'branch') {
      subject = value;
      return tip(git, value) !== undefined;
    }
    if (key === 'merged-into') {
      const from = subject === null ? undefined : tip(git, subject);
      const into = tip(git, value);
      return from !== undefined && into !== undefined && isAncestor(git, from, into);
    }
    if (key === 'on') return currentBranch(git) === value;
    if (key === 'committed') {
      const head = git.refs.get(`refs/heads/${currentBranch(git) ?? ''}`);
      const path = `${git.root}/${value}`;
      return head !== undefined && exists(vfs, path) && materialize(git, head).get(value) === readFile(vfs, path);
    }
    if (key === 'commits') {
      const m = /^([^>=<]+)>=(\d+)$/.exec(value);
      const from = m?.[1] ? tip(git, m[1]) : undefined;
      return m !== null && from !== undefined && countCommits(git, from) >= Number(m[2]);
    }
    throw new Error(`git の条件「${term}」は知らない形`);
  };
  return expr.trim().split(/\s+/).every((term) => (term.startsWith('!') ? !holds(term.slice(1)) : holds(term)));
}
