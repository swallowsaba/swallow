import type { P2 } from './projection';
import { createRandom, hash01 } from './random';

/**
 * 地形（docs/city-design.md 1 章）。
 * 浮いた島の地盤（厚みのある縁）・海・蛇行する川・高さ 0〜3 段の丘。
 * 海岸線と川は曲線で持ち、マスの階段にしない。同じ seed からは同じ地形になる。
 */

export const MAP_SIZE = 96;
/** 初めに使える中央の範囲（24×24） */
export const START_AREA = { x: 36, y: 36, w: 24, h: 24 } as const;
/** 丘の 1 段の高さ（z の単位） */
export const HILL_STEP = 0.42;

export interface Hill {
  /** 段ごとの輪郭。levels[0] が 1 段目（一番広い） */
  levels: P2[][];
}

export interface Field {
  pts: P2[];
  /** 畝の向き */
  rows: 'x' | 'y';
  crop: number;
}

export interface TreeSpot {
  x: number;
  y: number;
  z: number;
  kind: 'broad' | 'conifer';
  scale: number;
  variant: number;
}

export interface Terrain {
  seed: number;
  size: number;
  /** 地盤の輪郭（この外は空） */
  slab: P2[];
  /** 陸の輪郭（この外は海） */
  coast: P2[];
  river: { center: P2[]; width: number[] };
  hills: Hill[];
  fields: Field[];
  trees: TreeSpot[];
}

/* ---------- 幾何 ---------- */

export function pointInPolygon(p: P2, poly: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i] as P2;
    const b = poly[j] as P2;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 折れ線までの距離と、一番近い区間の番号 */
export function distanceToPolyline(p: P2, line: readonly P2[]): { dist: number; index: number } {
  let best = Infinity;
  let index = 0;
  for (let i = 0; i + 1 < line.length; i += 1) {
    const a = line[i] as P2;
    const b = line[i + 1] as P2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (d < best) {
      best = d;
      index = i;
    }
  }
  return { dist: best, index };
}

/** 輪郭（閉じた折れ線）までの距離 */
export function distanceToOutline(p: P2, poly: readonly P2[]): number {
  const first = poly[0];
  return distanceToPolyline(p, first ? [...poly, first] : poly).dist;
}

/** 中心の周りの角度ごとの半径で、なめらかな輪郭を作る */
function radialOutline(cx: number, cy: number, radius: (theta: number) => number, points: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < points; i += 1) {
    const theta = (i / points) * Math.PI * 2;
    const r = radius(theta);
    out.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r });
  }
  return out;
}

/* ---------- 生成 ---------- */

export function generateTerrain(seed: number, size = MAP_SIZE): Terrain {
  const rand = createRandom(seed);
  const ph = (): number => rand() * Math.PI * 2;

  // 地盤: 角を丸めた正方形に、少しの揺らぎ
  const slab: P2[] = [];
  const m = 1.2;
  const corner = 9;
  const half = size / 2 - m;
  const c = size / 2;
  const n = 220;
  const wob = [ph(), ph(), ph()];
  for (let i = 0; i < n; i += 1) {
    const theta = (i / n) * Math.PI * 2;
    // 角の丸い正方形（超楕円）の半径
    const k = 5;
    const ct = Math.abs(Math.cos(theta));
    const st = Math.abs(Math.sin(theta));
    let r = half / Math.pow(Math.pow(ct, k) + Math.pow(st, k), 1 / k);
    r -= corner * 0.08 * Math.pow(Math.sin(2 * theta), 2);
    r += 0.5 * Math.sin(7 * theta + (wob[0] ?? 0)) + 0.3 * Math.sin(13 * theta + (wob[1] ?? 0));
    slab.push({ x: c + Math.cos(theta) * r, y: c + Math.sin(theta) * r });
  }

  // 陸: 中心を奥へずらし、手前（+x+y）に海が見えるようにする
  const a = [ph(), ph(), ph(), ph()];
  const coast = radialOutline(c - 3, c - 4, (t) => 36.5 + 3.2 * Math.sin(2 * t + (a[0] ?? 0)) + 2.2 * Math.sin(3 * t + (a[1] ?? 0)) + 1.1 * Math.sin(5 * t + (a[2] ?? 0)) + 0.5 * Math.sin(9 * t + (a[3] ?? 0)), 260);

  // 川: 北の泉から、町の東を回って南の海へ蛇行する
  const rp = [ph(), ph()];
  const center: P2[] = [];
  const width: number[] = [];
  for (let y = 19; y <= size - 4; y += 0.5) {
    const x = 64.5 + 2.6 * Math.sin(y / 6.5 + (rp[0] ?? 0)) + 1.2 * Math.sin(y / 2.9 + (rp[1] ?? 0)) + Math.max(0, y - 60) * 0.18;
    center.push({ x, y });
    width.push(1.5 + Math.max(0, y - 40) * 0.025);
  }

  // 丘: 町の外（西・北・南西）の 3 か所。段ごとに小さく。陸の中に収まるように置く
  const hillCenters: P2[] = [{ x: 25, y: 28 }, { x: 44, y: 22 }, { x: 25, y: 61 }];
  const hills: Hill[] = hillCenters.map((hc) => {
    const base = 6.5 + rand() * 1.5;
    const hp = [ph(), ph(), ph()];
    const levels: P2[][] = [];
    const count = 3;
    for (let level = 0; level < count; level += 1) {
      const scale = [1, 0.64, 0.34][level] ?? 0.3;
      const shift = level * 0.9;
      levels.push(radialOutline(hc.x - shift * 0.6, hc.y - shift * 0.3, (t) => base * scale * (1 + 0.16 * Math.sin(2 * t + (hp[0] ?? 0) + level) + 0.09 * Math.sin(3 * t + (hp[1] ?? 0)) + 0.05 * Math.sin(5 * t + (hp[2] ?? 0))), 72));
    }
    return { levels };
  });

  // 畑: 町の西と東の平地
  const fields: Field[] = [
    rectField(28, 39, 34, 45, 'y', 0),
    rectField(28.5, 46, 33.5, 52.5, 'x', 1),
    rectField(68, 40, 74, 46, 'x', 2),
    rectField(68.5, 47, 74, 53, 'y', 0),
  ];

  const partial: Terrain = { seed, size, slab, coast, river: { center, width }, hills, fields, trees: [] };
  partial.trees = placeTrees(partial);
  return partial;
}

function rectField(x0: number, y0: number, x1: number, y1: number, rows: 'x' | 'y', crop: number): Field {
  return { pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], rows, crop };
}

/* ---------- 問い合わせ ---------- */

export function riverWidthAt(t: Terrain, index: number): number {
  return t.river.width[index] ?? t.river.width[t.river.width.length - 1] ?? 1.5;
}

export function inRiver(t: Terrain, p: P2, margin = 0): boolean {
  const { dist, index } = distanceToPolyline(p, t.river.center);
  return dist < riverWidthAt(t, index) / 2 + margin;
}

/** 陸の上か（海と川を除く） */
export function isLand(t: Terrain, p: P2): boolean {
  return pointInPolygon(p, t.coast) && !inRiver(t, p);
}

/** 丘の段（0〜3） */
export function heightLevel(t: Terrain, p: P2): number {
  let level = 0;
  for (const hill of t.hills) {
    hill.levels.forEach((outline, i) => {
      if (i + 1 > level && pointInPolygon(p, outline)) level = i + 1;
    });
  }
  return level;
}

export function inField(t: Terrain, p: P2): boolean {
  return t.fields.some((f) => pointInPolygon(p, f.pts));
}

function inStartArea(p: P2, margin: number): boolean {
  return p.x > START_AREA.x - margin && p.x < START_AREA.x + START_AREA.w + margin && p.y > START_AREA.y - margin && p.y < START_AREA.y + START_AREA.h + margin;
}

/** 木を置く。丘の上は森、平地はまばら。町の範囲・畑・水辺には置かない */
function placeTrees(t: Terrain): TreeSpot[] {
  const out: TreeSpot[] = [];
  const step = 0.85;
  for (let gy = 2; gy < t.size - 2; gy += step) {
    for (let gx = 2; gx < t.size - 2; gx += step) {
      const jx = gx + (hash01(t.seed, gx * 10, gy * 10, 1) - 0.5) * step * 0.9;
      const jy = gy + (hash01(t.seed, gx * 10, gy * 10, 2) - 0.5) * step * 0.9;
      const p = { x: jx, y: jy };
      if (!pointInPolygon(p, t.coast) || distanceToOutline(p, t.coast) < 2.2) continue;
      if (inRiver(t, p, 0.9)) continue;
      if (inStartArea(p, 0.5) || inField(t, p)) continue;
      const level = heightLevel(t, p);
      // 段の縁の近くには置かない（崖に木が刺さって見えるため）
      if (level > 0 && t.hills.some((h) => h.levels.some((o) => distanceToOutline(p, o) < 0.35))) continue;
      const forest = level > 0 ? 0.62 : 0.06 + 0.1 * Math.max(0, 1 - Math.hypot(p.x - 48, p.y - 48) / 50);
      // 森のかたまり: 低い周波数の揺らぎで濃淡を付ける
      const clump = 0.5 + 0.5 * Math.sin(jx * 0.31 + t.seed) * Math.sin(jy * 0.27 - t.seed * 0.5);
      if (hash01(t.seed, gx * 10, gy * 10, 3) > forest * (0.55 + clump * 0.9)) continue;
      const conifer = level >= 2 || hash01(t.seed, gx * 10, gy * 10, 4) < (level > 0 ? 0.45 : 0.15);
      out.push({
        x: jx,
        y: jy,
        z: level * HILL_STEP,
        kind: conifer ? 'conifer' : 'broad',
        scale: 0.8 + hash01(t.seed, gx * 10, gy * 10, 5) * 0.55,
        variant: Math.floor(hash01(t.seed, gx * 10, gy * 10, 6) * 3),
      });
    }
  }
  return out;
}
