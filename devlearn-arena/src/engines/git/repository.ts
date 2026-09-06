import { formatUnified } from '@/engines/kernel/diff';
import { list, stat, type VfsState } from '@/engines/kernel/vfs';
import {
  decode, encode, hashObject, ObjectStore, parseCommit, parseTree, serializeCommit, serializeTree,
  type Signature, type TreeEntry,
} from './objects';
import type { GitState, IndexEntry, StatusEntry, StatusReport } from './types';

export const DEFAULT_BRANCH = 'main';
const FILE_MODE = '100644';
const DIR_MODE = '040000';

export const defaultAuthor: Signature = {
  name: 'Learner',
  email: 'learner@example.com',
  timestamp: 0,
  timezone: '+0900',
};

export function initRepository(root: string, author: Signature = defaultAuthor): GitState {
  return {
    root,
    objects: new ObjectStore(),
    head: { type: 'branch', name: DEFAULT_BRANCH },
    refs: new Map(),
    index: new Map(),
    author,
    origHead: null,
    reflog: [],
    stash: [],
    remotes: new Map(),
  };
}

/** HEAD が指しているコミット。まだ1つも無ければ null */
export function headCommit(git: GitState): string | null {
  if (git.head.type === 'detached') return git.head.hash;
  return git.refs.get(`refs/heads/${git.head.name}`) ?? null;
}

export function currentBranch(git: GitState): string | null {
  return git.head.type === 'branch' ? git.head.name : null;
}

function relative(root: string, path: string): string | null {
  if (path === root) return '';
  const prefix = root === '/' ? '/' : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

/** 作業ツリーの全ファイル（.git 相当は持たないので除外は不要） */
export function walkWorktree(vfs: VfsState, root: string): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (path: string): void => {
    const node = stat(vfs, path);
    if (!node) return;
    if (node.kind === 'file') {
      const rel = relative(root, path);
      if (rel !== null && rel !== '') out.set(rel, node.content);
      return;
    }
    for (const name of list(vfs, path)) visit(path === '/' ? `/${name}` : `${path}/${name}`);
  };
  visit(root);
  return out;
}

/** コミットが指すツリーを、パス → blob ハッシュ に展開する */
export function treeFiles(git: GitState, commitHash: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (commitHash === null) return out;
  const commit = git.objects.read(commitHash);
  if (!commit) return out;
  const { tree } = parseCommit(commit.body);

  const visit = (hash: string, prefix: string): void => {
    const object = git.objects.read(hash);
    if (!object || object.type !== 'tree') return;
    for (const entry of parseTree(object.body)) {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.mode === DIR_MODE) visit(entry.hash, path);
      else out.set(path, entry.hash);
    }
  };
  visit(tree, '');
  return out;
}

/** git add。パスに一致する作業ツリーの内容をインデックスへ写す */
export function addPaths(
  git: GitState,
  vfs: VfsState,
  paths: readonly string[],
): { git: GitState; added: string[]; missing: string[] } {
  const worktree = walkWorktree(vfs, git.root);
  const index = new Map(git.index);
  const added: string[] = [];
  const missing: string[] = [];

  for (const raw of paths) {
    const target = raw === '.' ? '' : raw.replace(/^\.\//, '');
    const matched = [...worktree.keys()].filter(
      (p) => target === '' || p === target || p.startsWith(`${target}/`),
    );
    if (matched.length === 0) {
      missing.push(raw);
      continue;
    }
    for (const path of matched) {
      const content = worktree.get(path) ?? '';
      const hash = git.objects.write('blob', encode(content));
      index.set(path, { path, mode: FILE_MODE, hash });
      added.push(path);
    }
  }
  return { git: { ...git, index }, added, missing };
}

/** インデックスの内容から tree を作り、オブジェクトDBへ書き込む */
export function writeTreeFromIndex(git: GitState): string {
  interface Node {
    files: Map<string, string>;
    dirs: Map<string, Node>;
  }
  const root: Node = { files: new Map(), dirs: new Map() };

  for (const entry of git.index.values()) {
    const parts = entry.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const name = parts[i] ?? '';
      let next = node.dirs.get(name);
      if (!next) {
        next = { files: new Map(), dirs: new Map() };
        node.dirs.set(name, next);
      }
      node = next;
    }
    node.files.set(parts[parts.length - 1] ?? '', entry.hash);
  }

  const write = (node: Node): string => {
    const entries: TreeEntry[] = [
      ...[...node.files.entries()].map(([name, hash]) => ({ mode: FILE_MODE, name, hash })),
      ...[...node.dirs.entries()].map(([name, child]) => ({
        mode: DIR_MODE,
        name,
        hash: write(child),
      })),
    ];
    return git.objects.write('tree', serializeTree(entries));
  };
  return write(root);
}

export interface CommitResult {
  git: GitState;
  hash: string;
  /** 変更が無くコミットしなかった場合 */
  empty: boolean;
}

export function commit(git: GitState, message: string, now: number): CommitResult {
  const parent = headCommit(git);
  const tree = writeTreeFromIndex(git);

  if (parent !== null) {
    const previous = git.objects.read(parent);
    if (previous && parseCommit(previous.body).tree === tree) {
      return { git, hash: parent, empty: true };
    }
  }

  const signature: Signature = { ...git.author, timestamp: now };
  const hash = git.objects.write(
    'commit',
    serializeCommit({
      tree,
      parents: parent === null ? [] : [parent],
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
      reflog: [...git.reflog, { hash, message: `commit: ${message}` }],
    },
    hash,
    empty: false,
  };
}

export function status(git: GitState, vfs: VfsState): StatusReport {
  const worktree = walkWorktree(vfs, git.root);
  const committed = treeFiles(git, headCommit(git));

  const staged: StatusEntry[] = [];
  const unstaged: StatusEntry[] = [];
  const untracked: string[] = [];

  for (const [path, entry] of git.index) {
    const inCommit = committed.get(path);
    if (inCommit === undefined) staged.push({ path, state: 'added' });
    else if (inCommit !== entry.hash) staged.push({ path, state: 'modified' });
  }
  for (const path of committed.keys()) {
    if (!git.index.has(path)) staged.push({ path, state: 'deleted' });
  }

  for (const [path, content] of worktree) {
    const entry = git.index.get(path);
    if (!entry) {
      if (!committed.has(path)) untracked.push(path);
      else unstaged.push({ path, state: 'modified' });
      continue;
    }
    if (hashObject('blob', encode(content)) !== entry.hash) {
      unstaged.push({ path, state: 'modified' });
    }
  }
  for (const path of git.index.keys()) {
    if (!worktree.has(path)) unstaged.push({ path, state: 'deleted' });
  }

  const sort = (a: StatusEntry, b: StatusEntry): number => (a.path < b.path ? -1 : 1);
  staged.sort(sort);
  unstaged.sort(sort);
  untracked.sort();

  return {
    branch: currentBranch(git),
    detached: git.head.type === 'detached' ? git.head.hash : null,
    staged,
    unstaged,
    untracked,
    clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
  };
}

export interface LogEntry {
  hash: string;
  message: string;
  timestamp: number;
  parents: string[];
}

export function log(git: GitState, limit = 50): LogEntry[] {
  const out: LogEntry[] = [];
  const seen = new Set<string>();
  let current = headCommit(git);
  while (current !== null && out.length < limit && !seen.has(current)) {
    seen.add(current);
    const object = git.objects.read(current);
    if (!object) break;
    const parsed = parseCommit(object.body);
    out.push({
      hash: current,
      message: parsed.message.trim(),
      timestamp: parsed.author.timestamp,
      parents: [...parsed.parents],
    });
    current = parsed.parents[0] ?? null;
  }
  return out;
}

export function branches(git: GitState): string[] {
  return [...git.refs.keys()]
    .filter((r) => r.startsWith('refs/heads/'))
    .map((r) => r.slice('refs/heads/'.length))
    .sort();
}

export function createBranch(git: GitState, name: string): { git: GitState; error?: string } {
  if (git.refs.has(`refs/heads/${name}`)) {
    return { git, error: `fatal: a branch named '${name}' already exists` };
  }
  const target = headCommit(git);
  if (target === null) {
    return { git, error: `fatal: not a valid object name: '${DEFAULT_BRANCH}'` };
  }
  const refs = new Map(git.refs);
  refs.set(`refs/heads/${name}`, target);
  return { git: { ...git, refs } };
}

export function switchBranch(git: GitState, name: string): { git: GitState; error?: string } {
  if (!git.refs.has(`refs/heads/${name}`)) {
    return { git, error: `fatal: invalid reference: ${name}` };
  }
  return {
    git: {
      ...git,
      head: { type: 'branch', name },
      origHead: headCommit(git),
      reflog: [...git.reflog, { hash: git.refs.get(`refs/heads/${name}`) ?? '', message: `checkout: moving to ${name}` }],
    },
  };
}

/** コミットのツリーの内容を「パス → 中身」で取り出す（checkout 用） */
export function materialize(git: GitState, commitHash: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, hash] of treeFiles(git, commitHash)) {
    const blob = git.objects.read(hash);
    out.set(path, blob ? decode(blob.body) : '');
  }
  return out;
}

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
    head: branch === null ? { type: 'detached', hash } : git.head,
    reflog: [...git.reflog, { hash, message: `reset: moving to ${target}` }],
  };
  return { git: next, worktree: mode === 'hard' ? materialize(next, hash) : null };
}

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
