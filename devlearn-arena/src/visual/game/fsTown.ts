import type { VfsState } from '@/engines/kernel/vfs';
import type { Box, Point } from '../sceneKit';

/**
 * ファイルシステムを「街」として並べる。
 * ディレクトリは家、ファイルは家の前の木箱。親の家から子の家へ道が伸びる。
 * 深さで列を分け、兄弟は縦に並べ、親は子の並びの真ん中に置く（階層がそのまま地図になる）。
 */

export const HOUSE_W = 140;
export const HOUSE_H = 96;
export const COL_W = 240;
export const FILE_ROW = 26;
export const MAX_FILES = 6;
const MARGIN_X = 50;
const MARGIN_Y = 60;
const GAP_Y = 46;
/** 家の前の通りと、家の下端との間 */
const STREET = 14;

export interface TownFile {
  path: string;
  name: string;
  x: number;
  y: number;
}

export interface TownHouse {
  path: string;
  name: string;
  parent: string | null;
  depth: number;
  box: Box;
  /** 家の前の通りの高さ */
  roadY: number;
  /** 扉の前（主人公が立つ場所） */
  door: Point;
  /** 通りの左端（親から来る道がつながる） */
  entrance: Point;
  /** 通りの右端（子へ行く道が出る） */
  exit: Point;
  files: TownFile[];
  /** 並べきれなかったファイルの数 */
  hidden: number;
}

export interface TownRoad {
  /** 通りなら家のパス、親子をつなぐ道なら子のパス */
  id: string;
  kind: 'street' | 'link';
  points: Point[];
}

export interface Town {
  houses: TownHouse[];
  byPath: Map<string, TownHouse>;
  roads: TownRoad[];
  width: number;
  height: number;
}

export function parentPath(path: string): string | null {
  if (path === '/') return null;
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
}

const nameOf = (path: string): string => (path === '/' ? '/' : path.slice(path.lastIndexOf('/') + 1));

/** 子の家へ向かう道が縦に走る位置。子の列の手前の空き地 */
const laneX = (child: TownHouse): number => child.box.x - 50;

export function layoutTown(vfs: VfsState): Town {
  const childrenOf = new Map<string, string[]>();
  const filesOf = new Map<string, string[]>();
  const dirs: string[] = [];
  for (const [path, node] of vfs.nodes) {
    const parent = parentPath(path);
    if (node.kind === 'dir') {
      dirs.push(path);
      if (parent !== null) childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), path]);
    } else {
      const owner = parent ?? '/';
      filesOf.set(owner, [...(filesOf.get(owner) ?? []), path]);
    }
  }
  for (const list of childrenOf.values()) list.sort((a, b) => (a < b ? -1 : 1));

  const houses: TownHouse[] = [];
  let cursor = MARGIN_Y;

  const blockHeight = (path: string): number => {
    const count = (filesOf.get(path) ?? []).length;
    const rows = Math.min(count, MAX_FILES) + (count > MAX_FILES ? 1 : 0);
    return HOUSE_H + STREET + 22 + (rows > 0 ? rows * FILE_ROW + 6 : 0);
  };

  const place = (path: string, depth: number): TownHouse => {
    const kids = (childrenOf.get(path) ?? []).map((child) => place(child, depth + 1));
    const height = blockHeight(path);
    let top: number;
    if (kids.length === 0) {
      top = cursor;
    } else {
      const first = kids[0]?.box.y ?? cursor;
      const last = kids[kids.length - 1]?.box.y ?? cursor;
      top = (first + last) / 2;
    }
    cursor = Math.max(cursor, top + height + GAP_Y);

    const x = MARGIN_X + depth * COL_W;
    const roadY = top + HOUSE_H + STREET;
    const all = [...(filesOf.get(path) ?? [])].sort((a, b) => (a < b ? -1 : 1));
    const fileTop = roadY + 22;
    const house: TownHouse = {
      path,
      name: nameOf(path),
      parent: parentPath(path),
      depth,
      box: { x, y: top, w: HOUSE_W, h: HOUSE_H },
      roadY,
      door: { x: x + HOUSE_W / 2, y: roadY },
      entrance: { x: x - 20, y: roadY },
      exit: { x: x + HOUSE_W + 20, y: roadY },
      files: all.slice(0, MAX_FILES).map((p, i) => ({ path: p, name: nameOf(p), x: x + 4, y: fileTop + i * FILE_ROW })),
      hidden: Math.max(0, all.length - MAX_FILES),
    };
    houses.push(house);
    return house;
  };

  if (vfs.nodes.has('/')) place('/', 0);
  else for (const dir of dirs.filter((d) => parentPath(d) === null || !vfs.nodes.has(parentPath(d) ?? ''))) place(dir, 0);

  const byPath = new Map(houses.map((h) => [h.path, h]));
  const roads: TownRoad[] = [];
  for (const house of houses) {
    roads.push({ id: house.path, kind: 'street', points: [house.entrance, house.exit] });
    const parent = house.parent === null ? undefined : byPath.get(house.parent);
    if (!parent) continue;
    const lane = laneX(house);
    roads.push({
      id: house.path,
      kind: 'link',
      points: [parent.exit, { x: lane, y: parent.roadY }, { x: lane, y: house.roadY }, house.entrance],
    });
  }

  const width = Math.max(...houses.map((h) => h.box.x + HOUSE_W), 300) + MARGIN_X;
  const height = Math.max(cursor, 240);
  return { houses, byPath, roads, width, height };
}

/** 点の並びを SVG の折れ線にする */
export function polyline(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${String(p.x)} ${String(p.y)}`).join(' ');
}

/** 家が無くなっていたら、残っているいちばん近い祖先の家を返す */
export function nearestHouse(town: Town, path: string): TownHouse | undefined {
  let here: string | null = path;
  while (here !== null) {
    const house = town.byPath.get(here);
    if (house) return house;
    here = parentPath(here);
  }
  return town.houses.find((h) => h.parent === null);
}

/** 根から自分までの家のパス */
function ancestry(town: Town, path: string): string[] {
  const out: string[] = [];
  let here: TownHouse | undefined = town.byPath.get(path);
  while (here) {
    out.unshift(here.path);
    here = here.parent === null ? undefined : town.byPath.get(here.parent);
  }
  return out;
}

/** 根からいまいる家までに通る家（道を金色にする） */
export function pathToHere(town: Town, cwd: string): Set<string> {
  const here = nearestHouse(town, cwd);
  return new Set(here ? ancestry(town, here.path) : []);
}

/**
 * from の家から to の家まで、道の上を歩く点の並び。
 * いったん共通の祖先まで上り、そこから目的の家へ下りる。cd .. も cd /a/b も同じ道を通る。
 */
export function walkRoute(town: Town, from: string, to: string): Point[] {
  const start = nearestHouse(town, from);
  const goal = nearestHouse(town, to);
  if (!goal) return [];
  if (!start) return [goal.door];
  const up = ancestry(town, start.path);
  const down = ancestry(town, goal.path);
  let common = 0;
  while (common < up.length && common < down.length && up[common] === down[common]) common += 1;

  const points: Point[] = [start.door];
  // 上り：子の家から親の家へ
  for (let i = up.length - 1; i >= common; i -= 1) {
    const child = town.byPath.get(up[i] ?? '');
    const parent = child?.parent == null ? undefined : town.byPath.get(child.parent);
    if (!child || !parent) continue;
    const lane = laneX(child);
    points.push(child.entrance, { x: lane, y: child.roadY }, { x: lane, y: parent.roadY }, parent.exit, parent.door);
  }
  // 下り：親の家から子の家へ
  for (let i = Math.max(common, 1); i < down.length; i += 1) {
    const child = town.byPath.get(down[i] ?? '');
    const parent = child?.parent == null ? undefined : town.byPath.get(child.parent);
    if (!child || !parent) continue;
    const lane = laneX(child);
    points.push(parent.exit, { x: lane, y: parent.roadY }, { x: lane, y: child.roadY }, child.entrance, child.door);
  }
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1]?.x || p.y !== points[i - 1]?.y);
}
