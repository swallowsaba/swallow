import { exists, readFile, type VfsState } from '@/engines/kernel/vfs';
import { isAncestor } from './history';
import { peel } from './refs';
import { parseCommit } from './objects';
import { ignoreRules, ignoredBy } from './ignore';
import { currentBranch, materialize, status, walkWorktree } from './repository';
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
 *   pushed:<枝>                  手元のその枝の先の記録が、origin のサーバ（setup の gitServers）の同じ枝に届いている
 *   branch・merged-into の枝は、origin/main のようなリモートの枝の控えでもよい
 *   linear                       今の枝の履歴に、合流の記録（親が 2 つ）が無い（一直線）
 *   tag:<名前>                   そのタグが、今の枝の先の記録を指している（注釈付きのタグは剥がして比べる）
 *   ignored:<パス>               そのパスが .gitignore の決まりに当たる（追跡しているかは問わない）
 *   history:<文字列>             今の枝の履歴のどこかの記録に、その文字列を含むファイルがある（消して記録し直しても、前の記録に残る）
 */

const MARKERS = /^(<{7}|={7}|>{7})( |$)/m;

function tip(git: GitState, branch: string): string | undefined {
  return git.refs.get(`refs/heads/${branch}`) ?? git.refs.get(`refs/remotes/${branch}`);
}

/** サーバのリポジトリ（URL・SSH の場所 → 履歴） */
export interface ServerRepo {
  url: string;
  ssh?: string;
  state: GitState;
}

/** 手元のその枝の先が、origin のサーバの同じ枝から辿れるか */
function pushed(git: GitState, branch: string, servers: ReadonlyMap<string, ServerRepo> | undefined): boolean {
  const local = git.refs.get(`refs/heads/${branch}`);
  const url = git.remotes.get('origin')?.url.replace(/\/+$/, '');
  const server = [...(servers?.values() ?? [])].find((g) => g.url === url || g.ssh === url);
  const remote = server?.state.refs.get(`refs/heads/${branch}`);
  if (local === undefined || !server || remote === undefined) return false;
  return server.state.objects.has(local) && isAncestor(server.state, local, remote);
}

/** from から辿れる記録のどれかに、その文字列を含むファイルがある */
function inHistory(git: GitState, from: string, text: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const hash = stack.pop();
    if (hash === undefined || seen.has(hash)) continue;
    seen.add(hash);
    const object = git.objects.read(hash);
    if (!object || object.type !== 'commit') continue;
    if ([...materialize(git, hash).values()].some((content) => content.includes(text))) return true;
    stack.push(...parseCommit(object.body).parents);
  }
  return false;
}

/** from から辿れる記録に、合流の記録（親が 2 つ以上）が無い */
function linear(git: GitState, from: string): boolean {
  for (let hash: string | undefined = from; hash !== undefined;) {
    const object = git.objects.read(hash);
    if (!object || object.type !== 'commit') return true;
    const parents = parseCommit(object.body).parents;
    if (parents.length > 1) return false;
    hash = parents[0];
  }
  return true;
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

export function gitHolds(git: GitState | null, vfs: VfsState, expr: string, servers?: ReadonlyMap<string, ServerRepo>): boolean {
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
    if (key === 'pushed') return pushed(git, value, servers);
    if (key === 'ignored') return ignoredBy(ignoreRules(walkWorktree(vfs, git.root)), value) !== null;
    if (key === 'tag') {
      const tagged = git.refs.get(`refs/tags/${value}`);
      const head = git.refs.get(`refs/heads/${currentBranch(git) ?? ''}`);
      return tagged !== undefined && head !== undefined && peel(git, tagged) === head;
    }
    if (term === 'linear') {
      const head = git.refs.get(`refs/heads/${currentBranch(git) ?? ''}`);
      return head !== undefined && linear(git, head);
    }
    if (key === 'committed') {
      const head = git.refs.get(`refs/heads/${currentBranch(git) ?? ''}`);
      const path = `${git.root}/${value}`;
      return head !== undefined && exists(vfs, path) && materialize(git, head).get(value) === readFile(vfs, path);
    }
    if (key === 'history') {
      const head = git.refs.get(`refs/heads/${currentBranch(git) ?? ''}`);
      return head !== undefined && value !== '' && inHistory(git, head, value);
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
