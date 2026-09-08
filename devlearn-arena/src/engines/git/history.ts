import type { VfsState } from '@/engines/kernel/vfs';
import { encode, parseCommit, serializeCommit, type Signature } from './objects';
import {
  FILE_MODE, commit, currentBranch, headCommit, materialize, treeFiles, walkWorktree,
  writeTreeFromIndex,
} from './repository';
import type { GitState, IndexEntry } from './types';

/**
 * 履歴を作り直す操作。
 *
 * どれも「既にあるコミットを別の親の上に置き直す」か「打ち消しを積む」かのどちらか。
 * 元のコミットは消さないので、参照さえ分かれば必ず戻せる。
 */

/** 共通の祖先を探す（LCA） */
export function mergeBase(git: GitState, a: string, b: string): string | null {
  const ancestors = (start: string): Set<string> => {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
      const hash = queue.shift();
      if (hash === undefined || seen.has(hash)) continue;
      seen.add(hash);
      const object = git.objects.read(hash);
      if (!object) continue;
      queue.push(...parseCommit(object.body).parents);
    }
    return seen;
  };
  const left = ancestors(a);
  const queue = [b];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const hash = queue.shift();
    if (hash === undefined || seen.has(hash)) continue;
    seen.add(hash);
    if (left.has(hash)) return hash;
    const object = git.objects.read(hash);
    if (!object) continue;
    queue.push(...parseCommit(object.body).parents);
  }
  return null;
}

export function isAncestor(git: GitState, maybeAncestor: string, hash: string): boolean {
  return mergeBase(git, maybeAncestor, hash) === maybeAncestor;
}

export interface MergePlan {
  /** 早送りで済む場合の移動先 */
  fastForward: string | null;
  base: string | null;
  ours: string;
  theirs: string;
  /** パス → 3つの版の中身 */
  files: Map<string, { base: string; ours: string; theirs: string }>;
}

export function planMerge(git: GitState, theirsRef: string): MergePlan | { error: string } {
  const ours = headCommit(git);
  const theirs = git.refs.get(`refs/heads/${theirsRef}`) ?? git.objects.resolve(theirsRef);
  if (theirs === undefined || theirs === null) {
    return { error: `merge: ${theirsRef} - not something we can merge` };
  }
  if (ours === null) return { error: 'fatal: 参照先のコミットがありません' };
  if (isAncestor(git, theirs, ours)) {
    return { fastForward: null, base: theirs, ours, theirs, files: new Map() };
  }
  if (isAncestor(git, ours, theirs)) {
    return { fastForward: theirs, base: ours, ours, theirs, files: new Map() };
  }

  const base = mergeBase(git, ours, theirs);
  const baseFiles = base === null ? new Map<string, string>() : materialize(git, base);
  const ourFiles = materialize(git, ours);
  const theirFiles = materialize(git, theirs);

  const files = new Map<string, { base: string; ours: string; theirs: string }>();
  for (const path of new Set([...baseFiles.keys(), ...ourFiles.keys(), ...theirFiles.keys()])) {
    files.set(path, {
      base: baseFiles.get(path) ?? '',
      ours: ourFiles.get(path) ?? '',
      theirs: theirFiles.get(path) ?? '',
    });
  }
  return { fastForward: null, base, ours, theirs, files };
}

/** 早送りでブランチを進める */
export function fastForwardTo(git: GitState, hash: string): GitState {
  const refs = new Map(git.refs);
  const branch = currentBranch(git);
  if (branch !== null) refs.set(`refs/heads/${branch}`, hash);
  return {
    ...git,
    refs,
    origHead: headCommit(git),
    head: branch === null ? { type: 'detached', hash } : git.head,
    reflog: [...git.reflog, { hash, message: 'merge: fast-forward' }],
  };
}

/** マージコミットを作る（親を2つ持つ） */
export function commitMerge(
  git: GitState,
  theirs: string,
  message: string,
  now: number,
): { git: GitState; hash: string } {
  const tree = writeTreeFromIndex(git);
  const parent = headCommit(git);
  const signature: Signature = { ...git.author, timestamp: now };
  const hash = git.objects.write(
    'commit',
    serializeCommit({
      tree,
      parents: parent === null ? [theirs] : [parent, theirs],
      author: signature,
      committer: signature,
      message,
    }),
  );
  const refs = new Map(git.refs);
  const branch = currentBranch(git);
  if (branch !== null) refs.set(`refs/heads/${branch}`, hash);
  return {
    git: {
      ...git,
      refs,
      origHead: parent,
      head: branch === null ? { type: 'detached', hash } : git.head,
      reflog: [...git.reflog, { hash, message: `merge: ${message}` }],
    },
    hash,
  };
}

export type ResetMode = 'soft' | 'mixed' | 'hard';

export interface ResetResult {
  git: GitState;
  /** hard のときに作業ツリーへ書き戻す内容 */
  worktree: Map<string, string> | null;
  error?: string;
}

export function reset(git: GitState, target: string, mode: ResetMode): ResetResult {
  const hash =
    git.refs.get(`refs/heads/${target}`) ??
    (target === 'HEAD' ? headCommit(git) : git.objects.resolve(target)) ??
    null;
  if (hash === null) return { git, worktree: null, error: `fatal: ambiguous argument '${target}'` };

  const refs = new Map(git.refs);
  const branch = currentBranch(git);
  if (branch !== null) refs.set(`refs/heads/${branch}`, hash);

  let index = git.index;
  if (mode !== 'soft') {
    index = new Map(
      [...treeFiles({ ...git, refs }, hash)].map(([path, blob]) => [
        path,
        { path, mode: FILE_MODE, hash: blob },
      ]),
    );
  }

  const next: GitState = {
    ...git,
    refs,
    index,
    origHead: headCommit(git),
    // reset は途中のマージを畳む（本物の git merge --abort に当たる）
    mergeHead: null,
    head: branch === null ? { type: 'detached', hash } : git.head,
    reflog: [...git.reflog, { hash, message: `reset: moving to ${target}` }],
  };
  return { git: next, worktree: mode === 'hard' ? materialize(next, hash) : null };
}

/** コミット1つを、別の親の上に作り直す（cherry-pick / rebase の基本操作） */
export function replayCommit(
  git: GitState,
  commitHash: string,
  ontoHash: string,
  now: number,
): { git: GitState; hash: string; conflicts: string[] } {
  const object = git.objects.read(commitHash);
  if (!object) return { git, hash: ontoHash, conflicts: [] };
  const parsed = parseCommit(object.body);
  const parent = parsed.parents[0] ?? null;

  const baseFiles = parent === null ? new Map<string, string>() : materialize(git, parent);
  const patchFiles = materialize(git, commitHash);
  const ontoFiles = materialize(git, ontoHash);

  const merged = new Map(ontoFiles);
  const conflicts: string[] = [];
  for (const path of new Set([...baseFiles.keys(), ...patchFiles.keys(), ...ontoFiles.keys()])) {
    const before = baseFiles.get(path) ?? '';
    const after = patchFiles.get(path) ?? '';
    const onto = ontoFiles.get(path) ?? '';
    if (before === after) continue;
    if (onto === before) {
      if (after === '') merged.delete(path);
      else merged.set(path, after);
      continue;
    }
    if (onto === after) continue;
    conflicts.push(path);
    merged.set(path, after);
  }

  const index = new Map<string, IndexEntry>();
  for (const [path, content] of merged) {
    index.set(path, { path, mode: FILE_MODE, hash: git.objects.write('blob', encode(content)) });
  }

  const staged: GitState = { ...git, index, head: { type: 'detached', hash: ontoHash } };
  const tree = writeTreeFromIndex(staged);
  const signature: Signature = { ...git.author, timestamp: now };
  const hash = git.objects.write(
    'commit',
    serializeCommit({
      tree,
      parents: [ontoHash],
      author: signature,
      committer: signature,
      message: parsed.message,
    }),
  );
  return { git: { ...staged, index }, hash, conflicts };
}

/** ブランチを onto の上に載せ替える（rebase） */
export function rebaseOnto(
  git: GitState,
  ontoRef: string,
  now: number,
): { git: GitState; replayed: number; conflicts: string[]; error?: string } {
  const onto = git.refs.get(`refs/heads/${ontoRef}`) ?? git.objects.resolve(ontoRef) ?? null;
  const head = headCommit(git);
  if (onto === null) return { git, replayed: 0, conflicts: [], error: `fatal: invalid upstream '${ontoRef}'` };
  if (head === null) return { git, replayed: 0, conflicts: [], error: 'fatal: コミットがありません' };
  if (isAncestor(git, onto, head)) {
    return { git, replayed: 0, conflicts: [] };
  }
  if (isAncestor(git, head, onto)) {
    return { git: fastForwardTo(git, onto), replayed: 0, conflicts: [] };
  }

  const base = mergeBase(git, head, onto);
  const toReplay: string[] = [];
  let current: string | null = head;
  while (current !== null && current !== base) {
    toReplay.push(current);
    const object = git.objects.read(current);
    current = object ? (parseCommit(object.body).parents[0] ?? null) : null;
  }
  toReplay.reverse();

  let state = git;
  let tip = onto;
  const conflicts: string[] = [];
  for (const hash of toReplay) {
    const result = replayCommit(state, hash, tip, now);
    state = result.git;
    tip = result.hash;
    conflicts.push(...result.conflicts);
  }

  const refs = new Map(git.refs);
  const branch = currentBranch(git);
  if (branch !== null) refs.set(`refs/heads/${branch}`, tip);
  return {
    git: {
      ...state,
      refs,
      head: branch === null ? { type: 'detached', hash: tip } : git.head,
      origHead: head,
      reflog: [...git.reflog, { hash: tip, message: `rebase: onto ${ontoRef}` }],
    },
    replayed: toReplay.length,
    conflicts,
  };
}

/** 打ち消しコミットを作る（revert） */
export function revertCommit(
  git: GitState,
  commitHash: string,
  now: number,
): { git: GitState; hash: string; error?: string } {
  const object = git.objects.read(commitHash);
  if (!object) return { git, hash: '', error: `fatal: bad revision '${commitHash}'` };
  const parsed = parseCommit(object.body);
  const parent = parsed.parents[0] ?? null;
  const head = headCommit(git);
  if (head === null) return { git, hash: '', error: 'fatal: コミットがありません' };

  const before = parent === null ? new Map<string, string>() : materialize(git, parent);
  const after = materialize(git, commitHash);
  const currentFiles = materialize(git, head);

  const next = new Map(currentFiles);
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const wasBefore = before.get(path);
    const wasAfter = after.get(path);
    if (wasBefore === wasAfter) continue;
    if (wasBefore === undefined) next.delete(path);
    else next.set(path, wasBefore);
  }

  const index = new Map<string, IndexEntry>();
  for (const [path, content] of next) {
    index.set(path, { path, mode: FILE_MODE, hash: git.objects.write('blob', encode(content)) });
  }
  const staged: GitState = { ...git, index };
  const result = commit(staged, `Revert "${parsed.message.trim()}"`, now);
  return { git: result.git, hash: result.hash };
}

/** stash に積む。作業ツリーの内容を退避する */
export function pushStash(git: GitState, vfs: VfsState, message: string): GitState {
  const entry = { message, files: [...walkWorktree(vfs, git.root)] };
  return { ...git, stash: [...git.stash, entry] };
}

/** stash から取り出す。作業ツリーに書き戻す内容を返す */
export function popStash(git: GitState): { git: GitState; files: Map<string, string> | null } {
  const entry = git.stash[git.stash.length - 1];
  if (!entry) return { git, files: null };
  return { git: { ...git, stash: git.stash.slice(0, -1) }, files: new Map(entry.files) };
}

export type { IndexEntry };
