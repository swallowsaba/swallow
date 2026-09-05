import { basename, dirname, normalize, resolve, ROOT } from './path';

export type VfsNode = { kind: 'dir' } | { kind: 'file'; content: string };

/**
 * 仮想ファイルシステム。
 * 木構造ではなく「絶対パス → ノード」の平坦な Map で持つ。
 * スナップショット（タイムトラベル）が Map の複製だけで済み、
 * 深い階層の不変更新を書かずに済むため。
 */
export interface VfsState {
  readonly nodes: ReadonlyMap<string, VfsNode>;
}

export type VfsErrorCode = 'ENOENT' | 'EEXIST' | 'ENOTDIR' | 'EISDIR' | 'ENOTEMPTY';

export class VfsError extends Error {
  constructor(
    readonly code: VfsErrorCode,
    readonly path: string,
  ) {
    super(`${code}: ${path}`);
    this.name = 'VfsError';
  }
}

export function createVfs(seed: Readonly<Record<string, string | null>> = {}): VfsState {
  const nodes = new Map<string, VfsNode>([[ROOT, { kind: 'dir' }]]);
  let state: VfsState = { nodes };
  for (const [rawPath, content] of Object.entries(seed)) {
    const path = normalize(rawPath);
    state = content === null ? mkdir(state, path, true) : writeFile(state, path, content, true);
  }
  return state;
}

function withNodes(state: VfsState, mutate: (nodes: Map<string, VfsNode>) => void): VfsState {
  const next = new Map(state.nodes);
  mutate(next);
  return { nodes: next };
}

export function stat(state: VfsState, path: string): VfsNode | undefined {
  return state.nodes.get(normalize(path));
}

export function exists(state: VfsState, path: string): boolean {
  return state.nodes.has(normalize(path));
}

export function isDir(state: VfsState, path: string): boolean {
  return stat(state, path)?.kind === 'dir';
}

export function readFile(state: VfsState, path: string): string {
  const p = normalize(path);
  const node = state.nodes.get(p);
  if (!node) throw new VfsError('ENOENT', p);
  if (node.kind === 'dir') throw new VfsError('EISDIR', p);
  return node.content;
}

/** 直下の子の名前を辞書順で返す。 */
export function list(state: VfsState, path: string): string[] {
  const p = normalize(path);
  const node = state.nodes.get(p);
  if (!node) throw new VfsError('ENOENT', p);
  if (node.kind === 'file') return [basename(p)];
  const prefix = p === ROOT ? ROOT : `${p}/`;
  const names: string[] = [];
  for (const key of state.nodes.keys()) {
    if (key === p || !key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    if (rest.includes('/')) continue;
    names.push(rest);
  }
  return names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function assertParentDir(state: VfsState, path: string): void {
  const parent = dirname(path);
  const node = state.nodes.get(parent);
  if (!node) throw new VfsError('ENOENT', parent);
  if (node.kind === 'file') throw new VfsError('ENOTDIR', parent);
}

export function mkdir(state: VfsState, path: string, recursive = false): VfsState {
  const p = normalize(path);
  const existing = state.nodes.get(p);
  if (existing) {
    if (recursive && existing.kind === 'dir') return state;
    throw new VfsError('EEXIST', p);
  }
  if (!recursive) {
    assertParentDir(state, p);
    return withNodes(state, (n) => n.set(p, { kind: 'dir' }));
  }
  return withNodes(state, (n) => {
    const segments = p.split('/').filter((s) => s !== '');
    let current = '';
    for (const seg of segments) {
      current = `${current}/${seg}`;
      const node = n.get(current);
      if (node?.kind === 'file') throw new VfsError('ENOTDIR', current);
      if (!node) n.set(current, { kind: 'dir' });
    }
  });
}

export function writeFile(state: VfsState, path: string, content: string, makeParents = false): VfsState {
  const p = normalize(path);
  const existing = state.nodes.get(p);
  if (existing?.kind === 'dir') throw new VfsError('EISDIR', p);
  let next = state;
  if (makeParents) next = mkdir(next, dirname(p), true);
  else assertParentDir(next, p);
  return withNodes(next, (n) => n.set(p, { kind: 'file', content }));
}

export function appendFile(state: VfsState, path: string, content: string): VfsState {
  const p = normalize(path);
  const node = state.nodes.get(p);
  if (node?.kind === 'dir') throw new VfsError('EISDIR', p);
  const before = node?.content ?? '';
  return writeFile(state, p, before + content);
}

/** touch。存在すれば何もしない（内容は変えない）。 */
export function touch(state: VfsState, path: string): VfsState {
  const p = normalize(path);
  if (state.nodes.has(p)) return state;
  return writeFile(state, p, '');
}

function descendants(state: VfsState, path: string): string[] {
  const prefix = path === ROOT ? ROOT : `${path}/`;
  return [...state.nodes.keys()].filter((k) => k !== path && k.startsWith(prefix));
}

export function remove(state: VfsState, path: string, recursive = false): VfsState {
  const p = normalize(path);
  const node = state.nodes.get(p);
  if (!node) throw new VfsError('ENOENT', p);
  if (node.kind === 'dir') {
    const children = descendants(state, p);
    if (children.length > 0 && !recursive) throw new VfsError('ENOTEMPTY', p);
    return withNodes(state, (n) => {
      for (const key of children) n.delete(key);
      n.delete(p);
    });
  }
  return withNodes(state, (n) => n.delete(p));
}

export function copy(state: VfsState, from: string, to: string, recursive = false): VfsState {
  const src = normalize(from);
  const node = state.nodes.get(src);
  if (!node) throw new VfsError('ENOENT', src);
  // コピー先が既存ディレクトリなら、その中に同名で入れる
  const destNode = state.nodes.get(normalize(to));
  const dest = destNode?.kind === 'dir' ? `${normalize(to)}/${basename(src)}` : normalize(to);

  if (node.kind === 'file') {
    return writeFile(state, dest, node.content);
  }
  if (!recursive) throw new VfsError('EISDIR', src);
  let next = mkdir(state, dest, true);
  for (const key of descendants(state, src)) {
    const child = state.nodes.get(key);
    if (!child) continue;
    const mapped = dest + key.slice(src.length);
    next = child.kind === 'dir' ? mkdir(next, mapped, true) : writeFile(next, mapped, child.content, true);
  }
  return next;
}

export function move(state: VfsState, from: string, to: string): VfsState {
  const src = normalize(from);
  if (!state.nodes.has(src)) throw new VfsError('ENOENT', src);
  const copied = copy(state, src, to, true);
  return remove(copied, src, true);
}

/** cwd 基準で解決してから操作するための小さな補助。 */
export function at(cwd: string, path: string): string {
  return resolve(cwd, path);
}
