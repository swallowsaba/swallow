import { city, domain, mix, shade, state } from '@/ui/tokens';
import { band, beacon, bench, dish, dome, groundEllipse, mullions, NAVY, noiseOf } from '../facilityKit';
import type { Model, Part, Poly, V3 } from '../mesh';
import {
  box, broadleafTree, conifer, door, gableRoof, groundPoly, hedge, pad, parapet, part, prism, rod, rooftopUnit, signBoard, streetLamp, windows,
} from '../shapes';

/**
 * 3×3 の施設の模型（docs/city-design.md 4 章の「見た目の特徴」と、Lv が上がると加わるもの）。正面（入口）は +y。
 * クラスタ施設・クラウドセンター・研究施設。
 */

/* ---------- クラスタ施設: ノード群と管制塔 → 棟の追加（Lv2）→ ヘリポート（Lv3）→ 5 階のノード（Lv4）→ 6 階のノードと高い管制塔（Lv5） ---------- */

function node(x: number, y: number, seed: number, floors = 3): Part[] {
  const wall = mix(city.wallStone, city.wallGlass, 0.3);
  const b = { x0: x, y0: y, x1: x + 0.62, y1: y + 0.55 };
  const fh = 0.24;
  const h = fh * floors + 0.05;
  return [
    box({ ...b, z0: 0, z1: h, wall, top: mix(city.paving, city.lineWhite, 0.3) }, [
      ...windows(b, { floor: fh, floors, base: 0.04, width: 0.1, pitch: 0.17, height: 0.55, litRatio: 0.5, noise: noiseOf(seed), glass: mix(city.wallGlass, domain.k8s, 0.15), frame: shade(wall, 0.55), skip: [{ side: '+y', u0: 0.22, u1: 0.4, floor: 0 }] }),
      ...band(b, h - 0.06, h - 0.03, domain.k8s),
    ]),
    ...door(b, '+y', 0.24, 0.14, 0.2, NAVY, shade(wall, 0.8)),
    rooftopUnit(b.x0 + 0.08, b.y0 + 0.1, h, 0.9),
  ];
}

/** 屋上のヘリポート（円い床・白い輪・H の印・四隅の灯り） */
function helipad(x0: number, y0: number, x1: number, y1: number, z: number): Part[] {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const r = Math.min(x1 - x0, y1 - y0) / 2 - 0.02;
  const disc = (rr: number, n = 16): V3[] => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rr, cy + Math.sin((i / n) * Math.PI * 2) * rr, z + 0.03] as V3);
  const bar = (ax: number, ay: number, bx: number, by: number): V3[] => [[ax, ay, z + 0.032], [bx, ay, z + 0.032], [bx, by, z + 0.032], [ax, by, z + 0.032]];
  const s = r * 0.45;
  return [
    part([
      { kind: 'poly', pts: disc(r), color: mix(city.paving, NAVY, 0.35) },
      { kind: 'poly', pts: disc(r * 0.82), color: city.lineWhite, layer: 1 },
      { kind: 'poly', pts: disc(r * 0.74), color: mix(city.paving, NAVY, 0.35), layer: 2 },
      { kind: 'poly', pts: bar(cx - s, cy - s, cx - s * 0.6, cy + s), color: state.warn, layer: 3 },
      { kind: 'poly', pts: bar(cx + s * 0.6, cy - s, cx + s, cy + s), color: state.warn, layer: 3 },
      { kind: 'poly', pts: bar(cx - s * 0.6, cy - s * 0.18, cx + s * 0.6, cy + s * 0.18), color: state.warn, layer: 3 },
    ], [cx - r, cy - r, z], [cx + r, cy + r, z + 0.035]),
    ...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => beacon(x as number, y as number, z, state.ok)),
  ];
}

export function cluster(level = 1): Model {
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 3, 3, mix(city.paving, city.sand, 0.2)),
    // ノードの間をつなぐ通路（十字）
    pad(1.42, 0.1, 1.58, 2.9, mix(city.paving, city.lineWhite, 0.3)),
    pad(0.1, 1.42, 2.9, 1.58, mix(city.paving, city.lineWhite, 0.3)),
    groundPoly([[2.05, 2.1], [2.9, 2.1], [2.9, 2.9], [2.05, 2.9]], city.grass),
  ];
  const nf = level >= 5 ? 6 : level >= 4 ? 5 : 3;
  // 同じ形のノード（2×2 に並ぶ。Lv2 で 4 棟目を足し、管制塔は右手前の角へ移る）
  parts.push(...node(0.4, 0.4, 111, nf), ...node(1.75, 0.4, 112, nf), ...node(0.4, 1.75, 113, nf));
  if (level >= 2) parts.push(...node(1.75, 1.75, 115, Math.max(3, nf - 1)));
  if (level >= 3) parts.push(...helipad(1.79, 0.42, 2.33, 0.93, 0.24 * nf + 0.05));
  // 管制塔（細い塔と、上のガラスの部屋）
  const [tx, ty] = level >= 2 ? [2.5, 2.45] : [1.95, 1.85];
  const tower = { x0: tx, y0: ty, x1: tx + 0.3, y1: ty + 0.3 };
  const th = level >= 5 ? 2.25 : level >= 4 ? 1.85 : 1.55;
  parts.push(box({ ...tower, z0: 0, z1: th, wall: mix(city.wallStone, city.lineWhite, 0.4) }, windows(tower, { floor: 0.35, floors: Math.floor(th / 0.35), base: 0.05, width: 0.08, pitch: 0.3, height: 0.4, litRatio: 0.4, noise: noiseOf(114), frame: shade(city.wallStone, 0.6) })));
  const cab = { x0: tx - 0.1, y0: ty - 0.1, x1: tx + 0.4, y1: ty + 0.4 };
  parts.push(box({ ...cab, z0: th, z1: th + 0.24, wall: mix(city.wallGlass, city.windowLit, 0.35) }, [
    ...mullions(cab, '+x', th, th + 0.24, 0.12, mix(city.lineWhite, city.curb, 0.3)),
    ...mullions(cab, '+y', th, th + 0.24, 0.12, mix(city.lineWhite, city.curb, 0.3)),
  ]));
  parts.push(box({ x0: cab.x0 - 0.04, y0: cab.y0 - 0.04, z0: th + 0.24, x1: cab.x1 + 0.04, y1: cab.y1 + 0.04, z1: th + 0.29, wall: domain.k8s }));
  parts.push(rod([tx + 0.15, ty + 0.15, th + 0.29], [tx + 0.15, ty + 0.15, th + 0.55], 0.014, city.curb));
  parts.push(rod([tx + 0.15, ty + 0.15, th + 0.53], [tx + 0.15, ty + 0.15, th + 0.57], 0.03, state.bad));
  parts.push(...door(tower, '+y', 0.08, 0.14, 0.2, NAVY, domain.k8s));
  // ノードをつなぐ配管（渡りのケーブル棚）。Lv2 から 4 棟目へも
  parts.push(rod([1.02, 0.65, 0.42], [1.75, 0.65, 0.42], 0.03, mix(city.curb, city.lineWhite, 0.3)));
  parts.push(rod([0.7, 0.95, 0.42], [0.7, 1.75, 0.42], 0.03, mix(city.curb, city.lineWhite, 0.3)));
  if (level >= 2) {
    parts.push(rod([1.02, 2.0, 0.42], [1.75, 2.0, 0.42], 0.03, mix(city.curb, city.lineWhite, 0.3)));
    parts.push(rod([2.05, 0.95, 0.42], [2.05, 1.75, 0.42], 0.03, mix(city.curb, city.lineWhite, 0.3)));
  }
  // 看板・植え込み・木・街灯
  parts.push(box({ x0: 1.1, y0: 2.85, z0: 0, x1: 1.4, y1: 2.9, z1: 0.14, wall: shade(city.curb, 0.85) }, [
    { kind: 'poly', pts: [[1.38, 2.906, 0.05], [1.12, 2.906, 0.05], [1.12, 2.906, 0.12], [1.38, 2.906, 0.12]], color: mix(domain.k8s, city.lineWhite, 0.25), lit: true, layer: 1 },
  ]));
  parts.push(hedge(0.15, 2.82, 1.05, 2.9));
  const trees: [number, number, number][] = level >= 2 ? [[2.15, 2.75, 0], [0.2, 1.3, 2], [2.8, 1.25, 0]] : [[2.5, 2.5, 0], [2.75, 2.25, 1], [0.2, 1.3, 2], [2.8, 1.25, 0]];
  for (const [x, y, v] of trees) parts.push(broadleafTree(x, y, 0.75, v));
  parts.push(...streetLamp(1.65, 2.7, '-x'));
  return { w: 3, d: 3, ground, parts, shadowHeight: 0.8 + (nf - 3) * 0.24 };
}

/* ---------- クラウドセンター: 雲を模した屋根の建物 → 複数棟の分散（Lv2）→ 別地区の分館（Lv3）→ 3 階（Lv4）→ 4 階と大きな雲（Lv5） ---------- */

/** 雲の屋根（白い丸みの塊を重ねる） */
function cloudPuffs(puffs: [number, number, number, number][], z: number): Part[] {
  return puffs.map(([x, y, r, zr], i) => {
    const light = i % 3 === 0 ? city.lineWhite : mix(city.lineWhite, domain.cloud, 0.12);
    return part([
      { kind: 'blob', center: [x, y, z + zr * 0.45], r, squash: 0.62, color: shade(light, 0.86) },
      { kind: 'blob', center: [x - r * 0.15, y - r * 0.1, z + zr * 0.6], r: r * 0.72, squash: 0.62, color: light },
    ], [x - r, y - r, z], [x + r, y + r, z + zr]);
  });
}

/** 小さな雲の屋根の棟（分散した棟・分館） */
function cloudPod(x0: number, y0: number, x1: number, y1: number, floors: number, seed: number): Part[] {
  const wall = mix(city.lineWhite, city.wallGlass, 0.35);
  const b = { x0, y0, x1, y1 };
  const h = floors * 0.26 + 0.04;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const r = Math.min(x1 - x0, y1 - y0) * 0.38;
  return [
    box({ ...b, z0: 0, z1: h, wall, top: mix(city.lineWhite, city.wallGlass, 0.2) }, [
      ...windows(b, { floor: 0.26, floors, base: 0.04, width: 0.12, pitch: 0.18, height: 0.65, litRatio: 0.45, noise: noiseOf(seed), glass: mix(city.wallGlass, domain.cloud, 0.25) }),
      ...band(b, h - 0.05, h - 0.03, mix(domain.cloud, city.lineWhite, 0.3)),
    ]),
    ...cloudPuffs([[cx - r * 0.5, cy, r, r * 1.1], [cx + r * 0.5, cy + r * 0.2, r * 0.9, r], [cx, cy - r * 0.3, r * 1.1, r * 1.3]], h),
  ];
}

export function cloud(level = 1): Model {
  const wall = mix(city.lineWhite, city.wallGlass, 0.35);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 3, 3, mix(city.paving, city.lineWhite, 0.25)),
    groundEllipse(1.5, 2.45, 0.9, 0.35, mix(city.grass, city.tree3, 0.2)),
    pad(1.32, 1.9, 1.68, 3, mix(city.paving, city.sand, 0.25)),
  ];
  const b = { x0: 0.35, y0: 0.4, x1: 2.65, y1: 1.85 };
  const fh = 0.28;
  const floors = level >= 5 ? 4 : level >= 4 ? 3 : 2;
  const h = fh * floors + 0.05;
  parts.push(box({ ...b, z0: 0, z1: h, wall, top: mix(city.lineWhite, city.wallGlass, 0.2) }, [
    ...windows(b, { floor: fh, floors, base: 0.04, width: 0.16, pitch: 0.22, height: 0.68, litRatio: 0.4, noise: noiseOf(121), glass: mix(city.wallGlass, domain.cloud, 0.25), skip: [{ side: '+y', u0: 0.95, u1: 1.35, floor: 0 }] }),
    ...band(b, fh + 0.02, fh + 0.05, mix(domain.cloud, city.lineWhite, 0.3)),
    ...(floors >= 3 ? band(b, fh * 2 + 0.02, fh * 2 + 0.05, mix(domain.cloud, city.lineWhite, 0.3)) : []),
  ]));
  parts.push(...door(b, '+y', 0.98, 0.34, 0.24, mix(NAVY, city.wallGlass, 0.4), mix(domain.cloud, city.lineWhite, 0.4)));
  // 雲の屋根（奥から手前へ。Lv5 は大きく高く）
  const k = level >= 5 ? 1.2 : 1;
  const puffs: [number, number, number, number][] = [
    [0.8, 0.75, 0.35 * k, 0.42 * k], [1.5, 0.7, 0.45 * k, 0.48 * k], [2.2, 0.8, 0.38 * k, 0.42 * k],
    [1.05, 1.25, 0.42 * k, 0.45 * k], [1.85, 1.3, 0.44 * k, 0.46 * k], [1.45, 1.05, 0.5 * k, 0.58 * k],
    [0.65, 1.45, 0.3 * k, 0.36 * k], [2.35, 1.45, 0.3 * k, 0.36 * k],
  ];
  parts.push(...cloudPuffs(puffs, h));
  if (level >= 5) parts.push(...dish(2.45, 0.55, h, 0.12));
  // 地上の空調と、横の小さな機械室
  const mech = { x0: 2.7, y0: 0.5, x1: 2.92, y1: 1.2 };
  parts.push(box({ ...mech, z0: 0, z1: 0.25, wall: mix(city.wallStone, city.curb, 0.2) }));
  parts.push(rooftopUnit(2.72, 0.6, 0.25, 0.9));
  parts.push(signBoard(b, '+y', 0.15, 0.85, fh * 2 + 0.05 - 0.18, fh * 2 + 0.05 - 0.08, mix(domain.cloud, NAVY, 0.25)));
  if (level >= 2) {
    // 複数棟の分散（前庭の左右に、雲の屋根の小さな棟）
    parts.push(...cloudPod(0.1, 2.1, 0.75, 2.85, level >= 4 ? 2 : 1, 122));
    parts.push(...cloudPod(2.25, 2.1, 2.9, 2.85, level >= 4 ? 2 : 1, 123));
  }
  if (level >= 3) {
    // 別地区の分館へ: 奥の角の細い分館と、敷地の外へ伸びる光る回線
    parts.push(...cloudPod(0.05, 0.05, 0.35, 0.55, level >= 5 ? 5 : 4, 124));
    ground.push(groundPoly([[0.15, 0.55], [0.23, 0.55], [0.23, 2.1], [0.15, 2.1]], mix(domain.cloud, city.lineWhite, 0.4)));
    ground.push(groundPoly([[0, 0.25], [0.05, 0.25], [0.05, 0.33], [0, 0.33]], mix(domain.cloud, city.lineWhite, 0.4)));
  }
  // 前庭: ベンチ・木・街灯
  parts.push(...bench(level >= 2 ? 0.95 : 0.75, 2.3, 'x'));
  parts.push(...bench(level >= 2 ? 1.85 : 2.05, 2.3, 'x'));
  const trees: [number, number, number][] = level >= 2 ? [[2.85, 1.9, 1], [1.1, 2.75, 1], [1.9, 2.75, 2]] : [[0.3, 2.6, 1], [2.7, 2.6, 2], [0.2, 0.3, 0], [2.85, 1.9, 1]];
  if (level === 2) trees.push([0.2, 0.3, 0]);
  for (const [x, y, v] of trees) parts.push(broadleafTree(x, y, 0.8, v));
  parts.push(...streetLamp(1.2, 2.85, '+x'));
  parts.push(...streetLamp(1.8, 2.85, '-x'));
  return { w: 3, d: 3, ground, parts, shadowHeight: 1.0 + (floors - 2) * 0.28 };
}

/* ---------- 研究施設: ドーム屋根の研究所 → 実験棟（Lv2）→ 展示ホール（Lv3）→ 高い本館（Lv4）→ 2 つ目の天文台（Lv5） ---------- */

export function research(level = 1): Model {
  const wall = mix(city.wallStone, city.lineWhite, 0.5);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 3, 3, mix(city.paving, city.sand, 0.35)),
    groundEllipse(1.15, 1.25, 0.95, 0.95, mix(city.paving, city.lineWhite, 0.3), 28),
    pad(1.0, 2.1, 1.3, 3, mix(city.paving, city.lineWhite, 0.25)),
    groundPoly([[2.1, 2.1], [2.9, 2.1], [2.9, 2.9], [2.1, 2.9]], level >= 3 ? mix(city.paving, city.lineWhite, 0.3) : city.grass),
  ];
  // 円い本館（多角柱）と、ドームの屋根。Lv4 から高く、2 段の窓
  const cx = 1.15;
  const cy = 1.2;
  const r = 0.72;
  const tiers = level >= 4 ? 2 : 1;
  const h = 0.55 + (tiers - 1) * 0.38;
  parts.push(prism(cx, cy, r, 0, h, wall, mix(city.paving, city.lineWhite, 0.3), 20));
  // 壁の窓（多角柱の面ごとに縦長の窓。見えない面の窓は描く時に省かれる）
  const winShapes: Poly[] = [];
  for (let t = 0; t < tiers; t += 1) {
    for (let i = 0; i < 20; i += 1) {
      const a0 = ((i + 0.3) / 20) * Math.PI * 2;
      const a1 = ((i + 0.7) / 20) * Math.PI * 2;
      const lit = noiseOf(131 + t)(i, 0, 0) < 0.45;
      const rr = r + 0.005;
      const z0 = 0.12 + t * 0.38;
      const z1 = 0.42 + t * 0.38;
      winShapes.push({ kind: 'poly', pts: [[cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, z0], [cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr, z0], [cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr, z1], [cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, z1]], color: lit ? city.windowLit : mix(city.wallGlass, city.lineWhite, 0.15), lit, layer: 1 });
    }
  }
  parts.push(part(winShapes, [cx - r, cy - r, 0.12], [cx + r, cy + r, 0.42 + (tiers - 1) * 0.38]));
  parts.push(prism(cx, cy, r + 0.04, h, h + 0.05, mix(domain.lab, wall, 0.45), undefined, 20));
  parts.push(dome(cx, cy, r * 0.82, h + 0.05, mix(city.lineWhite, city.wallGlass, 0.25), 20, 6));
  // 観測の細い窓（ドームの割れ目）
  parts.push(part([
    { kind: 'poly', pts: [[cx + 0.06, cy + r * 0.8, h + 0.08], [cx - 0.06, cy + r * 0.8, h + 0.08], [cx - 0.05, cy + 0.2, h + 0.05 + r * 0.78], [cx + 0.05, cy + 0.2, h + 0.05 + r * 0.78]], color: shade(NAVY, 1.6), layer: 2, double: true },
  ], [cx - 0.06, cy + 0.2, h], [cx + 0.06, cy + r, h + r]));
  // 実験棟（四角い低い棟。Lv2 から 3 階建てと、屋上の配管と排気筒）と、つなぐ廊下
  const lab = { x0: 2.0, y0: 0.35, x1: 2.85, y1: 1.6 };
  const lf = level >= 2 ? 3 : 1;
  const lh = level >= 2 ? lf * 0.28 + 0.04 : 0.32;
  parts.push(box({ ...lab, z0: 0, z1: lh, wall: mix(wall, city.wallStone, 0.3) }, [
    ...windows(lab, { floor: 0.28, floors: lf, base: 0.03, width: 0.1, pitch: 0.2, height: 0.55, litRatio: 0.45, noise: noiseOf(132), frame: shade(city.wallStone, 0.6) }),
    ...(level >= 2 ? band(lab, 0.29, 0.31, mix(domain.lab, wall, 0.3)) : []),
  ]));
  parts.push(...parapet(lab.x0, lab.y0, lab.x1, lab.y1, lh, 0.03, shade(wall, 0.9)));
  parts.push(box({ x0: 1.85, y0: 0.95, z0: 0, x1: 2.0, y1: 1.2, z1: 0.26, wall: mix(city.wallGlass, city.windowLit, 0.25) }));
  parts.push(rooftopUnit(2.15, 0.5, lh, 1));
  if (level >= 2) {
    parts.push(prism(2.7, 1.45, 0.05, lh, lh + 0.4, mix(city.lineWhite, city.wallStone, 0.3), shade(city.curb, 0.5), 10));
    parts.push(rod([2.15, 1.2, lh + 0.08], [2.65, 1.2, lh + 0.08], 0.035, mix(city.curb, city.lineWhite, 0.3)));
    parts.push(rod([2.15, 1.35, lh + 0.08], [2.65, 1.35, lh + 0.08], 0.035, mix(domain.lab, city.curb, 0.3)));
  }
  if (level >= 5) {
    // 2 つ目の天文台（実験棟の屋上の小さなドーム）
    parts.push(prism(2.45, 0.75, 0.22, lh, lh + 0.12, wall, undefined, 8));
    parts.push(dome(2.45, 0.75, 0.2, lh + 0.12, mix(city.lineWhite, domain.lab, 0.2), 8, 3));
  } else {
    parts.push(...dish(2.55, 0.6, lh, 0.1));
  }
  // 入口（張り出した玄関）
  parts.push(box({ x0: 0.95, y0: 1.85, z0: 0, x1: 1.35, y1: 2.08, z1: 0.26, wall: mix(wall, city.wallStone, 0.15) }));
  parts.push(...door({ x0: 0.95, y0: 1.85, x1: 1.35, y1: 2.08 }, '+y', 0.1, 0.2, 0.2, mix(NAVY, city.wallGlass, 0.4), domain.lab));
  parts.push(signBoard({ x0: 0.95, y0: 1.85, x1: 1.35, y1: 2.08 }, '+x', 0.03, 0.2, 0.08, 0.2, domain.lab));
  if (level >= 3) {
    // 展示ホール（ガラスの切妻屋根の低い棟と、前の展示の像）
    const hall = { x0: 1.95, y0: 1.95, x1: 2.85, y1: 2.75 };
    parts.push(box({ ...hall, z0: 0, z1: 0.34, wall: mix(wall, city.lineWhite, 0.2) }, [
      ...windows(hall, { floor: 0.3, floors: 1, base: 0.03, width: 0.16, pitch: 0.2, height: 0.75, litRatio: 0.55, noise: noiseOf(133), glass: mix(city.wallGlass, domain.lab, 0.15), skip: [{ side: '+y', u0: 0.3, u1: 0.6, floor: 0 }] }),
    ]));
    parts.push(gableRoof({ ...hall, z: 0.34, rise: 0.22, ridge: 'x', roof: mix(city.wallGlass, city.windowLit, 0.3), wall: mix(wall, city.lineWhite, 0.2), eave: 0.04 }));
    parts.push(...door(hall, '+y', 0.32, 0.26, 0.24, mix(NAVY, city.wallGlass, 0.4), domain.lab));
    parts.push(box({ x0: 2.6, y0: 2.8, z0: 0, x1: 2.75, y1: 2.92, z1: 0.06, wall: shade(city.curb, 0.9) }));
    parts.push(part([
      { kind: 'blob', center: [2.675, 2.86, 0.16], r: 0.07, squash: 1, color: mix(domain.lab, city.lineWhite, 0.2) },
      { kind: 'blob', center: [2.66, 2.85, 0.18], r: 0.035, squash: 1, color: mix(domain.lab, city.lineWhite, 0.6), layer: 1 },
    ], [2.6, 2.8, 0.06], [2.75, 2.92, 0.24]));
  }
  // 庭の木・ベンチ・街灯
  const trees: [number, number, number][] = level >= 3 ? [[0.25, 2.5, 1], [0.2, 0.25, 0]] : [[2.35, 2.4, 0], [2.7, 2.7, 2], [0.25, 2.5, 1], [0.2, 0.25, 0]];
  for (const [x, y, v] of trees) parts.push(broadleafTree(x, y, 0.85, v));
  if (level < 3) parts.push(conifer(2.75, 2.2, 0.6));
  parts.push(...bench(1.55, 2.4, 'x'));
  parts.push(hedge(0.15, 2.85, 0.9, 2.92));
  parts.push(...streetLamp(1.5, 2.85, '-x'));
  if (level >= 4) parts.push(...streetLamp(0.6, 2.2, '+x'));
  return { w: 3, d: 3, ground, parts, shadowHeight: 1.0 + (tiers - 1) * 0.35 };
}
