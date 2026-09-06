import type { VfsState } from '@/engines/kernel/vfs';

/** 正面から見た階層図の配置。斜めにはしない（構造を読むのに角度は邪魔） */
export const COL_W = 230;
export const NODE_H = 44;
export const CHIP_H = 26;
export const GAP_Y = 14;

export interface FileChip {
  path: string;
  name: string;
}

export interface DirNode {
  path: string;
  name: string;
  depth: number;
  x: number;
  y: number;
  height: number;
  files: FileChip[];
  hiddenCount: number;
  parent: string | null;
}

export interface TreeLayout {
  nodes: DirNode[];
  byPath: Map<string, DirNode>;
  width: number;
  height: number;
}

const MAX_FILES = 8;

function parentOf(path: string): string | null {
  if (path === '/') return null;
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
}

function nameOf(path: string): string {
  return path === '/' ? '/' : path.slice(path.lastIndexOf('/') + 1);
}

/**
 * ディレクトリを深さで列に、兄弟を縦に並べる。
 * 親は子の並びの真ん中に置く（樹形図として読めるようにするため）。
 */
export function layoutTree(vfs: VfsState): TreeLayout {
  const childrenOf = new Map<string, string[]>();
  const filesOf = new Map<string, string[]>();
  const dirs: string[] = [];

  for (const [path, node] of vfs.nodes) {
    if (node.kind === 'dir') {
      dirs.push(path);
      const parent = parentOf(path);
      if (parent !== null) {
        const list = childrenOf.get(parent) ?? [];
        list.push(path);
        childrenOf.set(parent, list);
      }
      continue;
    }
    const parent = parentOf(path) ?? '/';
    const list = filesOf.get(parent) ?? [];
    list.push(path);
    filesOf.set(parent, list);
  }

  for (const list of childrenOf.values()) list.sort((a, b) => (a < b ? -1 : 1));

  const nodes: DirNode[] = [];
  let cursorY = 0;

  const heightOf = (path: string): number => {
    const count = Math.min((filesOf.get(path) ?? []).length, MAX_FILES);
    return NODE_H + (count > 0 ? count * CHIP_H + 10 : 0);
  };

  const walk = (path: string, depth: number): DirNode => {
    const children = childrenOf.get(path) ?? [];
    const height = heightOf(path);
    const placedChildren = children.map((child) => walk(child, depth + 1));

    let y: number;
    if (placedChildren.length === 0) {
      y = cursorY;
      cursorY += height + GAP_Y;
    } else {
      const first = placedChildren[0];
      const last = placedChildren[placedChildren.length - 1];
      const top = first?.y ?? cursorY;
      const bottom = (last?.y ?? cursorY) + (last?.height ?? height);
      y = (top + bottom) / 2 - height / 2;
    }

    const files = (filesOf.get(path) ?? []).sort((a, b) => (a < b ? -1 : 1));
    const node: DirNode = {
      path,
      name: nameOf(path),
      depth,
      x: depth * COL_W,
      y,
      height,
      parent: parentOf(path),
      files: files.slice(0, MAX_FILES).map((p) => ({ path: p, name: nameOf(p) })),
      hiddenCount: Math.max(0, files.length - MAX_FILES),
    };
    nodes.push(node);
    return node;
  };

  if (vfs.nodes.has('/')) walk('/', 0);
  else for (const dir of dirs) walk(dir, 0);

  const width = Math.max(...nodes.map((n) => n.x), 0) + COL_W;
  const height = Math.max(...nodes.map((n) => n.y + n.height), 0) + GAP_Y;
  return { nodes, byPath: new Map(nodes.map((n) => [n.path, n])), width, height };
}

export interface WorldDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

export function diffVfs(previous: VfsState | undefined, current: VfsState): WorldDiff {
  if (!previous) return { added: [], removed: [], changed: [] };
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  for (const [path, node] of current.nodes) {
    const before = previous.nodes.get(path);
    if (!before) {
      added.push(path);
      continue;
    }
    if (before.kind === 'file' && node.kind === 'file' && before.content !== node.content) {
      changed.push(path);
    }
  }
  for (const path of previous.nodes.keys()) {
    if (!current.nodes.has(path)) removed.push(path);
  }
  return { added, removed, changed };
}
