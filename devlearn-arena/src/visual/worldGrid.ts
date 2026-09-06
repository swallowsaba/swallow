import type { VfsState } from '@/engines/kernel/vfs';

/** 1マスの大きさ(px) */
export const TILE = 36;
/** 部屋の内側の幅（マス） */
const ROOM_INNER_W = 7;
/** 通路の長さ（マス） */
const HALL = 4;
/** 部屋どうしの縦の間隔（マス） */
const ROOM_GAP_Y = 2;

export interface Cell {
  x: number;
  y: number;
}

export interface ItemTile extends Cell {
  path: string;
  name: string;
}

export interface Room {
  path: string;
  name: string;
  parent: string | null;
  /** 左上の内側マス */
  x: number;
  y: number;
  w: number;
  h: number;
  items: ItemTile[];
  hiddenCount: number;
}

export interface WorldGrid {
  rooms: Room[];
  byPath: Map<string, Room>;
  /** 子の path をキーに、親の扉から子の扉までの通路（マス列） */
  halls: Map<string, Cell[]>;
  width: number;
  height: number;
}

const MAX_ITEMS = 12;

function parentOf(path: string): string | null {
  if (path === '/') return null;
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
}

function nameOf(path: string): string {
  return path === '/' ? 'root' : path.slice(path.lastIndexOf('/') + 1);
}

export function roomCenter(room: Room): Cell {
  return { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
}

/** 親へ出る扉（部屋の左端の外側） */
export function leftDoor(room: Room): Cell {
  return { x: room.x - 1, y: room.y + Math.floor(room.h / 2) };
}

/** 子へ出る扉（部屋の右端の外側） */
export function rightDoor(room: Room): Cell {
  return { x: room.x + room.w, y: room.y + Math.floor(room.h / 2) };
}

/**
 * ディレクトリ構造からタイルの世界を組み立てる。
 * 深さが横方向、兄弟が縦方向。部屋は扉と通路でつながる。
 */
export function buildWorld(vfs: VfsState): WorldGrid {
  const childrenOf = new Map<string, string[]>();
  const filesOf = new Map<string, string[]>();

  for (const [path, node] of vfs.nodes) {
    if (node.kind === 'dir') {
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

  const rooms: Room[] = [];
  let nextY = 1;

  const roomHeight = (path: string): number => {
    const count = Math.min((filesOf.get(path) ?? []).length, MAX_ITEMS);
    return Math.max(4, 2 + Math.ceil(count / 3) + 1);
  };

  const place = (path: string, depth: number): Room => {
    const h = roomHeight(path);
    const w = ROOM_INNER_W;
    const x = 1 + depth * (ROOM_INNER_W + HALL + 2);
    const children = childrenOf.get(path) ?? [];

    const placedChildren = children.map((child) => place(child, depth + 1));

    let y: number;
    if (placedChildren.length === 0) {
      y = nextY;
      nextY += h + ROOM_GAP_Y;
    } else {
      const first = placedChildren[0];
      const last = placedChildren[placedChildren.length - 1];
      const top = first?.y ?? nextY;
      const bottom = (last?.y ?? nextY) + (last?.h ?? h);
      y = Math.max(1, Math.round((top + bottom) / 2 - h / 2));
      nextY = Math.max(nextY, y + h + ROOM_GAP_Y);
    }

    const files = (filesOf.get(path) ?? []).sort((a, b) => (a < b ? -1 : 1));
    const shown = files.slice(0, MAX_ITEMS);
    const room: Room = {
      path,
      name: nameOf(path),
      parent: parentOf(path),
      x,
      y,
      w,
      h,
      hiddenCount: files.length - shown.length,
      items: shown.map((filePath, i) => ({
        path: filePath,
        name: nameOf(filePath),
        x: x + 1 + (i % 3) * 2,
        y: y + 1 + Math.floor(i / 3),
      })),
    };
    rooms.push(room);
    return room;
  };

  if (vfs.nodes.has('/')) place('/', 0);

  const byPath = new Map(rooms.map((r) => [r.path, r]));
  const halls = new Map<string, Cell[]>();

  for (const room of rooms) {
    const parent = room.parent === null ? undefined : byPath.get(room.parent);
    if (!parent) continue;
    const from = rightDoor(parent);
    const to = leftDoor(room);
    const cells: Cell[] = [];
    const midX = from.x + Math.max(1, Math.floor((to.x - from.x) / 2));
    for (let x = from.x; x <= midX; x += 1) cells.push({ x, y: from.y });
    const step = to.y >= from.y ? 1 : -1;
    for (let y = from.y + step; y !== to.y + step; y += step) cells.push({ x: midX, y });
    for (let x = midX + 1; x <= to.x; x += 1) cells.push({ x, y: to.y });
    halls.set(room.path, cells);
  }

  const width = Math.max(...rooms.map((r) => r.x + r.w), 8) + 2;
  const height = Math.max(...rooms.map((r) => r.y + r.h), 8) + 2;
  return { rooms, byPath, halls, width, height };
}

/** 木構造をたどって from から to までの部屋の並びを返す */
export function roomRoute(world: WorldGrid, from: string, to: string): string[] {
  const chain = (path: string): string[] => {
    const out: string[] = [];
    let current: string | null = path;
    while (current !== null) {
      out.push(current);
      current = world.byPath.get(current)?.parent ?? null;
    }
    return out;
  };
  const up = chain(from);
  const down = chain(to);
  const downSet = new Set(down);
  const meet = up.find((p) => downSet.has(p));
  if (meet === undefined) return [to];
  const head = up.slice(0, up.indexOf(meet) + 1);
  const tail = down.slice(0, down.indexOf(meet)).reverse();
  return [...head, ...tail];
}

/** 実際に歩くマスの列。部屋の中心 → 扉 → 通路 → 次の部屋の中心 */
export function walkPath(world: WorldGrid, from: string, to: string): Cell[] {
  const rooms = roomRoute(world, from, to);
  const cells: Cell[] = [];
  const first = world.byPath.get(rooms[0] ?? '');
  if (!first) return cells;
  cells.push(roomCenter(first));

  for (let i = 0; i < rooms.length - 1; i += 1) {
    const a = world.byPath.get(rooms[i] ?? '');
    const b = world.byPath.get(rooms[i + 1] ?? '');
    if (!a || !b) continue;
    const goingDown = b.parent === a.path;
    const hall = world.halls.get(goingDown ? b.path : a.path) ?? [];
    const doorA = goingDown ? rightDoor(a) : leftDoor(a);
    cells.push({ x: a.x + (goingDown ? a.w - 1 : 0), y: doorA.y });
    cells.push(doorA);
    cells.push(...(goingDown ? hall : [...hall].reverse()));
    cells.push(roomCenter(b));
  }
  return cells;
}
