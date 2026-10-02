import { city, mix, shade } from '@/ui/tokens';
import { bench, groundEllipse, lowWall } from '../facilityKit';
import type { Model, Part, Poly } from '../mesh';
import { box, broadleafTree, conifer, groundPoly, hedge, pad, part, prism, streetLamp } from '../shapes';

/**
 * 公園の類の模型（docs/city-design.md 4 章: 公園・広場・並木・噴水も置ける）。
 */

const FLOWERS = [mix(city.roofTile, city.lineWhite, 0.35), mix(city.windowLit, city.lineWhite, 0.2), mix(city.wallGlass, city.lineWhite, 0.4)];

/** 花壇（低い縁と花の粒） */
function flowerBed(x0: number, y0: number, x1: number, y1: number, variant: number): Part {
  const shapes: Part['shapes'] = [];
  const edge = mix(city.wallStone, city.curb, 0.2);
  const b = { x0, y0, z0: 0, x1, y1, z1: 0.04, wall: edge, top: mix(city.grassDark, city.groundSide, 0.3) };
  const n = Math.max(2, Math.round((x1 - x0) / 0.07));
  const m = Math.max(1, Math.round((y1 - y0) / 0.07));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < m; j += 1) {
      shapes.push({ kind: 'blob', center: [x0 + ((i + 0.5) * (x1 - x0)) / n, y0 + ((j + 0.5) * (y1 - y0)) / m, 0.06], r: 0.025, color: FLOWERS[(i + j + variant) % FLOWERS.length] as string, layer: 1 });
    }
  }
  const p = box(b);
  return part([...p.shapes, ...shapes], [x0, y0, 0], [x1, y1, 0.09]);
}

/* ---------- 公園（2×2） ---------- */

export function park(): Model {
  const path = mix(city.sand, city.paving, 0.3);
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.grass, city.tree3, 0.15)),
    // 曲がった小道（入口の 2 辺から池の周り）
    groundPoly([[0.85, 2], [1.15, 2], [1.15, 1.55], [1.5, 1.2], [1.95, 1.2], [1.95, 0.95], [1.4, 0.95], [0.9, 1.45]], path),
    groundEllipse(0.65, 0.65, 0.45, 0.36, mix(city.sand, city.grassDark, 0.2), 24),
    groundEllipse(0.65, 0.65, 0.38, 0.29, mix(city.water, city.shallow, 0.6), 24),
    groundEllipse(0.55, 0.58, 0.12, 0.06, mix(city.shallow, city.lineWhite, 0.4), 12),
  ];
  const parts: Part[] = [];
  for (const [x, y, s, v] of [[1.55, 0.35, 0.95, 0], [1.25, 0.55, 0.8, 1], [0.25, 1.4, 0.9, 2], [0.4, 1.75, 0.75, 0], [1.75, 1.7, 0.85, 1]] as [number, number, number, number][]) {
    parts.push(broadleafTree(x, y, s, v));
  }
  parts.push(conifer(1.8, 0.65, 0.7));
  parts.push(flowerBed(1.3, 1.45, 1.6, 1.6, 0));
  parts.push(flowerBed(0.55, 1.2, 0.8, 1.32, 1));
  parts.push(...bench(1.45, 1.0, 'x'));
  parts.push(...bench(0.75, 1.62, 'y'));
  parts.push(...streetLamp(1.25, 1.85, '-x'));
  parts.push(hedge(0.05, 1.93, 0.75, 1.98));
  parts.push(hedge(1.25, 1.93, 1.95, 1.98));
  return { w: 2, d: 2, ground, parts, shadowHeight: 0 };
}

/* ---------- 並木（1×1） ---------- */

export function treerow(): Model {
  const ground: Poly[] = [
    pad(0, 0, 1, 1, mix(city.paving, city.sand, 0.4)),
    pad(0.1, 0.35, 0.9, 0.65, mix(city.grass, city.tree3, 0.2)),
  ];
  const parts: Part[] = [
    box({ x0: 0.08, y0: 0.33, z0: 0, x1: 0.92, y1: 0.36, z1: 0.04, wall: mix(city.wallStone, city.curb, 0.2) }),
    box({ x0: 0.08, y0: 0.64, z0: 0, x1: 0.92, y1: 0.67, z1: 0.04, wall: mix(city.wallStone, city.curb, 0.2) }),
    broadleafTree(0.22, 0.5, 0.85, 0),
    broadleafTree(0.5, 0.5, 0.95, 1),
    broadleafTree(0.78, 0.5, 0.85, 2),
    hedge(0.12, 0.72, 0.4, 0.78),
    hedge(0.6, 0.72, 0.88, 0.78),
    ...bench(0.42, 0.8, 'x'),
  ];
  return { w: 1, d: 1, ground, parts, shadowHeight: 0 };
}

/* ---------- 広場（2×2） ---------- */

export function plaza(): Model {
  const ground: Poly[] = [pad(0, 0, 2, 2, mix(city.paving, city.sand, 0.45))];
  // 石畳の模様（同心の四角と放射の筋）
  for (const r of [0.85, 0.6, 0.35]) {
    const c = 1;
    ground.push(groundPoly([[c - r, c - r], [c + r, c - r], [c + r, c + r], [c - r, c + r]], r === 0.6 ? mix(city.paving, city.lineWhite, 0.35) : mix(city.paving, city.sand, 0.25)));
  }
  ground.push(groundEllipse(1, 1, 0.25, 0.25, mix(city.wallStone, city.lineWhite, 0.3), 20));
  const parts: Part[] = [];
  // 中央の記念の柱（台座と柱と飾り）
  parts.push(box({ x0: 0.88, y0: 0.88, z0: 0, x1: 1.12, y1: 1.12, z1: 0.08, wall: mix(city.wallStone, city.curb, 0.2) }));
  parts.push(prism(1, 1, 0.05, 0.08, 0.62, mix(city.wallStone, city.lineWhite, 0.4), undefined, 10));
  parts.push(prism(1, 1, 0.08, 0.62, 0.66, mix(city.wallStone, city.curb, 0.1), undefined, 10));
  parts.push(part([{ kind: 'blob', center: [1, 1, 0.72], r: 0.06, color: mix(city.windowLit, city.roofTile, 0.3) }], [0.94, 0.94, 0.66], [1.06, 1.06, 0.78]));
  // 四隅の植え込みの木と、ベンチと街灯
  for (const [x, y, v] of [[0.25, 0.25, 0], [1.75, 0.25, 1], [0.25, 1.75, 2], [1.75, 1.75, 0]] as [number, number, number][]) {
    parts.push(box({ x0: x - 0.14, y0: y - 0.14, z0: 0, x1: x + 0.14, y1: y + 0.14, z1: 0.06, wall: mix(city.wallStone, city.curb, 0.2), top: city.grassDark }));
    parts.push(broadleafTree(x, y, 0.75, v));
  }
  parts.push(...bench(0.55, 0.45, 'x'), ...bench(1.3, 0.45, 'x'), ...bench(0.45, 0.85, 'y'), ...bench(1.5, 0.85, 'y'));
  parts.push(...streetLamp(0.6, 1.45, '+x'), ...streetLamp(1.4, 1.45, '-x'));
  parts.push(lowWall([0.05, 0.05], [0.7, 0.05], 0.06, mix(city.wallStone, city.curb, 0.2), 0.04));
  parts.push(lowWall([1.3, 0.05], [1.95, 0.05], 0.06, mix(city.wallStone, city.curb, 0.2), 0.04));
  return { w: 2, d: 2, ground, parts, shadowHeight: 0 };
}

/* ---------- 噴水（1×1） ---------- */

export function fountain(): Model {
  const stone = mix(city.wallStone, city.lineWhite, 0.35);
  const water = mix(city.water, city.shallow, 0.7);
  const ground: Poly[] = [
    pad(0, 0, 1, 1, mix(city.paving, city.sand, 0.4)),
    groundEllipse(0.5, 0.5, 0.46, 0.46, mix(city.paving, city.lineWhite, 0.3), 24),
  ];
  const parts: Part[] = [];
  // 外の池（低い石の縁と水面）
  parts.push(prism(0.5, 0.5, 0.36, 0, 0.08, stone, water, 20));
  // 中の 2 段の皿と、上がる水
  parts.push(prism(0.5, 0.5, 0.05, 0.08, 0.26, stone, undefined, 10));
  parts.push(prism(0.5, 0.5, 0.17, 0.26, 0.3, stone, water, 16));
  parts.push(prism(0.5, 0.5, 0.03, 0.3, 0.42, stone, undefined, 8));
  parts.push(prism(0.5, 0.5, 0.09, 0.42, 0.45, stone, water, 12));
  parts.push(part([
    { kind: 'blob', center: [0.5, 0.5, 0.52], r: 0.05, squash: 1.6, color: mix(city.shallow, city.lineWhite, 0.65) },
    { kind: 'blob', center: [0.5, 0.5, 0.33], r: 0.15, squash: 0.35, color: mix(city.shallow, city.lineWhite, 0.45), alpha: 0.8 },
  ], [0.35, 0.35, 0.3], [0.65, 0.65, 0.6]));
  // 周りの花壇の植え込みとベンチ
  parts.push(hedge(0.05, 0.05, 0.3, 0.1), hedge(0.7, 0.05, 0.95, 0.1));
  parts.push(...bench(0.06, 0.82, 'x'));
  parts.push(box({ x0: 0.86, y0: 0.86, z0: 0, x1: 0.96, y1: 0.96, z1: 0.06, wall: shade(stone, 0.9), top: city.grassDark }));
  return { w: 1, d: 1, ground, parts, shadowHeight: 0 };
}
