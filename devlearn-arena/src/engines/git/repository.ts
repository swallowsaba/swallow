import { list, readFile, stat, type VfsState } from '@/engines/kernel/vfs';
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

export type { IndexEntry };
