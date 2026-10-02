import { accent, city, domain, mix, rgbaOf, shade, state, hud } from '@/ui/tokens';
import type { FacilityType } from '../types';
import { noiseOf } from './facilityKit';
import type { Model, Part, Poly, Shape } from './mesh';
import { box, onFace, pad, part, prism, rod, type Side } from './shapes';

/**
 * 施設の中の景色（レッスン画面の背景。docs/ui-design.md 7 章・docs/visual-design.md 6.1）。
 * 都市と同じ描き方（等角投影・面の 3 色・面に沿った窓・細部 3 つ以上）で、施設の部屋を 1 つ描く。
 *
 * 部屋は W×D マス。奥の 2 面の壁（x = 0 と y = 0）に窓があり、外に都市が見える。
 * 手前の 2 面には壁を置かない（中を覗き込む見え方）。
 */

export const ROOM_W = 4;
export const ROOM_D = 3;
const H = 1.35;
const T = 0.08;
const NAVY = rgbaOf(hud.bg, 1);

type Wall = 'back' | 'left';
/** 奥の壁の、部屋の側の面 */
const BACK = { x0: 0, y0: -T, x1: ROOM_W, y1: 0 };
const LEFT = { x0: -T, y0: 0, x1: 0, y1: ROOM_D };
const faceOf = (w: Wall): { b: typeof BACK; side: Side } => (w === 'back' ? { b: BACK, side: '+y' } : { b: LEFT, side: '+x' });
/** 壁に沿った位置 u（左の壁は奥から手前、奥の壁は左から右へ数える） */
const uOf = (w: Wall, u: number): number => (w === 'back' ? ROOM_W - u : u);

/** 壁の面に貼る矩形 */
function onWall(w: Wall, u0: number, u1: number, v0: number, v1: number, color: string, layer: number, lit = false, out = 0.006): Poly {
  const { b, side } = faceOf(w);
  const a = uOf(w, u0);
  const c = uOf(w, u1);
  return { kind: 'poly', pts: onFace(b, side, Math.min(a, c), Math.max(a, c), v0, v1, out), color, layer, lit };
}

/* ---------- 部屋 ---------- */

interface RoomSpec {
  wall: string;
  floorA: string;
  floorB: string;
  /** 差し色（分野の色） */
  accent: string;
}

function room(spec: RoomSpec, extras: readonly WallItem[]): { parts: Part[]; ground: Poly[] } {
  const ground: Poly[] = [];
  // 床の板（2 色の市松）
  for (let x = 0; x < ROOM_W; x += 0.5) {
    for (let y = 0; y < ROOM_D; y += 0.5) ground.push(pad(x, y, x + 0.5, y + 0.5, (x + y) % 1 === 0 ? spec.floorA : spec.floorB));
  }
  // 手前の床の縁（部屋の切り口）
  ground.push(pad(0, ROOM_D - 0.04, ROOM_W, ROOM_D, shade(spec.floorA, 0.7)), pad(ROOM_W - 0.04, 0, ROOM_W, ROOM_D, shade(spec.floorA, 0.7)));
  const wallShapes = (w: Wall): Shape[] => {
    const len = w === 'back' ? ROOM_W : ROOM_D;
    // 幅木と、差し色の帯
    return [
      onWall(w, 0, len, 0, 0.06, shade(spec.wall, 0.6), 1),
      onWall(w, 0, len, H - 0.12, H - 0.08, spec.accent, 1),
      ...extras.filter((x) => x.wall === w).flatMap((x) => x.shapes),
    ];
  };
  const parts: Part[] = [
    box({ ...BACK, z0: 0, z1: H, wall: spec.wall }, wallShapes('back')),
    box({ ...LEFT, z0: 0, z1: H, wall: spec.wall }, wallShapes('left')),
    // 角の柱
    box({ x0: -T, y0: -T, x1: 0.04, y1: 0.04, z0: 0, z1: H, wall: shade(spec.wall, 0.85) }),
  ];
  return { parts, ground };
}

/** 壁に貼る物。壁の部品の一部として描く（壁と描く順を争わないため） */
interface WallItem {
  wall: Wall;
  shapes: Shape[];
}

const onWallItem = (wall: Wall, shapes: Shape[]): WallItem => ({ wall, shapes });

/** 窓（枠・桟と、外に見える都市の影） */
function cityWindow(w: Wall, u0: number, u1: number, v0: number, v1: number, seed: number): WallItem {
  const noise = noiseOf(seed);
  const sky = mix(city.wallGlass, state.info, 0.25);
  const shapes: Shape[] = [
    onWall(w, u0 - 0.04, u1 + 0.04, v0 - 0.04, v1 + 0.04, shade(city.curb, 0.7), 1),
    onWall(w, u0, u1, v0, v1, sky, 2, true),
  ];
  // 外の街並み（高さの違う棟と、灯りのともる窓）
  const n = Math.max(3, Math.round((u1 - u0) / 0.14));
  for (let i = 0; i < n; i += 1) {
    const a = u0 + ((u1 - u0) * i) / n;
    const b = a + ((u1 - u0) / n) * 0.86;
    const top = v0 + (v1 - v0) * (0.25 + noise(i, 1, 2) * 0.45);
    shapes.push(onWall(w, a, b, v0, top, mix(city.wallGlass, NAVY, 0.55), 3, true, 0.008));
    if (noise(i, 3, 4) < 0.6) shapes.push(onWall(w, a + 0.03, a + 0.06, top - 0.09, top - 0.05, city.windowLit, 4, true, 0.01));
  }
  // 縦の桟
  for (let i = 1; i < 3; i += 1) {
    const u = u0 + ((u1 - u0) * i) / 3;
    shapes.push(onWall(w, u - 0.012, u + 0.012, v0, v1, shade(city.curb, 0.8), 5, false, 0.012));
  }
  return onWallItem(w, shapes);
}

/** 壁の画面（板書・大型画面・地図）。lines は光る線の数 */
function wallScreen(w: Wall, u0: number, u1: number, v0: number, v1: number, bg: string, line: string, kind: 'lines' | 'graph' | 'map' | 'board'): WallItem {
  const shapes: Shape[] = [
    onWall(w, u0 - 0.03, u1 + 0.03, v0 - 0.03, v1 + 0.03, shade(city.curb, 0.45), 1),
    onWall(w, u0, u1, v0, v1, bg, 2, true),
  ];
  const du = u1 - u0;
  const dv = v1 - v0;
  if (kind === 'lines' || kind === 'board') {
    for (let i = 0; i < 4; i += 1) {
      const v = v1 - dv * (0.2 + i * 0.2);
      shapes.push(onWall(w, u0 + du * 0.08, u0 + du * (0.4 + ((i * 37) % 50) / 100), v - 0.012, v + 0.012, line, 3, true, 0.009));
    }
  }
  if (kind === 'graph') {
    const bars = 7;
    for (let i = 0; i < bars; i += 1) {
      const a = u0 + du * (0.08 + (i * 0.84) / bars);
      const h = dv * (0.2 + ((i * 53) % 60) / 100);
      shapes.push(onWall(w, a, a + (du * 0.84) / bars - 0.02, v0 + dv * 0.1, v0 + dv * 0.1 + h, i === 5 ? state.warn : line, 3, true, 0.009));
    }
  }
  if (kind === 'map') {
    const pts: [number, number][] = [[0.15, 0.3], [0.35, 0.7], [0.55, 0.45], [0.75, 0.75], [0.85, 0.35]];
    for (const [pu, pv] of pts) {
      const u = u0 + du * pu;
      const v = v0 + dv * pv;
      shapes.push(onWall(w, u - 0.025, u + 0.025, v - 0.025, v + 0.025, line, 4, true, 0.01));
    }
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [au, av] = pts[i] as [number, number];
      const [bu] = pts[i + 1] as [number, number];
      shapes.push(onWall(w, u0 + du * au, u0 + du * bu, v0 + dv * av - 0.006, v0 + dv * av + 0.006, mix(line, bg, 0.4), 3, true, 0.009));
    }
  }
  return onWallItem(w, shapes);
}

/* ---------- 家具と設備 ---------- */

/** 机（天板・脚）と、載せた画面（光る面）。facing は画面の向き（+x か +y） */
function desk(x: number, y: number, along: 'x' | 'y', top: string, monitor = true): Part[] {
  const l = 0.5;
  const d = 0.26;
  const b = along === 'x' ? { x0: x, y0: y, x1: x + l, y1: y + d } : { x0: x, y0: y, x1: x + d, y1: y + l };
  const z = 0.28;
  const out: Part[] = [box({ ...b, z0: z - 0.03, z1: z, wall: shade(top, 0.8), top })];
  for (const [px, py] of [[b.x0 + 0.03, b.y0 + 0.03], [b.x1 - 0.03, b.y0 + 0.03], [b.x0 + 0.03, b.y1 - 0.03], [b.x1 - 0.03, b.y1 - 0.03]] as [number, number][]) {
    out.push(rod([px, py, 0], [px, py, z - 0.03], 0.02, city.curb));
  }
  if (monitor) {
    const m = along === 'x'
      ? { x0: x + 0.12, y0: y + 0.04, x1: x + 0.38, y1: y + 0.07 }
      : { x0: x + 0.04, y0: y + 0.12, x1: x + 0.07, y1: y + 0.38 };
    const side: Side = along === 'x' ? '+y' : '+x';
    out.push(box({ ...m, z0: z + 0.02, z1: z + 0.2, wall: NAVY }, [
      { kind: 'poly', pts: onFace(m, side, 0.015, (along === 'x' ? 0.26 : 0.26) - 0.015, z + 0.035, z + 0.185), color: mix(state.info, NAVY, 0.35), lit: true, layer: 1 },
      { kind: 'poly', pts: onFace(m, side, 0.04, 0.16, z + 0.14, z + 0.155, 0.01), color: city.lineWhite, lit: true, layer: 2 },
      { kind: 'poly', pts: onFace(m, side, 0.04, 0.12, z + 0.1, z + 0.115, 0.01), color: mix(city.lineWhite, state.info, 0.5), lit: true, layer: 2 },
    ]));
    out.push(rod([(m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2, z], [(m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2, z + 0.02], 0.03, city.curb));
  }
  return out;
}

/** 椅子（座面と背もたれ） */
function chair(x: number, y: number, color: string): Part[] {
  return [
    box({ x0: x, y0: y, x1: x + 0.14, y1: y + 0.14, z0: 0.15, z1: 0.18, wall: shade(color, 0.85), top: color }),
    box({ x0: x + 0.12, y0: y, x1: x + 0.14, y1: y + 0.14, z0: 0.18, z1: 0.36, wall: color }),
    rod([x + 0.07, y + 0.07, 0], [x + 0.07, y + 0.07, 0.15], 0.025, city.curb),
  ];
}

/** 装置の棚（サーバ・ネットワーク機器）。前面（+y）に灯りの点 */
function rack(x: number, y: number, h: number, color: string, seed: number, lamp: string = state.ok): Part {
  const b = { x0: x, y0: y, x1: x + 0.3, y1: y + 0.32 };
  const noise = noiseOf(seed);
  const shapes: Shape[] = [];
  const units = Math.floor((h - 0.1) / 0.07);
  for (let i = 0; i < units; i += 1) {
    const v0 = 0.06 + i * 0.07;
    shapes.push({ kind: 'poly', pts: onFace(b, '+y', 0.025, 0.275, v0, v0 + 0.05), color: shade(color, 0.7), layer: 1 });
    if (noise(i, x * 10, y * 10) < 0.7) shapes.push({ kind: 'poly', pts: onFace(b, '+y', 0.2, 0.235, v0 + 0.015, v0 + 0.035, 0.01), color: noise(i, 2, x) < 0.15 ? state.warn : lamp, lit: true, layer: 2 });
    if (noise(i, 5, y) < 0.5) shapes.push({ kind: 'poly', pts: onFace(b, '+y', 0.05, 0.16, v0 + 0.02, v0 + 0.03, 0.01), color: mix(color, city.lineWhite, 0.4), layer: 2 });
  }
  // 側面の通気の筋
  for (let i = 0; i < 3; i += 1) shapes.push({ kind: 'poly', pts: onFace(b, '+x', 0.06 + i * 0.08, 0.1 + i * 0.08, h * 0.3, h * 0.8), color: shade(color, 0.75), layer: 1 });
  return box({ ...b, z0: 0, z1: h, wall: color, top: mix(color, city.lineWhite, 0.15) }, shapes);
}

/** 本棚（段と、色の違う本の背） */
function shelf(x: number, y: number, along: 'x' | 'y', h: number, seed: number): Part {
  const l = 0.7;
  const b = along === 'x' ? { x0: x, y0: y, x1: x + l, y1: y + 0.16 } : { x0: x, y0: y, x1: x + 0.16, y1: y + l };
  const side: Side = along === 'x' ? '+y' : '+x';
  const noise = noiseOf(seed);
  const colors = [domain.web, domain.git, domain.linux, domain.net, city.roofTile, accent.gold];
  const shapes: Shape[] = [];
  const rows = Math.floor(h / 0.2);
  for (let r = 0; r < rows; r += 1) {
    const v0 = 0.04 + r * 0.2;
    let u = 0.03;
    while (u < l - 0.06) {
      const wv = 0.025 + noise(r, u * 10, 1) * 0.025;
      shapes.push({ kind: 'poly', pts: onFace(b, side, u, u + wv, v0, v0 + 0.11 + noise(r, u * 10, 2) * 0.05), color: colors[Math.floor(noise(r, u * 10, 3) * colors.length)] ?? city.roofTile, layer: 1 });
      u += wv + 0.006;
    }
    shapes.push({ kind: 'poly', pts: onFace(b, side, 0, l, v0 - 0.02, v0, 0.012), color: shade(city.roofTile, 0.6), layer: 2 });
  }
  return box({ ...b, z0: 0, z1: h, wall: mix(city.roofTile, city.sand, 0.3) }, shapes);
}

/** 鉢植え */
function plant(x: number, y: number, s = 1): Part[] {
  return [
    prism(x, y, 0.06 * s, 0, 0.1 * s, mix(city.roofTile, city.sand, 0.4), shade(city.roofTile, 0.6), 8),
    part([
      { kind: 'blob', center: [x, y, 0.2 * s], r: 0.09 * s, squash: 1.1, color: city.tree2 },
      { kind: 'blob', center: [x + 0.03, y + 0.02, 0.27 * s], r: 0.065 * s, squash: 1, color: city.tree3, layer: 1 },
    ], [x - 0.09, y - 0.09, 0.1 * s], [x + 0.09, y + 0.09, 0.33 * s]),
  ];
}

/** 積んだ箱・コンテナ（波板の筋） */
function crate(x: number, y: number, z: number, l: number, w: number, h: number, color: string): Part {
  const b = { x0: x, y0: y, x1: x + l, y1: y + w };
  const shapes: Shape[] = [];
  for (let i = 1; i < 5; i += 1) {
    const u = (l * i) / 5;
    shapes.push({ kind: 'poly', pts: onFace(b, '+y', u - 0.008, u + 0.008, z + 0.01, z + h - 0.01), color: shade(color, 0.82), layer: 1 });
  }
  shapes.push({ kind: 'poly', pts: onFace(b, '+x', 0.02, w - 0.02, z + 0.02, z + h - 0.02), color: shade(color, 0.88), layer: 1 });
  return box({ ...b, z0: z, z1: z + h, wall: color, top: mix(color, city.lineWhite, 0.15) }, shapes);
}

/** 操作卓（傾いた天板に光る計器） */
function console(x: number, y: number, l: number, color: string, lamp: string): Part[] {
  const b = { x0: x, y0: y, x1: x + l, y1: y + 0.22 };
  const shapes: Shape[] = [];
  for (let i = 0; i < Math.floor(l / 0.12); i += 1) {
    shapes.push({ kind: 'poly', pts: [[x + 0.04 + i * 0.12, y + 0.04, 0.32], [x + 0.12 + i * 0.12, y + 0.04, 0.32], [x + 0.12 + i * 0.12, y + 0.18, 0.3], [x + 0.04 + i * 0.12, y + 0.18, 0.3]], color: i % 3 === 1 ? state.warn : lamp, lit: true, layer: 1 });
  }
  return [box({ ...b, z0: 0, z1: 0.3, wall: color, top: shade(color, 1.1) }, shapes)];
}

/** 天井から下がる照明（光る円盤） */
function lamp(x: number, y: number): Part {
  return part([
    { kind: 'blob', center: [x, y, H - 0.1], r: 0.12, squash: 0.35, color: city.windowLit, lit: true },
    { kind: 'blob', center: [x, y, 0.005], r: 0.4, squash: 0.5, color: city.windowLit, lit: true, alpha: 0.12 },
  ], [x - 0.12, y - 0.12, H - 0.15], [x + 0.12, y + 0.12, H - 0.05]);
}

/* ---------- 施設ごとの部屋 ---------- */

const ROOM = (accentColor: string, wall = mix(city.wallStone, NAVY, 0.35)): RoomSpec => ({
  wall,
  floorA: mix(city.paving, NAVY, 0.25),
  floorB: mix(city.paving, NAVY, 0.35),
  accent: accentColor,
});

function compose(accentColor: string, build: (items: (Part | WallItem)[], ground: Poly[]) => void, spec: RoomSpec = ROOM(accentColor)): Model {
  const items: (Part | WallItem)[] = [];
  const extra: Poly[] = [];
  build(items, extra);
  const walls = items.filter((x): x is WallItem => 'wall' in x);
  const r = room(spec, walls);
  const parts = [...r.parts, ...items.filter((x): x is Part => !('wall' in x))];
  return { w: ROOM_W, d: ROOM_D, parts, ground: [...r.ground, ...extra], shadowHeight: 0 };
}

const wood = mix(city.roofTile, city.sand, 0.5);

const BUILDERS: Partial<Record<FacilityType, () => Model>> = {
  // 市立 IT 学院: 教室（黒板・机の列・本棚・窓）
  academy: () => compose(domain.found, (p) => {
    p.push(cityWindow('left', 0.4, 2.4, 0.5, 1.1, 11));
    p.push(wallScreen('back', 0.5, 2.6, 0.45, 1.05, mix(domain.linux, NAVY, 0.55), city.lineWhite, 'board'));
    p.push(shelf(2.95, 0.02, 'x', 0.9, 12));
    for (const y of [0.9, 1.7]) for (const x of [0.6, 1.5, 2.4]) { p.push(...desk(x, y, 'x', wood, false)); p.push(...chair(x + 0.18, y + 0.36, domain.found)); }
    p.push(box({ x0: 1.1, y0: 0.18, x1: 1.9, y1: 0.42, z0: 0, z1: 0.32, wall: wood, top: shade(wood, 1.1) }));
    p.push(...plant(3.7, 2.6), lamp(1.5, 1.4), lamp(2.8, 1.4));
  }),
  // サーバ施設: 機械室（棚の列・配線の棚・空調）
  server: () => compose(domain.linux, (p, g) => {
    p.push(cityWindow('left', 0.5, 1.4, 0.65, 1.1, 21));
    p.push(wallScreen('back', 0.3, 1.2, 0.6, 1.0, NAVY, state.ok, 'lines'));
    for (const row of [0.9, 1.9]) for (let i = 0; i < 6; i += 1) p.push(rack(0.7 + i * 0.32, row, 1.0, mix(NAVY, city.curb, 0.35), 21 + i + row * 7));
    p.push(box({ x0: 0.7, y0: 0.9, x1: 2.6, y1: 1.22, z0: 1.12, z1: 1.16, wall: domain.linux }));
    p.push(box({ x0: 3.1, y0: 0.15, x1: 3.8, y1: 0.55, z0: 0, z1: 0.9, wall: mix(city.wallStone, city.lineWhite, 0.3) }, [
      { kind: 'poly', pts: onFace({ x0: 3.1, y0: 0.15, x1: 3.8, y1: 0.55 }, '+y', 0.1, 0.6, 0.4, 0.8), color: shade(city.curb, 0.9), layer: 1 },
    ]));
    for (let x = 0.6; x < 2.8; x += 0.5) g.push(pad(x, 1.35, x + 0.4, 1.45, mix(domain.linux, NAVY, 0.4)));
    p.push(...console(2.9, 2.3, 0.8, mix(NAVY, city.curb, 0.4), state.ok));
  }),
  // ネットワークセンター: 局舎（配線盤・網の地図・作業台）
  network: () => compose(domain.net, (p) => {
    p.push(cityWindow('left', 0.4, 1.6, 0.55, 1.1, 31));
    p.push(wallScreen('back', 0.4, 2.6, 0.45, 1.1, mix(domain.net, NAVY, 0.7), state.info, 'map'));
    for (let i = 0; i < 4; i += 1) p.push(rack(2.9 + (i % 2) * 0.34, 0.2 + Math.floor(i / 2) * 0.5, 1.05, mix(NAVY, domain.net, 0.25), 31 + i, state.info));
    for (let i = 0; i < 4; i += 1) p.push(rod([0.1, 0.3 + i * 0.12, H - 0.15], [2.8, 0.3 + i * 0.12, H - 0.15], 0.02, [domain.net, accent.gold, state.ok, domain.web][i] ?? domain.net));
    p.push(...desk(0.8, 1.5, 'x', wood), ...chair(1.0, 1.9, domain.net), ...desk(1.6, 1.5, 'x', wood), ...chair(1.8, 1.9, domain.net));
    p.push(...plant(0.3, 2.6), lamp(1.6, 1.6));
  }),
  // Web 施設: ガラス張りの作業場（画面の並ぶ机・看板の画面・植物）
  web: () => compose(domain.web, (p) => {
    p.push(cityWindow('left', 0.2, 2.8, 0.25, 1.2, 41), cityWindow('back', 2.4, 3.8, 0.25, 1.2, 42));
    p.push(wallScreen('back', 0.3, 2.0, 0.55, 1.1, mix(domain.web, NAVY, 0.5), city.lineWhite, 'lines'));
    for (const [x, y] of [[0.9, 1.0], [1.9, 1.0], [0.9, 1.9], [1.9, 1.9]] as [number, number][]) { p.push(...desk(x, y, 'x', mix(city.lineWhite, city.wallStone, 0.4))); p.push(...chair(x + 0.18, y + 0.36, domain.web)); }
    p.push(...plant(3.0, 1.0, 1.4), ...plant(3.4, 2.4, 1.2), ...plant(0.3, 2.7));
    p.push(lamp(1.4, 1.5), lamp(2.4, 1.5));
  }, ROOM(domain.web, mix(city.wallStone, NAVY, 0.25))),
  // セキュリティセンター: 監視室（金庫の扉・監視の画面の壁・鍵の棚）
  security: () => compose(domain.sec, (p) => {
    p.push(wallScreen('back', 0.3, 1.0, 0.75, 1.15, NAVY, state.ok, 'graph'), wallScreen('back', 1.1, 1.8, 0.75, 1.15, NAVY, state.info, 'lines'));
    p.push(wallScreen('back', 0.3, 1.0, 0.3, 0.7, NAVY, state.info, 'lines'), wallScreen('back', 1.1, 1.8, 0.3, 0.7, NAVY, state.bad, 'graph'));
    // 金庫の扉（丸い扉と把手）
    p.push(onWallItem('left', [
      onWall('left', 0.6, 1.6, 0.1, 1.05, shade(city.curb, 1.2), 1),
      onWall('left', 0.75, 1.45, 0.25, 0.9, mix(city.curb, city.lineWhite, 0.3), 2),
      onWall('left', 1.05, 1.15, 0.5, 0.65, accent.gold, 3, true, 0.012),
    ]));
    p.push(...console(1.0, 1.0, 1.4, mix(NAVY, domain.sec, 0.25), state.ok), ...chair(1.6, 1.4, domain.sec));
    p.push(rack(3.0, 0.2, 0.9, mix(NAVY, domain.sec, 0.3), 51, state.bad), rack(3.35, 0.2, 0.9, mix(NAVY, domain.sec, 0.3), 52, state.bad));
    p.push(lamp(1.7, 1.2), ...plant(3.6, 2.6));
  }),
  // 開発オフィス: 机の島と、枝分かれを描いた白板
  devoffice: () => compose(domain.git, (p) => {
    p.push(cityWindow('left', 0.3, 2.6, 0.45, 1.15, 61));
    p.push(onWallItem('back', [
      onWall('back', 0.4, 2.2, 0.45, 1.1, mix(city.lineWhite, city.wallStone, 0.2), 1),
      onWall('back', 0.55, 2.05, 0.75, 0.79, domain.git, 2, true, 0.01),
      onWall('back', 0.9, 1.5, 0.92, 0.96, domain.ctr, 2, true, 0.01),
      onWall('back', 0.86, 0.9, 0.75, 0.96, domain.ctr, 2, true, 0.01),
      onWall('back', 1.48, 1.52, 0.75, 0.96, domain.ctr, 2, true, 0.01),
      onWall('back', 1.2, 1.25, 0.72, 0.82, accent.gold, 3, true, 0.012),
    ]));
    for (const [x, y] of [[0.8, 1.1], [1.3, 1.1], [0.8, 1.7], [1.3, 1.7]] as [number, number][]) p.push(...desk(x, y, 'x', wood));
    p.push(...chair(0.95, 1.5, domain.git), ...chair(1.45, 2.1, domain.git));
    p.push(shelf(2.95, 0.02, 'x', 0.7, 62), ...plant(3.6, 1.2, 1.3), ...plant(2.6, 2.6));
    p.push(lamp(1.2, 1.4));
  }),
  // デプロイセンター: ベルトコンベアと箱、出荷口
  deploy: () => compose(domain.cicd, (p, g) => {
    p.push(cityWindow('left', 0.3, 1.2, 0.6, 1.1, 71));
    p.push(onWallItem('back', [
      onWall('back', 2.6, 3.7, 0.0, 0.95, shade(city.curb, 1.1), 1),
      ...Array.from({ length: 8 }, (_, i) => onWall('back', 2.6, 3.7, 0.04 + i * 0.11, 0.1 + i * 0.11, shade(city.curb, 0.9), 2)),
    ]));
    const zc = 0.3;
    p.push(box({ x0: 0.3, y0: 1.1, x1: 3.6, y1: 1.4, z0: zc - 0.05, z1: zc, wall: shade(city.curb, 0.7), top: mix(city.curb, NAVY, 0.5) }));
    for (const x of [0.5, 1.3, 2.1, 2.9, 3.5]) p.push(rod([x, 1.15, 0], [x, 1.15, zc - 0.05], 0.03, domain.cicd), rod([x, 1.35, 0], [x, 1.35, zc - 0.05], 0.03, domain.cicd));
    for (const [x, c] of [[0.6, mix(city.sand, city.roofTile, 0.25)], [1.4, mix(city.sand, city.roofTile, 0.4)], [2.3, mix(city.sand, city.roofTile, 0.25)], [3.0, domain.cicd]] as [number, string][]) p.push(crate(x, 1.14, zc, 0.24, 0.22, 0.18, c));
    // 腕（ロボット）
    p.push(prism(2.0, 1.8, 0.08, 0, 0.12, domain.cicd), rod([2.0, 1.8, 0.12], [2.0, 1.6, 0.55], 0.05, accent.gold), rod([2.0, 1.6, 0.55], [2.1, 1.3, 0.55], 0.04, accent.gold));
    g.push(pad(0.2, 2.2, 3.8, 2.3, state.warn), pad(0.2, 0.9, 3.8, 0.96, state.warn));
    p.push(...console(0.4, 2.45, 0.8, mix(NAVY, domain.cicd, 0.25), state.ok), lamp(1.8, 1.0));
  }),
  // コンテナ施設: 倉庫の中（積んだコンテナ・天井のクレーン・作業台）
  container: () => compose(domain.ctr, (p, g) => {
    p.push(cityWindow('left', 0.3, 2.6, 0.75, 1.15, 81));
    const cs = [domain.ctr, domain.docker, state.warn, domain.cicd, mix(domain.ctr, NAVY, 0.3), domain.sec];
    let k = 0;
    for (const [x, y] of [[0.3, 0.3], [0.3, 0.6], [1.3, 0.3]] as [number, number][]) for (let z = 0; z < 2; z += 1) p.push(crate(x, y, z * 0.22, 0.9, 0.26, 0.22, cs[k++ % cs.length] ?? domain.ctr));
    p.push(crate(2.6, 0.3, 0, 0.9, 0.26, 0.22, domain.docker));
    // 天井のクレーン（梁と吊り具）
    p.push(box({ x0: 0.1, y0: 1.5, x1: 3.9, y1: 1.6, z0: H - 0.2, z1: H - 0.14, wall: state.warn }));
    p.push(box({ x0: 2.1, y0: 1.45, x1: 2.4, y1: 1.65, z0: H - 0.28, z1: H - 0.2, wall: shade(state.warn, 0.8) }), rod([2.25, 1.55, H - 0.28], [2.25, 1.55, 0.55], 0.015, city.curb));
    p.push(crate(1.95, 1.42, 0.3, 0.6, 0.26, 0.22, domain.docker));
    g.push(pad(1.8, 1.3, 2.8, 1.36, state.warn), pad(1.8, 1.74, 2.8, 1.8, state.warn));
    p.push(...desk(3.0, 2.2, 'x', wood), ...chair(3.2, 2.55, domain.ctr), lamp(1.0, 1.9));
  }),
  // クラスタ施設: 同じ形の棚（ノード）の列と、管制の画面
  cluster: () => compose(domain.k8s, (p) => {
    p.push(wallScreen('back', 0.3, 2.2, 0.55, 1.1, mix(domain.k8s, NAVY, 0.7), state.ok, 'map'));
    p.push(cityWindow('left', 0.3, 1.2, 0.6, 1.1, 91));
    for (let r = 0; r < 3; r += 1) for (let i = 0; i < 3; i += 1) p.push(rack(1.2 + i * 0.6, 0.9 + r * 0.55, 0.75, mix(NAVY, domain.k8s, 0.3), 91 + r * 3 + i, i === 2 && r === 1 ? state.warn : state.ok));
    p.push(...console(2.6, 0.2, 1.0, mix(NAVY, domain.k8s, 0.25), state.info), lamp(2.0, 1.4), ...plant(0.4, 2.6));
  }),
  // データセンター: 冷えた機械室（背の高い棚・床下の通気・データの円筒）
  datacenter: () => compose(domain.db, (p, g) => {
    for (let i = 0; i < 7; i += 1) p.push(rack(0.3 + i * 0.32, 0.25, 1.15, mix(NAVY, domain.db, 0.2), 101 + i, state.info));
    for (let i = 0; i < 5; i += 1) p.push(rack(0.8 + i * 0.32, 1.4, 0.95, mix(NAVY, domain.db, 0.2), 111 + i, state.ok));
    for (let x = 0.3; x < 3.6; x += 0.5) g.push(pad(x, 0.85, x + 0.4, 1.1, mix(state.info, NAVY, 0.6)));
    for (const [x, y] of [[3.0, 2.2], [3.4, 2.2]] as [number, number][]) {
      p.push(prism(x, y, 0.14, 0, 0.4, mix(domain.db, city.sand, 0.3), mix(domain.db, city.lineWhite, 0.4), 14));
      p.push(part([{ kind: 'blob', center: [x, y, 0.4], r: 0.14, squash: 0.5, color: mix(domain.db, city.lineWhite, 0.5) }], [x - 0.14, y - 0.14, 0.38], [x + 0.14, y + 0.14, 0.42]));
    }
    p.push(box({ x0: 3.1, y0: 0.2, x1: 3.8, y1: 0.6, z0: 0, z1: 1.0, wall: mix(city.wallStone, city.lineWhite, 0.3) }), lamp(1.6, 1.0));
  }),
  // クラウドセンター: 明るい運用室（区画ごとの装置・雲を描いた画面・大きな窓）
  cloud: () => compose(domain.cloud, (p) => {
    p.push(cityWindow('left', 0.2, 2.8, 0.3, 1.2, 121));
    p.push(onWallItem('back', [
      onWall('back', 0.3, 2.5, 0.45, 1.1, mix(domain.cloud, NAVY, 0.6), 1, true),
      onWall('back', 0.6, 1.3, 0.7, 0.85, city.lineWhite, 2, true, 0.01),
      onWall('back', 0.8, 1.15, 0.85, 0.95, city.lineWhite, 2, true, 0.01),
      onWall('back', 1.6, 2.2, 0.6, 0.72, mix(city.lineWhite, domain.cloud, 0.3), 2, true, 0.01),
    ]));
    for (const [x, y] of [[0.8, 1.0], [2.0, 1.0], [1.4, 1.9]] as [number, number][]) for (let i = 0; i < 2; i += 1) p.push(rack(x + i * 0.32, y, 0.7, mix(city.wallStone, domain.cloud, 0.25), 121 + x * 10 + i, state.info));
    p.push(...desk(2.9, 2.0, 'x', mix(city.lineWhite, city.wallStone, 0.4)), ...chair(3.1, 2.4, domain.cloud), lamp(1.4, 1.5));
  }, ROOM(domain.cloud, mix(city.wallStone, NAVY, 0.2))),
  // 監視・運用センター: 大型画面の壁と、並んだ操作卓
  monitor: () => compose(domain.mon, (p) => {
    p.push(wallScreen('back', 0.2, 1.3, 0.55, 1.15, NAVY, state.ok, 'graph'), wallScreen('back', 1.4, 2.5, 0.55, 1.15, NAVY, domain.mon, 'graph'), wallScreen('back', 2.6, 3.7, 0.55, 1.15, NAVY, state.info, 'lines'));
    p.push(wallScreen('left', 0.3, 1.4, 0.55, 1.1, NAVY, state.info, 'map'));
    p.push(...console(0.5, 1.1, 1.3, mix(NAVY, domain.mon, 0.2), state.ok), ...console(2.0, 1.1, 1.3, mix(NAVY, domain.mon, 0.2), state.info));
    for (const x of [0.8, 1.4, 2.3, 2.9]) p.push(...chair(x, 1.45, domain.mon));
    p.push(...plant(3.6, 2.6), lamp(1.2, 1.8), lamp(2.6, 1.8));
  }),
  // DevOps 推進本部: 作戦会議の机と、進みの板（かんばん）
  devops: () => compose(domain.devops, (p) => {
    p.push(cityWindow('left', 0.3, 2.6, 0.45, 1.15, 141));
    const board: Shape[] = [onWall('back', 0.3, 2.6, 0.4, 1.1, mix(city.lineWhite, city.wallStone, 0.25), 1)];
    const notes = [domain.devops, state.warn, domain.web, state.ok, domain.cicd, domain.net];
    for (let c = 0; c < 3; c += 1) {
      board.push(onWall('back', 0.38 + c * 0.75, 1.0 + c * 0.75, 1.02, 1.05, NAVY, 2, false, 0.01));
      for (let i = 0; i < 3 - (c === 2 ? 1 : 0); i += 1) board.push(onWall('back', 0.45 + c * 0.75 + (i % 2) * 0.28, 0.68 + c * 0.75 + (i % 2) * 0.28, 0.85 - i * 0.16, 0.97 - i * 0.16, notes[(c * 2 + i) % notes.length] ?? domain.devops, 3, false, 0.012));
    }
    p.push(onWallItem('back', board));
    p.push(box({ x0: 1.0, y0: 1.3, x1: 2.6, y1: 1.9, z0: 0.26, z1: 0.3, wall: shade(wood, 0.8), top: wood }), rod([1.8, 1.6, 0], [1.8, 1.6, 0.26], 0.08, city.curb));
    for (const [x, y] of [[1.1, 1.05], [1.7, 1.05], [2.3, 1.05], [1.1, 1.95], [1.7, 1.95], [2.3, 1.95]] as [number, number][]) p.push(...chair(x, y, domain.devops));
    p.push(...plant(3.5, 0.5, 1.4), ...plant(3.6, 2.6), lamp(1.8, 1.6));
  }),
  // インシデント対応本部: 車庫の出動車・指令卓・警報灯
  incident: () => compose(domain.trouble, (p, g) => {
    p.push(onWallItem('back', [
      onWall('back', 1.8, 3.8, 0.0, 1.1, shade(city.curb, 1.1), 1),
      ...Array.from({ length: 9 }, (_, i) => onWall('back', 1.8, 3.8, 0.04 + i * 0.12, 0.1 + i * 0.12, shade(city.curb, 0.9), 2)),
    ]));
    // 出動車（車体・窓・赤い灯）
    const car = { x0: 2.0, y0: 0.4, x1: 3.5, y1: 0.95 };
    p.push(box({ ...car, z0: 0.08, z1: 0.5, wall: state.bad, top: shade(state.bad, 1.1) }, [
      { kind: 'poly', pts: onFace(car, '+y', 0.08, 0.4, 0.28, 0.45), color: mix(city.wallGlass, NAVY, 0.3), layer: 1 },
      { kind: 'poly', pts: onFace(car, '+y', 0.5, 1.4, 0.2, 0.26), color: city.lineWhite, layer: 1 },
      { kind: 'poly', pts: onFace(car, '+x', 0.05, 0.5, 0.28, 0.45), color: mix(city.wallGlass, NAVY, 0.3), layer: 1 },
    ]));
    p.push(box({ x0: 2.1, y0: 0.55, x1: 2.3, y1: 0.8, z0: 0.5, z1: 0.56, wall: state.info }), box({ x0: 3.2, y0: 0.55, x1: 3.4, y1: 0.8, z0: 0.5, z1: 0.56, wall: state.bad }));
    for (const x of [2.3, 3.2]) p.push(prism(x, 0.97, 0.07, 0, 0.12, NAVY, NAVY, 10));
    g.push(pad(1.9, 1.2, 3.8, 1.26, state.warn));
    p.push(wallScreen('left', 0.3, 1.6, 0.5, 1.05, NAVY, state.warn, 'map'));
    p.push(...console(0.4, 1.4, 1.1, mix(NAVY, domain.trouble, 0.2), state.warn), ...chair(0.8, 1.75, domain.trouble));
    p.push(part([{ kind: 'blob', center: [0.2, 0.2, H - 0.15], r: 0.06, squash: 1, color: state.bad, lit: true }], [0.14, 0.14, H - 0.21], [0.26, 0.26, H - 0.09]), lamp(2.4, 1.8));
  }),
  // 研究施設: 実験の台と装置、丸い天窓の光、標本の棚
  research: () => compose(domain.lab, (p, g) => {
    p.push(cityWindow('left', 0.4, 1.6, 0.55, 1.15, 161));
    p.push(wallScreen('back', 0.3, 1.6, 0.5, 1.05, mix(domain.lab, NAVY, 0.75), accent.gold, 'graph'));
    for (const y of [1.0, 1.9]) {
      p.push(box({ x0: 0.8, y0: y, x1: 2.6, y1: y + 0.35, z0: 0, z1: 0.32, wall: mix(city.wallStone, city.lineWhite, 0.3), top: mix(city.lineWhite, city.wallGlass, 0.3) }));
      for (const x of [1.0, 1.6, 2.2]) {
        p.push(prism(x, y + 0.17, 0.05, 0.32, 0.45, mix(city.wallGlass, state.info, 0.3), mix(state.ok, city.lineWhite, 0.4), 10));
        p.push(rod([x + 0.12, y + 0.17, 0.32], [x + 0.12, y + 0.17, 0.55], 0.015, city.curb));
      }
    }
    p.push(shelf(2.9, 0.02, 'x', 1.0, 162), prism(3.4, 1.6, 0.18, 0, 0.5, mix(domain.lab, NAVY, 0.3), accent.gold, 16));
    p.push(part([{ kind: 'blob', center: [3.4, 1.6, 0.68], r: 0.16, squash: 1, color: mix(state.info, city.lineWhite, 0.3), lit: true }], [3.24, 1.44, 0.52], [3.56, 1.76, 0.84]));
    g.push(...Array.from({ length: 1 }, () => pad(0.6, 0.7, 2.8, 2.5, mix(city.windowLit, NAVY, 0.85))));
    p.push(lamp(1.7, 1.45));
  }),
};

/** 施設の中の景色を持つ施設（レッスン画面の背景。15 施設） */
export const INTERIOR_FACILITIES = Object.keys(BUILDERS) as FacilityType[];

export function interiorModel(type: FacilityType): Model | null {
  return BUILDERS[type]?.() ?? null;
}
