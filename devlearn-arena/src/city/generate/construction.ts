import { city, hud, mix, rgbaOf, shade, state } from '@/ui/tokens';
import { hash01 } from '../random';
import type { Model, Part, Poly } from './mesh';
import { box, pad, rod } from './shapes';

/**
 * 建設中の姿（docs/city-design.md 6 章: 建設は 3 段階で見せる。基礎 → 骨組み → 完成）。
 * 敷地の大きさ w×d と、建ち上がる高さ h から、手続き的に作る。正面は +y。
 */

const DIRT = mix(city.sand, city.groundSide, 0.45);
const CONCRETE = mix(city.wallStone, city.curb, 0.35);
const STEEL = mix(city.curb, rgbaOf(hud.bg, 1), 0.25);
const WOOD = mix(city.roofTile, city.sand, 0.55);
const BARRIER = state.warn;
const REBAR = mix(city.roofTile, city.groundSide, 0.4);

/** 工事の囲い（黄の板と柱）。入口の側（+y）は中ほどを空ける */
function barrier(w: number, d: number): Part[] {
  const out: Part[] = [];
  const z = 0.1;
  const inset = 0.04;
  const sides: [number, number, number, number][] = [
    [inset, inset, w - inset, inset],
    [w - inset, inset, w - inset, d - inset],
    [inset, inset, inset, d - inset],
    [inset, d - inset, w * 0.38, d - inset],
    [w * 0.62, d - inset, w - inset, d - inset],
  ];
  for (const [x0, y0, x1, y1] of sides) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / 0.25));
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      out.push(rod([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0], [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z], 0.016, shade(city.curb, 0.8)));
    }
    // 板（細い縞）
    out.push(rod([x0, y0, z * 0.75], [x1, y1, z * 0.75], 0.03, BARRIER));
    out.push(rod([x0, y0, z * 0.35], [x1, y1, z * 0.35], 0.022, shade(BARRIER, 0.85)));
  }
  return out;
}

/** 資材の山（積んだ板と鉄筋の束） */
function materials(x: number, y: number, s: number): Part[] {
  return [
    box({ x0: x, y0: y, z0: 0, x1: x + 0.22 * s, y1: y + 0.12 * s, z1: 0.03, wall: WOOD }),
    box({ x0: x + 0.01, y0: y + 0.01, z0: 0.03, x1: x + 0.2 * s, y1: y + 0.11 * s, z1: 0.06, wall: shade(WOOD, 0.9) }),
    rod([x, y + 0.16 * s, 0.015], [x + 0.24 * s, y + 0.16 * s, 0.015], 0.02, REBAR),
    rod([x, y + 0.19 * s, 0.015], [x + 0.24 * s, y + 0.19 * s, 0.015], 0.02, REBAR),
  ];
}

/** 現場の詰所（小さな箱と窓） */
function siteHut(x: number, y: number): Part {
  const b = { x0: x, y0: y, x1: x + 0.2, y1: y + 0.12 };
  return box({ ...b, z0: 0, z1: 0.1, wall: mix(city.lineWhite, city.wallGlass, 0.3), top: mix(city.curb, city.lineWhite, 0.3) }, [
    { kind: 'poly', pts: [[b.x1 - 0.03, b.y1 + 0.005, 0.04], [b.x1 - 0.1, b.y1 + 0.005, 0.04], [b.x1 - 0.1, b.y1 + 0.005, 0.08], [b.x1 - 0.03, b.y1 + 0.005, 0.08]], color: city.wallGlass, layer: 1 },
  ]);
}

function slab(w: number, d: number, z1: number): Part {
  return box({ x0: 0.14, y0: 0.14, z0: 0, x1: w - 0.14, y1: d - 0.14, z1, wall: CONCRETE, top: mix(CONCRETE, city.lineWhite, 0.15) });
}

/** 基礎: 掘った地面・型枠・鉄筋・資材・囲い */
export function foundationModel(w: number, d: number, seed: number): Model {
  const parts: Part[] = [];
  parts.push(slab(w, d, 0.035));
  // 型枠（縁の木の板）
  parts.push(box({ x0: 0.12, y0: 0.12, z0: 0, x1: w - 0.12, y1: 0.16, z1: 0.06, wall: WOOD }));
  parts.push(box({ x0: 0.12, y0: 0.16, z0: 0, x1: 0.16, y1: d - 0.12, z1: 0.06, wall: WOOD }));
  // 立ち上がる鉄筋
  const step = 0.22;
  for (let x = 0.24; x < w - 0.2; x += step) {
    for (let y = 0.24; y < d - 0.2; y += step) {
      if (hash01(seed, x * 10, y * 10) < 0.35) continue;
      parts.push(rod([x, y, 0.03], [x, y, 0.12], 0.012, REBAR));
    }
  }
  parts.push(...materials(w - 0.42, d - 0.36, 1));
  parts.push(siteHut(0.08, d - 0.3));
  parts.push(...barrier(w, d));
  const ground: Poly[] = [pad(0.04, 0.04, w - 0.04, d - 0.04, DIRT), pad(w * 0.38, d - 0.2, w * 0.62, d, mix(DIRT, city.paving, 0.5))];
  return { w, d, ground, parts, shadowHeight: 0.08 };
}

/** 骨組み: 鉄骨の柱と梁・床・足場・（大きな敷地は）クレーン */
export function frameModel(w: number, d: number, height: number, seed: number): Model {
  const parts: Part[] = [];
  parts.push(slab(w, d, 0.04));
  const x0 = 0.2;
  const y0 = 0.2;
  const x1 = w - 0.2;
  const y1 = d - 0.24;
  const h = Math.max(0.3, height * 0.85);
  const floor = 0.26;
  const floors = Math.max(1, Math.round(h / floor));
  const nx = Math.max(2, Math.round((x1 - x0) / 0.3) + 1);
  const ny = Math.max(2, Math.round((y1 - y0) / 0.3) + 1);
  const xs = Array.from({ length: nx }, (_, i) => x0 + ((x1 - x0) * i) / (nx - 1));
  const ys = Array.from({ length: ny }, (_, i) => y0 + ((y1 - y0) * i) / (ny - 1));
  // 柱（外周だけ）
  for (const x of xs) for (const y of ys) {
    if (x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
    parts.push(rod([x, y, 0.04], [x, y, h], 0.03, STEEL));
  }
  // 梁と、途中まで打った床
  for (let f = 1; f <= floors; f += 1) {
    const z = Math.min(h, 0.04 + f * floor);
    parts.push(rod([x0, y0, z], [x1, y0, z], 0.026, STEEL));
    parts.push(rod([x0, y1, z], [x1, y1, z], 0.026, STEEL));
    parts.push(rod([x0, y0, z], [x0, y1, z], 0.026, STEEL));
    parts.push(rod([x1, y0, z], [x1, y1, z], 0.026, STEEL));
    if (f < floors) parts.push(box({ x0, y0, z0: z - 0.02, x1, y1, z1: z, wall: CONCRETE }));
  }
  // 正面の足場（細い管と、作業床の板）
  const sy = y1 + 0.08;
  for (const x of xs) parts.push(rod([x, sy, 0], [x, sy, h + 0.05], 0.012, mix(city.lineWhite, city.curb, 0.4)));
  for (let f = 1; f <= floors; f += 1) {
    const z = Math.min(h, f * floor);
    parts.push(box({ x0: x0 - 0.02, y0: sy - 0.03, z0: z - 0.012, x1: x1 + 0.02, y1: sy + 0.05, z1: z, wall: WOOD }));
  }
  parts.push(...materials(w - 0.42, 0.04, 0.9));
  parts.push(...barrier(w, d));
  // 大きな敷地はクレーン（柱と腕と、吊った荷）
  if (w * d >= 4) {
    const cx = x0 - 0.06 + (hash01(seed, 7) < 0.5 ? 0 : x1 - x0 + 0.12);
    const cy = y0 + 0.1;
    const top = h + 0.9;
    parts.push(rod([cx, cy, 0], [cx, cy, top], 0.05, BARRIER));
    parts.push(rod([cx, cy, top], [cx + (cx < w / 2 ? 1 : -1) * Math.min(1.6, w * 0.7), cy + 0.3, top], 0.035, BARRIER));
    parts.push(rod([cx, cy, top], [cx - (cx < w / 2 ? 1 : -1) * 0.35, cy - 0.08, top], 0.035, BARRIER));
    parts.push(box({ x0: cx - (cx < w / 2 ? 0.45 : -0.3), y0: cy - 0.12, z0: top - 0.08, x1: cx - (cx < w / 2 ? 0.3 : -0.45), y1: cy - 0.02, z1: top, wall: CONCRETE }));
    const hx = cx + (cx < w / 2 ? 1 : -1) * Math.min(1.1, w * 0.5);
    parts.push(rod([hx, cy + 0.2, top], [hx, cy + 0.2, h + 0.25], 0.008, STEEL));
    parts.push(box({ x0: hx - 0.08, y0: cy + 0.15, z0: h + 0.18, x1: hx + 0.08, y1: cy + 0.25, z1: h + 0.25, wall: WOOD }));
  } else {
    parts.push(siteHut(0.08, d - 0.3));
  }
  const ground: Poly[] = [pad(0.04, 0.04, w - 0.04, d - 0.04, DIRT), pad(w * 0.38, d - 0.2, w * 0.62, d, mix(DIRT, city.paving, 0.5))];
  return { w, d, ground, parts, shadowHeight: h * 0.6 };
}
