import { parseCommit } from './objects';
import { headCommit, isAncestor, DEFAULT_BRANCH } from './repository';
import type { GitState, RemoteRef as Remote } from './types';

/**
 * 仮想リモート。別インスタンスの GitState をそのまま持つ。
 * push / fetch は、足りないオブジェクトを相手へ写し、参照を進める操作として実装する。
 */
export type { Remote };

export function createRemote(name: string, url: string, state: GitState): Remote {
  return { name, url, state };
}

/** from に有って to に無いオブジェクトを、指定コミットから辿って写す */
export function transferObjects(from: GitState, to: GitState, tip: string): void {
  const queue = [tip];
  const seen = new Set<string>();

  const copy = (hash: string): void => {
    const object = from.objects.read(hash);
    if (!object) return;
    if (!to.objects.has(hash)) to.objects.write(object.type, object.body);
  };

  while (queue.length > 0) {
    const hash = queue.shift();
    if (hash === undefined || seen.has(hash)) continue;
    seen.add(hash);
    const object = from.objects.read(hash);
    if (!object) continue;
    copy(hash);
    if (object.type !== 'commit') continue;
    const parsed = parseCommit(object.body);
    queue.push(...parsed.parents);
    // ツリーとブロブも辿る
    const trees = [parsed.tree];
    while (trees.length > 0) {
      const treeHash = trees.shift();
      if (treeHash === undefined) continue;
      const tree = from.objects.read(treeHash);
      if (!tree) continue;
      copy(treeHash);
      for (const entry of parseTreeSafe(from, treeHash)) {
        if (entry.mode === '040000') trees.push(entry.hash);
        else copy(entry.hash);
      }
    }
  }
}

function parseTreeSafe(git: GitState, hash: string): { mode: string; hash: string }[] {
  const object = git.objects.read(hash);
  if (!object || object.type !== 'tree') return [];
  // parseTree を使うと循環参照になるため、必要な部分だけ読む
  const body = object.body;
  const out: { mode: string; hash: string }[] = [];
  let i = 0;
  while (i < body.length) {
    const nul = body.indexOf(0, i);
    if (nul === -1) break;
    const header = new TextDecoder().decode(body.slice(i, nul));
    const mode = header.slice(0, header.indexOf(' '));
    let hex = '';
    for (const b of body.slice(nul + 1, nul + 21)) hex += b.toString(16).padStart(2, '0');
    out.push({ mode, hash: hex });
    i = nul + 21;
  }
  return out;
}

export interface PushResult {
  remote: Remote;
  git: GitState;
  ok: boolean;
  message: string;
}

/**
 * push。fast-forward でなければ拒否する。
 * --force-with-lease は「自分が知っているリモートの位置」と一致するときだけ通す。
 */
export function push(
  git: GitState,
  remote: Remote,
  branch: string,
  options: { force?: boolean; forceWithLease?: boolean } = {},
): PushResult {
  const local = git.refs.get(`refs/heads/${branch}`);
  if (local === undefined) {
    return { remote, git, ok: false, message: `error: src refspec ${branch} does not match any` };
  }

  const remoteRef = `refs/heads/${branch}`;
  const remoteHash = remote.state.refs.get(remoteRef);
  const known = git.refs.get(`refs/remotes/${remote.name}/${branch}`);

  if (remoteHash !== undefined && !isAncestor(remote.state, remoteHash, local)) {
    if (options.forceWithLease === true && known !== remoteHash) {
      return {
        remote,
        git,
        ok: false,
        message:
          `! [rejected]        ${branch} -> ${branch} (stale info)\n` +
          'error: failed to push some refs\n',
      };
    }
    if (options.force !== true && options.forceWithLease !== true) {
      return {
        remote,
        git,
        ok: false,
        message:
          `! [rejected]        ${branch} -> ${branch} (fetch first)\n` +
          'hint: Updates were rejected because the remote contains work that you do not have locally.\n' +
          'hint: You may want to first integrate the remote changes (e.g. git pull) before pushing again.\n',
      };
    }
  }

  transferObjects(git, remote.state, local);
  const refs = new Map(remote.state.refs);
  refs.set(remoteRef, local);

  const localRefs = new Map(git.refs);
  localRefs.set(`refs/remotes/${remote.name}/${branch}`, local);

  return {
    remote: { ...remote, state: { ...remote.state, refs } },
    git: { ...git, refs: localRefs },
    ok: true,
    message: `To ${remote.url}\n   ${branch} -> ${branch}\n`,
  };
}

export interface FetchResult {
  git: GitState;
  updated: string[];
}

/** fetch。リモートの参照を refs/remotes/<name>/<branch> に写す */
export function fetch(git: GitState, remote: Remote): FetchResult {
  const refs = new Map(git.refs);
  const updated: string[] = [];
  for (const [ref, hash] of remote.state.refs) {
    if (!ref.startsWith('refs/heads/')) continue;
    const branch = ref.slice('refs/heads/'.length);
    const target = `refs/remotes/${remote.name}/${branch}`;
    if (refs.get(target) === hash) continue;
    transferObjects(remote.state, git, hash);
    refs.set(target, hash);
    updated.push(branch);
  }
  return { git: { ...git, refs }, updated };
}

/** clone 用。リモートの内容を持つ新しいリポジトリを作る */
export function cloneFrom(remote: Remote, root: string, git: GitState): GitState {
  const refs = new Map<string, string>();
  for (const [ref, hash] of remote.state.refs) {
    if (!ref.startsWith('refs/heads/')) continue;
    transferObjects(remote.state, git, hash);
    refs.set(ref, hash);
    refs.set(`refs/remotes/${remote.name}/${ref.slice('refs/heads/'.length)}`, hash);
  }
  return {
    ...git,
    root,
    refs,
    head: { type: 'branch', name: DEFAULT_BRANCH },
  };
}

/** 手元がリモートより進んでいるか／遅れているか */
export function aheadBehind(
  git: GitState,
  remoteName: string,
  branch: string,
): { ahead: number; behind: number } {
  const local = git.refs.get(`refs/heads/${branch}`) ?? headCommit(git);
  const remote = git.refs.get(`refs/remotes/${remoteName}/${branch}`);
  if (local === null || local === undefined || remote === undefined) return { ahead: 0, behind: 0 };

  /** そのコミットから辿れる全ての祖先（自身を含む） */
  const reachable = (from: string): Set<string> => {
    const seen = new Set<string>();
    const queue = [from];
    while (queue.length > 0) {
      const hash = queue.pop();
      if (hash === undefined || seen.has(hash)) continue;
      const object = git.objects.read(hash);
      if (!object || object.type !== 'commit') continue;
      seen.add(hash);
      queue.push(...parseCommit(object.body).parents);
    }
    return seen;
  };

  // git rev-list --count local...remote と同じ数え方。
  // 共通の祖先より先にある、それぞれの側だけのコミットを数える。
  const fromLocal = reachable(local);
  const fromRemote = reachable(remote);
  let ahead = 0;
  for (const hash of fromLocal) if (!fromRemote.has(hash)) ahead += 1;
  let behind = 0;
  for (const hash of fromRemote) if (!fromLocal.has(hash)) behind += 1;
  return { ahead, behind };
}
