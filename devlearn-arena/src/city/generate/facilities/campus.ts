import { city, domain, mix, shade, state } from '@/ui/tokens';
import { band, bench, dish, dome, groundEllipse, mullions, NAVY, noiseOf } from '../facilityKit';
import type { Model, Part, Poly } from '../mesh';
import {
  box, broadleafTree, conifer, door, groundPoly, hedge, pad, parapet, part, prism, rod, rooftopUnit, signBoard, streetLamp, windows,
} from '../shapes';

/**
 * 3×3 の施設の模型（docs/city-design.md 4 章の Lv1）。正面（入口）は +y。
 * クラスタ施設・クラウドセンター・研究施設。
 */

/* ---------- クラスタ施設: 同じ形のビル群（ノード）と管制塔 ---------- */

function node(x: number, y: number, seed: number): Part[] {
  const wall = mix(city.wallStone, city.wallGlass, 0.3);
  const b = { x0: x, y0: y, x1: x + 0.62, y1: y + 0.55 };
  const fh = 0.24;
  const h = fh * 3 + 0.05;
  return [
    box({ ...b, z0: 0, z1: h, wall, top: mix(city.paving, city.lineWhite, 0.3) }, [
      ...windows(b, { floor: fh, floors: 3, base: 0.04, width: 0.1, pitch: 0.17, height: 0.55, litRatio: 0.5, noise: noiseOf(seed), glass: mix(city.wallGlass, domain.k8s, 0.15), frame: shade(wall, 0.55), skip: [{ side: '+y', u0: 0.22, u1: 0.4, floor: 0 }] }),
      ...band(b, h - 0.06, h - 0.03, domain.k8s),
    ]),
    ...door(b, '+y', 0.24, 0.14, 0.2, NAVY, shade(wall, 0.8)),
    rooftopUnit(b.x0 + 0.08, b.y0 + 0.1, h, 0.9),
  ];
}

export function cluster(): Model {
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 3, 3, mix(city.paving, city.sand, 0.2)),
    // ノードの間をつなぐ通路（十字）
    pad(1.42, 0.1, 1.58, 2.9, mix(city.paving, city.lineWhite, 0.3)),
    pad(0.1, 1.42, 2.9, 1.58, mix(city.paving, city.lineWhite, 0.3)),
    groundPoly([[2.05, 2.1], [2.9, 2.1], [2.9, 2.9], [2.05, 2.9]], city.grass),
  ];
  // 同じ形のノード 4 棟（2×2 に並ぶ）
  parts.push(...node(0.4, 0.4, 111), ...node(1.75, 0.4, 112), ...node(0.4, 1.75, 113));
  // 管制塔（細い塔と、上のガラスの部屋）
  const tower = { x0: 1.95, y0: 1.85, x1: 2.25, y1: 2.15 };
  const th = 1.55;
  parts.push(box({ ...tower, z0: 0, z1: th, wall: mix(city.wallStone, city.lineWhite, 0.4) }, windows(tower, { floor: 0.35, floors: 4, base: 0.05, width: 0.08, pitch: 0.3, height: 0.4, litRatio: 0.4, noise: noiseOf(114), frame: shade(city.wallStone, 0.6) })));
  const cab = { x0: 1.85, y0: 1.75, x1: 2.35, y1: 2.25 };
  parts.push(box({ ...cab, z0: th, z1: th + 0.24, wall: mix(city.wallGlass, city.windowLit, 0.35) }, [
    ...mullions(cab, '+x', th, th + 0.24, 0.12, mix(city.lineWhite, city.curb, 0.3)),
    ...mullions(cab, '+y', th, th + 0.24, 0.12, mix(city.lineWhite, city.curb, 0.3)),
  ]));
  parts.push(box({ x0: cab.x0 - 0.04, y0: cab.y0 - 0.04, z0: th + 0.24, x1: cab.x1 + 0.04, y1: cab.y1 + 0.04, z1: th + 0.29, wall: domain.k8s }));
  parts.push(rod([2.1, 2.0, th + 0.29], [2.1, 2.0, th + 0.55], 0.014, city.curb));
  parts.push(rod([2.1, 2.0, th + 0.53], [2.1, 2.0, th + 0.57], 0.03, state.bad));
  parts.push(...door(tower, '+y', 0.08, 0.14, 0.2, NAVY, domain.k8s));
  // ノードをつなぐ配管（渡りのケーブル棚）
  parts.push(rod([1.02, 0.65, 0.42], [1.75, 0.65, 0.42], 0.03, mix(city.curb, city.lineWhite, 0.3)));
  parts.push(rod([0.7, 0.95, 0.42], [0.7, 1.75, 0.42], 0.03, mix(city.curb, city.lineWhite, 0.3)));
  // 看板・植え込み・木・街灯
  parts.push(box({ x0: 1.1, y0: 2.85, z0: 0, x1: 1.4, y1: 2.9, z1: 0.14, wall: shade(city.curb, 0.85) }, [
    { kind: 'poly', pts: [[1.38, 2.906, 0.05], [1.12, 2.906, 0.05], [1.12, 2.906, 0.12], [1.38, 2.906, 0.12]], color: mix(domain.k8s, city.lineWhite, 0.25), lit: true, layer: 1 },
  ]));
  parts.push(hedge(0.15, 2.82, 1.05, 2.9));
  for (const [x, y, v] of [[2.5, 2.5, 0], [2.75, 2.25, 1], [0.2, 1.3, 2], [2.8, 1.25, 0]] as [number, number, number][]) parts.push(broadleafTree(x, y, 0.75, v));
  parts.push(...streetLamp(1.65, 2.7, '-x'));
  return { w: 3, d: 3, ground, parts, shadowHeight: 0.8 };
}

/* ---------- クラウドセンター: 雲を模した屋根の建物 ---------- */

export function cloud(): Model {
  const wall = mix(city.lineWhite, city.wallGlass, 0.35);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 3, 3, mix(city.paving, city.lineWhite, 0.25)),
    groundEllipse(1.5, 2.45, 0.9, 0.35, mix(city.grass, city.tree3, 0.2)),
    pad(1.32, 1.9, 1.68, 3, mix(city.paving, city.sand, 0.25)),
  ];
  const b = { x0: 0.35, y0: 0.4, x1: 2.65, y1: 1.85 };
  const fh = 0.28;
  const h = fh * 2 + 0.05;
  parts.push(box({ ...b, z0: 0, z1: h, wall, top: mix(city.lineWhite, city.wallGlass, 0.2) }, [
    ...windows(b, { floor: fh, floors: 2, base: 0.04, width: 0.16, pitch: 0.22, height: 0.68, litRatio: 0.4, noise: noiseOf(121), glass: mix(city.wallGlass, domain.cloud, 0.25), skip: [{ side: '+y', u0: 0.95, u1: 1.35, floor: 0 }] }),
    ...band(b, fh + 0.02, fh + 0.05, mix(domain.cloud, city.lineWhite, 0.3)),
  ]));
  parts.push(...door(b, '+y', 0.98, 0.34, 0.24, mix(NAVY, city.wallGlass, 0.4), mix(domain.cloud, city.lineWhite, 0.4)));
  // 雲の屋根（白い丸みの塊を重ねる。奥から手前へ）
  const puffs: [number, number, number, number][] = [
    [0.8, 0.75, 0.35, 0.42], [1.5, 0.7, 0.45, 0.48], [2.2, 0.8, 0.38, 0.42],
    [1.05, 1.25, 0.42, 0.45], [1.85, 1.3, 0.44, 0.46], [1.45, 1.05, 0.5, 0.58],
    [0.65, 1.45, 0.3, 0.36], [2.35, 1.45, 0.3, 0.36],
  ];
  puffs.forEach(([x, y, r, zr], i) => {
    const light = i % 3 === 0 ? city.lineWhite : mix(city.lineWhite, domain.cloud, 0.12);
    parts.push(part([
      { kind: 'blob', center: [x, y, h + zr * 0.45], r, squash: 0.62, color: shade(light, 0.86) },
      { kind: 'blob', center: [x - r * 0.15, y - r * 0.1, h + zr * 0.6], r: r * 0.72, squash: 0.62, color: light },
    ], [x - r, y - r, h], [x + r, y + r, h + zr]));
  });
  // 地上の空調と、横の小さな機械室
  const mech = { x0: 2.7, y0: 0.5, x1: 2.92, y1: 1.2 };
  parts.push(box({ ...mech, z0: 0, z1: 0.25, wall: mix(city.wallStone, city.curb, 0.2) }));
  parts.push(rooftopUnit(2.72, 0.6, 0.25, 0.9));
  parts.push(signBoard(b, '+y', 0.15, 0.85, h - 0.18, h - 0.08, mix(domain.cloud, NAVY, 0.25)));
  // 前庭: ベンチ・木・街灯
  parts.push(...bench(0.75, 2.3, 'x'));
  parts.push(...bench(2.05, 2.3, 'x'));
  for (const [x, y, v] of [[0.3, 2.6, 1], [2.7, 2.6, 2], [0.2, 0.3, 0], [2.85, 1.9, 1]] as [number, number, number][]) parts.push(broadleafTree(x, y, 0.8, v));
  parts.push(...streetLamp(1.2, 2.85, '+x'));
  parts.push(...streetLamp(1.8, 2.85, '-x'));
  return { w: 3, d: 3, ground, parts, shadowHeight: 1.0 };
}

/* ---------- 研究施設: ドーム屋根の研究所 ---------- */

export function research(): Model {
  const wall = mix(city.wallStone, city.lineWhite, 0.5);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 3, 3, mix(city.paving, city.sand, 0.35)),
    groundEllipse(1.15, 1.25, 0.95, 0.95, mix(city.paving, city.lineWhite, 0.3), 28),
    pad(1.0, 2.1, 1.3, 3, mix(city.paving, city.lineWhite, 0.25)),
    groundPoly([[2.1, 2.1], [2.9, 2.1], [2.9, 2.9], [2.1, 2.9]], city.grass),
  ];
  // 円い本館（多角柱）と、ドームの屋根
  const cx = 1.15;
  const cy = 1.2;
  const r = 0.72;
  const h = 0.55;
  parts.push(prism(cx, cy, r, 0, h, wall, mix(city.paving, city.lineWhite, 0.3), 20));
  // 壁の窓（多角柱の面ごとに縦長の窓。見えない面の窓は描く時に省かれる）
  const winShapes: Poly[] = [];
  for (let i = 0; i < 20; i += 1) {
    const a0 = ((i + 0.3) / 20) * Math.PI * 2;
    const a1 = ((i + 0.7) / 20) * Math.PI * 2;
    const lit = noiseOf(131)(i, 0, 0) < 0.45;
    const rr = r + 0.005;
    winShapes.push({ kind: 'poly', pts: [[cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, 0.12], [cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr, 0.12], [cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr, 0.42], [cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, 0.42]], color: lit ? city.windowLit : mix(city.wallGlass, city.lineWhite, 0.15), lit, layer: 1 });
  }
  parts.push(part(winShapes, [cx - r, cy - r, 0.12], [cx + r, cy + r, 0.42]));
  parts.push(prism(cx, cy, r + 0.04, h, h + 0.05, mix(domain.lab, wall, 0.45), undefined, 20));
  parts.push(dome(cx, cy, r * 0.82, h + 0.05, mix(city.lineWhite, city.wallGlass, 0.25), 20, 6));
  // 観測の細い窓（ドームの割れ目）
  parts.push(part([
    { kind: 'poly', pts: [[cx + 0.06, cy + r * 0.8, h + 0.08], [cx - 0.06, cy + r * 0.8, h + 0.08], [cx - 0.05, cy + 0.2, h + 0.05 + r * 0.78], [cx + 0.05, cy + 0.2, h + 0.05 + r * 0.78]], color: shade(NAVY, 1.6), layer: 2, double: true },
  ], [cx - 0.06, cy + 0.2, h], [cx + 0.06, cy + r, h + r]));
  // 実験棟（四角い低い棟）と、つなぐ廊下
  const lab = { x0: 2.0, y0: 0.35, x1: 2.85, y1: 1.6 };
  parts.push(box({ ...lab, z0: 0, z1: 0.32, wall: mix(wall, city.wallStone, 0.3) }, windows(lab, { floor: 0.28, floors: 1, base: 0.03, width: 0.1, pitch: 0.2, height: 0.55, litRatio: 0.45, noise: noiseOf(132), frame: shade(city.wallStone, 0.6) })));
  parts.push(...parapet(lab.x0, lab.y0, lab.x1, lab.y1, 0.32, 0.03, shade(wall, 0.9)));
  parts.push(box({ x0: 1.85, y0: 0.95, z0: 0, x1: 2.0, y1: 1.2, z1: 0.26, wall: mix(city.wallGlass, city.windowLit, 0.25) }));
  parts.push(rooftopUnit(2.15, 0.5, 0.32, 1));
  parts.push(...dish(2.55, 0.6, 0.32, 0.1));
  // 入口（張り出した玄関）
  parts.push(box({ x0: 0.95, y0: 1.85, z0: 0, x1: 1.35, y1: 2.08, z1: 0.26, wall: mix(wall, city.wallStone, 0.15) }));
  parts.push(...door({ x0: 0.95, y0: 1.85, x1: 1.35, y1: 2.08 }, '+y', 0.1, 0.2, 0.2, mix(NAVY, city.wallGlass, 0.4), domain.lab));
  parts.push(signBoard({ x0: 0.95, y0: 1.85, x1: 1.35, y1: 2.08 }, '+x', 0.03, 0.2, 0.08, 0.2, domain.lab));
  // 庭の木・ベンチ・街灯
  for (const [x, y, v] of [[2.35, 2.4, 0], [2.7, 2.7, 2], [0.25, 2.5, 1], [0.2, 0.25, 0]] as [number, number, number][]) parts.push(broadleafTree(x, y, 0.85, v));
  parts.push(conifer(2.75, 2.2, 0.6));
  parts.push(...bench(1.55, 2.4, 'x'));
  parts.push(hedge(0.15, 2.85, 0.9, 2.92));
  parts.push(...streetLamp(1.5, 2.85, '-x'));
  return { w: 3, d: 3, ground, parts, shadowHeight: 1.0 };
}
