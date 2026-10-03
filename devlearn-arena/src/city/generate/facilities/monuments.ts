import { city, mix, shade } from '@/ui/tokens';
import { bench, groundEllipse } from '../facilityKit';
import type { Model, Part, Poly, Shape, V3 } from '../mesh';
import { box, frustum, groundPoly, hedge, pad, part, prism, pyramidRoof, rod, streetLamp } from '../shapes';

/**
 * 記念碑の模型（ミッションの報酬。docs/city-design.md 4 章・docs/visual-design.md 6.1「記念碑 各 3 種以上の変化」）。
 * どれも 1×1 マス。石畳の敷地・2 段の台座と銘板・像・植え込み・街灯を持つ（細部 3 つ以上と周辺環境。docs/city-design.md 7 章）。
 * 入口（銘板の向き）は +y。
 */

const STONE = mix(city.wallStone, city.lineWhite, 0.3);
const STONE_DARK = mix(city.wallStone, city.curb, 0.35);
const BRONZE = mix(city.roofTile, city.sand, 0.35);
const BRONZE_DARK = shade(BRONZE, 0.75);
const GOLD = mix(city.windowLit, city.roofTile, 0.25);

/** 共通の敷地: 石畳と円い縁石・2 段の台座・正面の銘板・奥の植え込み・花・街灯・ベンチ */
function site(variant: number, plinth = 0.24): { ground: Poly[]; parts: Part[]; top: number } {
  const ground: Poly[] = [
    pad(0, 0, 1, 1, mix(city.paving, city.sand, 0.45)),
    groundEllipse(0.5, 0.48, 0.42, 0.42, mix(city.paving, city.lineWhite, 0.3), 24),
    groundEllipse(0.5, 0.48, 0.36, 0.36, mix(city.paving, city.sand, 0.25), 24),
    // 正面へ伸びる石の道
    groundPoly([[0.42, 0.8], [0.58, 0.8], [0.6, 1], [0.4, 1]], mix(city.paving, city.lineWhite, 0.4)),
  ];
  const r = plinth;
  const parts: Part[] = [
    box({ x0: 0.5 - r, y0: 0.48 - r, z0: 0, x1: 0.5 + r, y1: 0.48 + r, z1: 0.05, wall: STONE_DARK, top: STONE }),
    box({ x0: 0.5 - r + 0.05, y0: 0.48 - r + 0.05, z0: 0.05, x1: 0.5 + r - 0.05, y1: 0.48 + r - 0.05, z1: 0.12, wall: STONE, top: mix(STONE, city.lineWhite, 0.2) }),
    // 正面の銘板（金の文字の板）
    part([
      { kind: 'poly', pts: [[0.43, 0.48 + r - 0.045, 0.065], [0.57, 0.48 + r - 0.045, 0.065], [0.57, 0.48 + r - 0.045, 0.11], [0.43, 0.48 + r - 0.045, 0.11]] as V3[], color: BRONZE_DARK, layer: 2 },
      { kind: 'poly', pts: [[0.45, 0.48 + r - 0.04, 0.078], [0.55, 0.48 + r - 0.04, 0.078], [0.55, 0.48 + r - 0.04, 0.084], [0.45, 0.48 + r - 0.04, 0.084]] as V3[], color: GOLD, layer: 3 },
      { kind: 'poly', pts: [[0.46, 0.48 + r - 0.04, 0.092], [0.54, 0.48 + r - 0.04, 0.092], [0.54, 0.48 + r - 0.04, 0.097], [0.46, 0.48 + r - 0.04, 0.097]] as V3[], color: GOLD, layer: 3 },
    ], [0.43, 0.48 + r - 0.05, 0.06], [0.57, 0.48 + r - 0.03, 0.11]),
    hedge(0.04, 0.04, 0.34, 0.09),
    hedge(0.66, 0.04, 0.96, 0.09),
    hedge(0.04, 0.12, 0.09, 0.4),
    ...streetLamp(0.92, 0.16, '-x'),
    ...bench(0.08, 0.84, 'x'),
  ];
  // 台座の脇の花（記念碑ごとに色をずらす）
  const flowers = [mix(city.roofTile, city.lineWhite, 0.35), mix(city.windowLit, city.lineWhite, 0.2), mix(city.wallGlass, city.lineWhite, 0.4)];
  const blooms: Shape[] = [];
  for (let i = 0; i < 5; i += 1) {
    blooms.push({ kind: 'blob', center: [0.2 + i * 0.03, 0.78 + (i % 2) * 0.03, 0.04], r: 0.022, color: flowers[(i + variant) % 3] as string, layer: 1 });
    blooms.push({ kind: 'blob', center: [0.68 + i * 0.03, 0.76 + (i % 2) * 0.03, 0.04], r: 0.022, color: flowers[(i + variant + 1) % 3] as string, layer: 1 });
  }
  parts.push(box({ x0: 0.18, y0: 0.74, z0: 0, x1: 0.34, y1: 0.84, z1: 0.025, wall: STONE_DARK, top: city.grassDark }));
  parts.push(box({ x0: 0.66, y0: 0.72, z0: 0, x1: 0.82, y1: 0.82, z1: 0.025, wall: STONE_DARK, top: city.grassDark }));
  parts.push(part(blooms, [0.18, 0.74, 0.02], [0.82, 0.84, 0.07]));
  return { ground, parts, top: 0.12 };
}

/** 灯台の記念碑（Web サーバを構築せよ）: 白と赤の帯の塔・回廊・灯室・屋根 */
function beacon(): Model {
  const s = site(0);
  const z = s.top;
  const white = mix(city.lineWhite, city.wallStone, 0.15);
  const red = mix(city.roofTile, city.windowLit, 0.1);
  const parts = [...s.parts];
  const bands: [number, number, number, number, string][] = [
    [0.13, 0.115, z, z + 0.14, white], [0.115, 0.1, z + 0.14, z + 0.22, red], [0.1, 0.09, z + 0.22, z + 0.36, white], [0.09, 0.08, z + 0.36, z + 0.44, red],
  ];
  for (const [r0, r1, z0, z1, c] of bands) parts.push(frustumRound(0.5, 0.48, r0, r1, z0, z1, c));
  // 回廊（張り出した床と手すり）
  parts.push(prism(0.5, 0.48, 0.12, z + 0.44, z + 0.46, STONE_DARK, STONE, 12));
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const x = 0.5 + Math.cos(a) * 0.115;
    const y = 0.48 + Math.sin(a) * 0.115;
    parts.push(rod([x, y, z + 0.46], [x, y, z + 0.5], 0.008, STONE_DARK, 1));
  }
  // 灯室（ガラスと灯り）と屋根
  parts.push(prism(0.5, 0.48, 0.07, z + 0.46, z + 0.56, mix(city.wallGlass, city.windowLit, 0.45), undefined, 10));
  parts.push(part([{ kind: 'blob', center: [0.5, 0.48, z + 0.51], r: 0.05, squash: 0.9, color: city.windowLit, lit: true }], [0.45, 0.43, z + 0.47], [0.55, 0.53, z + 0.56]));
  parts.push(prism(0.5, 0.48, 0.085, z + 0.56, z + 0.58, red, red, 10));
  parts.push(frustumRound(0.5, 0.48, 0.08, 0.01, z + 0.58, z + 0.66, red));
  parts.push(rod([0.5, 0.48, z + 0.66], [0.5, 0.48, z + 0.72], 0.01, STONE_DARK));
  // 塔の入口
  parts.push(part([{ kind: 'poly', pts: [[0.47, 0.48 + 0.12, z], [0.53, 0.48 + 0.12, z], [0.53, 0.48 + 0.115, z + 0.08], [0.47, 0.48 + 0.115, z + 0.08]] as V3[], color: BRONZE_DARK, layer: 2 }], [0.47, 0.59, z], [0.53, 0.6, z + 0.08]));
  return { w: 1, d: 1, ground: s.ground, parts, shadowHeight: 0.8 };
}

/** 鍵の門（HTTPS を有効にせよ）: 石の門と、つながった 3 つの金の輪（証明書の連鎖） */
function keystone(): Model {
  const s = site(1, 0.3);
  const z = s.top;
  const parts = [...s.parts];
  // 門の柱と梁と要石
  parts.push(box({ x0: 0.24, y0: 0.42, z0: z, x1: 0.32, y1: 0.54, z1: z + 0.5, wall: STONE, top: mix(STONE, city.lineWhite, 0.2) }));
  parts.push(box({ x0: 0.68, y0: 0.42, z0: z, x1: 0.76, y1: 0.54, z1: z + 0.5, wall: STONE, top: mix(STONE, city.lineWhite, 0.2) }));
  parts.push(box({ x0: 0.2, y0: 0.4, z0: z + 0.5, x1: 0.8, y1: 0.56, z1: z + 0.58, wall: STONE_DARK, top: STONE }));
  parts.push(box({ x0: 0.45, y0: 0.39, z0: z + 0.5, x1: 0.55, y1: 0.57, z1: z + 0.62, wall: BRONZE, top: GOLD }));
  // 柱の飾りの帯
  for (const x0 of [0.24, 0.68]) parts.push(box({ x0: x0 - 0.01, y0: 0.41, z0: z + 0.42, x1: x0 + 0.09, y1: 0.55, z1: z + 0.45, wall: STONE_DARK }));
  // 3 つの輪（梁の正面から吊った縦の輪。真ん中の輪は向きを変えて、つながって見えるように）
  const ry = 0.6;
  const rz = z + 0.32;
  parts.push(box({ x0: 0.3, y0: 0.56, z0: z + 0.5, x1: 0.7, y1: 0.62, z1: z + 0.53, wall: STONE_DARK, top: STONE }));
  parts.push(...ring(0.37, ry, rz, 0.07, 'x', GOLD, 16, 0.024));
  parts.push(...ring(0.5, ry, rz, 0.07, 'y', mix(GOLD, city.lineWhite, 0.3), 16, 0.024));
  parts.push(...ring(0.63, ry, rz, 0.07, 'x', GOLD, 16, 0.024));
  for (const x of [0.37, 0.5, 0.63]) parts.push(rod([x, ry, rz + 0.07], [x, ry, z + 0.5], 0.008, BRONZE_DARK, 1));
  return { w: 1, d: 1, ground: s.ground, parts, shadowHeight: 0.75 };
}

/** 枝分かれの樹（Git で変更を管理せよ）: 1 本の幹が 2 本に分かれ、上でまた 1 本に合わさる青銅の樹 */
function branchTree(): Model {
  const s = site(2);
  const z = s.top;
  const parts = [...s.parts];
  const t = 0.028;
  const base: V3 = [0.5, 0.48, z];
  const fork: V3 = [0.5, 0.48, z + 0.18];
  const left: V3 = [0.38, 0.48, z + 0.34];
  const right: V3 = [0.62, 0.5, z + 0.3];
  const join: V3 = [0.5, 0.48, z + 0.5];
  parts.push(rod(base, fork, t * 1.3, BRONZE_DARK));
  parts.push(rod(fork, left, t, BRONZE));
  parts.push(rod(fork, right, t, BRONZE));
  parts.push(rod(left, join, t, BRONZE));
  parts.push(rod(right, join, t, BRONZE));
  parts.push(rod(join, [0.5, 0.48, z + 0.6], t, BRONZE_DARK));
  // 枝の節（コミット）を金の玉で
  const knots: Shape[] = [fork, left, right, join, [0.5, 0.48, z + 0.6] as V3].map((c) => ({ kind: 'blob', center: c, r: 0.03, color: GOLD }));
  // 青銅の葉
  const leaves: Shape[] = [];
  for (const [x, y, zz, r] of [[0.34, 0.46, 0.4, 0.06], [0.42, 0.5, 0.46, 0.05], [0.64, 0.5, 0.36, 0.06], [0.57, 0.45, 0.44, 0.05], [0.5, 0.48, 0.66, 0.07]] as [number, number, number, number][]) {
    leaves.push({ kind: 'blob', center: [x, y, z + zz], r, color: mix(BRONZE, city.tree2, 0.45) });
  }
  parts.push(part([...leaves, ...knots], [0.28, 0.4, z], [0.72, 0.56, z + 0.74]));
  return { w: 1, d: 1, ground: s.ground, parts, shadowHeight: 0.75 };
}

/** 積み荷の塔（コンテナを起動せよ）: 色の違うコンテナを互い違いに積み、上に小さなクレーンの腕 */
function crane(): Model {
  const s = site(0, 0.28);
  const z = s.top;
  const parts = [...s.parts];
  const colors = [mix(city.roofTile, city.sand, 0.15), mix(city.wallGlass, city.water, 0.4), mix(city.windowLit, city.roofTile, 0.45), mix(city.tree3, city.wallGlass, 0.3)];
  const boxes: [number, number, number, number, number][] = [
    [0.3, 0.4, 0.7, 0.56, 0], [0.34, 0.38, 0.62, 0.58, 1], [0.38, 0.4, 0.74, 0.56, 2], [0.36, 0.38, 0.6, 0.58, 3],
  ];
  const h = 0.11;
  boxes.forEach(([x0, y0, x1, y1, c], i) => {
    const color = colors[c] as string;
    const z0 = z + i * h;
    parts.push(box({ x0, y0, z0, x1, y1, z1: z0 + h - 0.006, wall: color, top: mix(color, city.lineWhite, 0.15) }));
    // 波板の筋と扉の取っ手（正面 +y と右 +x の面）
    const ribs: Shape[] = [];
    for (let k = 1; k < 8; k += 1) {
      const x = x0 + ((x1 - x0) * k) / 8;
      ribs.push({ kind: 'poly', pts: [[x - 0.004, y1 + 0.003, z0 + 0.01], [x + 0.004, y1 + 0.003, z0 + 0.01], [x + 0.004, y1 + 0.003, z0 + h - 0.016], [x - 0.004, y1 + 0.003, z0 + h - 0.016]], color: shade(color, 0.7), layer: 2 });
    }
    ribs.push({ kind: 'poly', pts: [[x1 + 0.003, y0 + 0.03, z0 + 0.02], [x1 + 0.003, y0 + 0.04, z0 + 0.02], [x1 + 0.003, y0 + 0.04, z0 + h - 0.02], [x1 + 0.003, y0 + 0.03, z0 + h - 0.02]], color: city.lineWhite, layer: 2 });
    parts.push(part(ribs, [x0, y0, z0], [x1 + 0.004, y1 + 0.004, z0 + h]));
  });
  const top = z + boxes.length * h;
  // クレーンの柱と腕と吊った鉤
  parts.push(rod([0.4, 0.46, top], [0.4, 0.46, top + 0.26], 0.03, GOLD));
  parts.push(rod([0.4, 0.46, top + 0.26], [0.72, 0.46, top + 0.24], 0.022, GOLD));
  parts.push(rod([0.4, 0.46, top + 0.26], [0.3, 0.46, top + 0.22], 0.022, GOLD));
  parts.push(box({ x0: 0.26, y0: 0.42, z0: top + 0.16, x1: 0.33, y1: 0.5, z1: top + 0.22, wall: STONE_DARK }));
  parts.push(rod([0.68, 0.46, top + 0.24], [0.68, 0.46, top + 0.12], 0.006, city.curb, 1));
  parts.push(box({ x0: 0.66, y0: 0.44, z0: top + 0.1, x1: 0.7, y1: 0.48, z1: top + 0.12, wall: BRONZE_DARK }));
  return { w: 1, d: 1, ground: s.ground, parts, shadowHeight: 0.85 };
}

/** 舵輪の碑（Kubernetes 上でアプリを動かせ）: 台の上に立てた 8 本の取っ手の舵輪 */
function helm(): Model {
  const s = site(1);
  const z = s.top;
  const parts = [...s.parts];
  // 舵輪を支える台
  parts.push(frustum(0.5, 0.48, 0.09, 0.06, z, z + 0.2, STONE, mix(STONE, city.lineWhite, 0.2)));
  const cz = z + 0.42;
  const r = 0.17;
  parts.push(...ring(0.5, 0.48, cz, r, 'y', BRONZE, 20, 0.026));
  parts.push(...ring(0.5, 0.48, cz, r * 0.35, 'y', BRONZE_DARK, 12, 0.02));
  // 8 本の輻と、外へ伸びる取っ手
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    parts.push(rod([0.5 + c * r * 0.35, 0.48, cz + sn * r * 0.35], [0.5 + c * r, 0.48, cz + sn * r], 0.016, BRONZE));
    parts.push(rod([0.5 + c * r, 0.48, cz + sn * r], [0.5 + c * (r + 0.07), 0.48, cz + sn * (r + 0.07)], 0.024, GOLD));
  }
  parts.push(part([{ kind: 'blob', center: [0.5, 0.49, cz], r: 0.035, color: GOLD }], [0.46, 0.45, cz - 0.04], [0.54, 0.52, cz + 0.04]));
  return { w: 1, d: 1, ground: s.ground, parts, shadowHeight: 0.7 };
}

/** 火の見の鐘（障害原因を特定せよ）: 4 本脚の櫓・はしご・屋根・吊った鐘 */
function bell(): Model {
  const s = site(2, 0.26);
  const z = s.top;
  const parts = [...s.parts];
  const wood = mix(city.roofTile, city.groundSide, 0.45);
  const legs: [number, number, number, number][] = [[0.32, 0.32, 0.42, 0.4], [0.68, 0.32, 0.58, 0.4], [0.32, 0.64, 0.42, 0.56], [0.68, 0.64, 0.58, 0.56]];
  const top = z + 0.5;
  for (const [x0, y0, x1, y1] of legs) parts.push(rod([x0, y0, z], [x1, y1, top], 0.03, wood));
  // 筋交いと見張りの床
  parts.push(rod([0.32, 0.64, z + 0.05], [0.58, 0.56, top - 0.1], 0.014, wood, 1));
  parts.push(rod([0.68, 0.64, z + 0.05], [0.42, 0.56, top - 0.1], 0.014, wood, 1));
  parts.push(box({ x0: 0.38, y0: 0.36, z0: top, x1: 0.62, y1: 0.6, z1: top + 0.025, wall: shade(wood, 0.85), top: wood }));
  // 手すり
  for (const [a, b] of [[[0.38, 0.6], [0.62, 0.6]], [[0.62, 0.36], [0.62, 0.6]]] as [[number, number], [number, number]][]) {
    parts.push(rod([a[0], a[1], top + 0.08], [b[0], b[1], top + 0.08], 0.01, wood, 1));
  }
  // 屋根と鐘
  parts.push(pyramidRoof(0.4, 0.38, 0.6, 0.58, top + 0.16, 0.12, mix(city.roofTile, city.curb, 0.2), 0.05));
  for (const [x, y] of [[0.4, 0.38], [0.6, 0.38], [0.4, 0.58], [0.6, 0.58]] as [number, number][]) parts.push(rod([x, y, top + 0.025], [x, y, top + 0.16], 0.012, wood, 1));
  parts.push(rod([0.5, 0.48, top + 0.16], [0.5, 0.48, top + 0.13], 0.008, city.curb, 1));
  parts.push(frustumRound(0.5, 0.48, 0.055, 0.03, top + 0.04, top + 0.13, GOLD));
  parts.push(part([{ kind: 'blob', center: [0.5, 0.48, top + 0.035], r: 0.015, color: BRONZE_DARK }], [0.48, 0.46, top + 0.02], [0.52, 0.5, top + 0.05]));
  // はしご（正面の脚に沿って）
  parts.push(rod([0.45, 0.66, z], [0.47, 0.6, top], 0.01, wood, 1));
  parts.push(rod([0.55, 0.66, z], [0.53, 0.6, top], 0.01, wood, 1));
  for (let i = 1; i < 6; i += 1) {
    const t = i / 6;
    const y = 0.66 - 0.06 * t;
    parts.push(rod([0.45 + 0.02 * t, y, z + (top - z) * t], [0.55 - 0.02 * t, y, z + (top - z) * t], 0.008, wood, 1));
  }
  return { w: 1, d: 1, ground: s.ground, parts, shadowHeight: 0.85 };
}

/* ---------- 部品 ---------- */

/** 丸い角錐台（円柱の近似を、上と下で半径を変えて） */
function frustumRound(cx: number, cy: number, r0: number, r1: number, z0: number, z1: number, color: string, sides = 12): Part {
  const shapes: Shape[] = [];
  const at = (r: number, z: number, i: number): V3 => {
    const a = (i / sides) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
  };
  for (let i = 0; i < sides; i += 1) shapes.push({ kind: 'poly', pts: [at(r0, z0, i), at(r0, z0, i + 1), at(r1, z1, i + 1), at(r1, z1, i)], color });
  if (r1 > 0) shapes.push({ kind: 'poly', pts: Array.from({ length: sides }, (_, i) => at(r1, z1, i)), color: mix(color, city.lineWhite, 0.15) });
  return part(shapes, [cx - r0, cy - r0, z0], [cx + r0, cy + r0, z1]);
}

/**
 * 縦に立てた輪（棒をつないだ多角形）。plane は輪の面に沿う軸（x なら x-z 面、y なら y-z 面）。
 * 細い棒は 1 つの部品に 1 面しか描かないので（src/city/generate/mesh.ts）、棒ごとに部品を分ける
 */
function ring(cx: number, cy: number, cz: number, r: number, plane: 'x' | 'y', color: string, n = 14, t = 0.016): Part[] {
  const pts: V3[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const u = Math.cos(a) * r;
    const v = Math.sin(a) * r;
    pts.push(plane === 'x' ? [cx + u, cy, cz + v] : [cx, cy + u, cz + v]);
  }
  return pts.map((p, i) => rod(p, pts[(i + 1) % n] as V3, t, color));
}

/** 記念碑の ID → 模型（content/facilities.json の landmarks と同じ ID） */
const MONUMENTS: Record<string, () => Model> = {
  beacon,
  keystone,
  'branch-tree': branchTree,
  crane,
  helm,
  bell,
};

export const MONUMENT_IDS = Object.keys(MONUMENTS);

export function monumentModel(id: string): Model | null {
  return MONUMENTS[id]?.() ?? null;
}
