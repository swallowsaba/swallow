import type { VfsState } from '@/engines/kernel/vfs';

/** アイソメトリック投影の寸法 */
export const TILE_W = 116;
export const TILE_H = 58;
/** 区画どうしの間隔。1.0 だと敷地が密着して1枚の板に見えるので広げる */
export const SPACING = 1.9;
export const TILE_D = 16;
export const CRATE = 22;

export interface Point {
  x: number;
  y: number;
}

/** 格子座標 → 画面座標。col が右下、row が左下に伸びる */
export function iso(col: number, row: number): Point {
  return { x: (col - row) * (TILE_W / 2) * SPACING, y: (col + row) * (TILE_H / 2) * SPACING };
}

/** タイル内の小物用。間隔を掛けない座標変換 */
export function isoLocal(col: number, row: number): Point {
  return { x: (col - row) * (TILE_W / 2), y: (col + row) * (TILE_H / 2) };
}

export interface CrateItem {
  path: string;
  name: string;
  /** タイル中心からの相対位置 */
  offset: Point;
}

export interface Plot {
  path: string;
  name: string;
  depth: number;
  col: number;
  row: number;
  center: Point;
  crates: CrateItem[];
  hiddenCount: number;
  parent: string | null;
}

export interface World {
  plots: Plot[];
  byPath: Map<string, Plot>;
  view: { x: number; y: number; width: number; height: number };
}

const MAX_CRATES = 6;

function parentOf(path: string): string | null {
  if (path === '/') return null;
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
}

function nameOf(path: string): string {
  if (path === '/') return '/';
  return path.slice(path.lastIndexOf('/') + 1);
}

/** 仮想FSの状態から、街の配置を決める。純関数なので同じ状態なら必ず同じ配置。 */
export function buildWorld(vfs: VfsState): World {
  const dirs: string[] = [];
  const filesByDir = new Map<string, string[]>();

  for (const [path, node] of vfs.nodes) {
    if (node.kind === 'dir') {
      dirs.push(path);
      continue;
    }
    const parent = parentOf(path) ?? '/';
    const list = filesByDir.get(parent) ?? [];
    list.push(path);
    filesByDir.set(parent, list);
  }

  dirs.sort((a, b) => {
    const da = a === '/' ? 0 : a.split('/').length - 1;
    const db = b === '/' ? 0 : b.split('/').length - 1;
    if (da !== db) return da - db;
    return a < b ? -1 : 1;
  });

  const perDepth = new Map<number, number>();
  const plots: Plot[] = [];

  for (const path of dirs) {
    const depth = path === '/' ? 0 : path.split('/').length - 1;
    const index = perDepth.get(depth) ?? 0;
    perDepth.set(depth, index + 1);

    // 深さで奥へ、同じ深さの兄弟は横へ広げる
    const col = index;
    const row = depth;
    const center = iso(col, row);

    const files = (filesByDir.get(path) ?? []).sort((a, b) => (a < b ? -1 : 1));
    const shown = files.slice(0, MAX_CRATES);

    plots.push({
      path,
      name: nameOf(path),
      depth,
      col,
      row,
      center,
      parent: parentOf(path),
      hiddenCount: files.length - shown.length,
      crates: shown.map((filePath, i) => {
        const sub = isoLocal((i % 3) * 0.3 - 0.3, Math.floor(i / 3) * 0.3 - 0.15);
        return { path: filePath, name: nameOf(filePath), offset: sub };
      }),
    });
  }

  const xs = plots.map((p) => p.center.x);
  const ys = plots.map((p) => p.center.y);
  const minX = Math.min(...xs, 0) - TILE_W;
  const maxX = Math.max(...xs, 0) + TILE_W;
  const minY = Math.min(...ys, 0) - TILE_H * 3;
  const maxY = Math.max(...ys, 0) + TILE_H * 3;

  // 建物が少ないうちに拡大されすぎると看板だけ巨大になるので、
  // 最低限の広さを確保して中央に寄せる
  const MIN_W = 1500;
  const MIN_H = 900;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const width = Math.max(maxX - minX, MIN_W);
  const height = Math.max(maxY - minY, MIN_H);

  return {
    plots,
    byPath: new Map(plots.map((p) => [p.path, p])),
    view: { x: cx - width / 2, y: cy - height / 2, width, height },
  };
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

/** 運搬車をどこへ走らせるか。直近の変化があった場所を返す。 */
export function focusOf(diff: WorldDiff): string | null {
  return diff.added[0] ?? diff.changed[0] ?? diff.removed[0] ?? null;
}
