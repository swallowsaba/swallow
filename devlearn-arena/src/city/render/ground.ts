import { city, hud, mix, rgbaOf, shade, zoneTint } from '@/ui/tokens';
import { project, rotate, type P2, type Rotation } from '../projection';
import { hash01 } from '../random';
import { circle, offsetPolyline, ROAD_CURB, type RoadShape } from '../roadGeometry';
import { HILL_STEP, isLand, pointInPolygon, type Terrain } from '../terrain';
import type { ZoneKind } from '../types';

/**
 * 地面の層（地盤・海・陸・川・丘・畑・道路）を描く（docs/city-design.md 1 章の層の順）。
 * 座標は「層の座標」= 投影した画素 × 拡大率。カメラの平行移動は、描き終えた絵を置く時に足す。
 */

export interface GroundData {
  terrain: Terrain;
  roads: RoadShape[];
  /** 区画の地面（塗った区画のマス。建物が建つと敷地に覆われる） */
  zones: { kind: ZoneKind; cells: readonly P2[] }[];
  /** 草の細かな濃淡（地図の座標） */
  tufts: { x: number; y: number; shade: number; size: number }[];
  /** 海の小さな波（地図の座標） */
  ripples: { x: number; y: number; len: number }[];
  /** 浅瀬の輪郭と、陸の芝の輪郭 */
  shallow: P2[];
  grassEdge: P2[];
  foam: P2[];
}

/** 地面に描く物の下ごしらえ（重い計算を 1 回だけにする） */
export function prepareGround(terrain: Terrain, roads: RoadShape[]): GroundData {
  const tufts: GroundData['tufts'] = [];
  for (let y = 1; y < terrain.size - 1; y += 0.55) {
    for (let x = 1; x < terrain.size - 1; x += 0.55) {
      const px = x + (hash01(terrain.seed, x * 20, y * 20, 11) - 0.5) * 0.5;
      const py = y + (hash01(terrain.seed, x * 20, y * 20, 12) - 0.5) * 0.5;
      if (!isLand(terrain, { x: px, y: py })) continue;
      tufts.push({ x: px, y: py, shade: hash01(terrain.seed, x * 20, y * 20, 13), size: 0.5 + hash01(terrain.seed, x * 20, y * 20, 14) });
    }
  }
  const ripples: GroundData['ripples'] = [];
  for (let i = 0; i < 1400; i += 1) {
    const x = hash01(terrain.seed, i, 1, 21) * terrain.size;
    const y = hash01(terrain.seed, i, 2, 21) * terrain.size;
    if (!pointInPolygon({ x, y }, terrain.slab) || pointInPolygon({ x, y }, terrain.coast)) continue;
    ripples.push({ x, y, len: 0.3 + hash01(terrain.seed, i, 3, 21) * 0.6 });
  }
  return {
    terrain,
    roads,
    zones: [],
    tufts,
    ripples,
    shallow: offsetOutline(terrain.coast, 2.6),
    foam: offsetOutline(terrain.coast, 0.32),
    grassEdge: offsetOutline(terrain.coast, -0.85),
  };
}

/** 閉じた輪郭を外へ d ずらす（反時計回りの輪郭で、外向き） */
export function offsetOutline(poly: readonly P2[], d: number): P2[] {
  const n = poly.length;
  // 輪郭の向き（面積の符号）で外向きの法線を決める
  let area = 0;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i] as P2;
    const b = poly[(i + 1) % n] as P2;
    area += a.x * b.y - b.x * a.y;
  }
  const sign = area > 0 ? 1 : -1;
  const out: P2[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = poly[(i - 1 + n) % n] as P2;
    const next = poly[(i + 1) % n] as P2;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const p = poly[i] as P2;
    out.push({ x: p.x + (ty / len) * d * sign, y: p.y - (tx / len) * d * sign });
  }
  return out;
}

export interface LayerSpace {
  rotation: Rotation;
  zoom: number;
  size: number;
}

/** 地図の点を層の座標へ */
export function toLayer(s: LayerSpace, p: P2, z = 0): [number, number] {
  const v = rotate(p, s.rotation, s.size);
  const q = project({ x: v.x, y: v.y, z });
  return [q.sx * s.zoom, q.sy * s.zoom];
}

function pathOf(ctx: CanvasRenderingContext2D, s: LayerSpace, pts: readonly P2[], z = 0, close = true): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = toLayer(s, p, z);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (close) ctx.closePath();
}

function fill(ctx: CanvasRenderingContext2D, s: LayerSpace, pts: readonly P2[], color: string, z = 0): void {
  pathOf(ctx, s, pts, z);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * 輪郭を下へ押し出した側面（地盤の縁・丘の段）。見る人に向いた辺だけを塗る。
 * 左下を向く辺は明るく、右下を向く辺は暗く（光は左上から）。
 */
function extrude(ctx: CanvasRenderingContext2D, s: LayerSpace, poly: readonly P2[], zTop: number, zBottom: number, color: string): void {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i += 1) {
    const a = rotate(poly[i] as P2, s.rotation, s.size);
    const b = rotate(poly[(i + 1) % n] as P2, s.rotation, s.size);
    area += a.x * b.y - b.x * a.y;
  }
  const sign = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i] as P2;
    const b = poly[(i + 1) % n] as P2;
    const va = rotate(a, s.rotation, s.size);
    const vb = rotate(b, s.rotation, s.size);
    // 見る向きでの外向きの法線
    const nx = (vb.y - va.y) * sign;
    const ny = -(vb.x - va.x) * sign;
    if (nx + ny <= 0) continue;
    const len = Math.hypot(nx, ny) || 1;
    const light = 0.6 + 0.2 * Math.max(0, ny / len) - 0.04 * Math.max(0, nx / len);
    const [ax, ay] = toLayer(s, a, zTop);
    const [bx, by] = toLayer(s, b, zTop);
    const [cx, cy] = toLayer(s, b, zBottom);
    const [dx, dy] = toLayer(s, a, zBottom);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.lineTo(dx, dy);
    ctx.closePath();
    ctx.fillStyle = shade(color, light);
    ctx.fill();
    // 隙間が見えないよう同じ色で縁取る
    ctx.strokeStyle = shade(color, light);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

const SLAB_DEPTH = 5.5;

/** 地面の層を全部描く。rect は層の座標での描く範囲（外は省く） */
export function drawGround(ctx: CanvasRenderingContext2D, s: LayerSpace, g: GroundData, rect: { x0: number; y0: number; x1: number; y1: number }): void {
  const t = g.terrain;
  const z = s.zoom;
  const inRect = (p: P2, pad: number): boolean => {
    const [x, y] = toLayer(s, p);
    return x > rect.x0 - pad && x < rect.x1 + pad && y > rect.y0 - pad && y < rect.y1 + pad;
  };

  // 地盤の縁（土の帯と岩の層）
  const soil = city.groundSide;
  const rock = mix(city.groundSide, city.roofTile, 0.35);
  extrude(ctx, s, t.slab, 0, -SLAB_DEPTH * 0.28, soil);
  extrude(ctx, s, t.slab, -SLAB_DEPTH * 0.28, -SLAB_DEPTH * 0.62, shade(rock, 0.95));
  extrude(ctx, s, t.slab, -SLAB_DEPTH * 0.62, -SLAB_DEPTH, shade(mix(rock, city.curb, 0.4), 0.9));

  // 海（深い所・浅瀬・白い波打ち際）
  fill(ctx, s, t.slab, city.water);
  fill(ctx, s, g.shallow, mix(city.water, city.shallow, 0.7));
  fill(ctx, s, offsetOutline(t.coast, 1.1), city.shallow);
  ctx.globalAlpha = 0.55;
  fill(ctx, s, g.foam, mix(city.shallow, city.lineWhite, 0.55));
  ctx.globalAlpha = 1;

  // 小さな波
  ctx.strokeStyle = rgbaOf(city.lineWhite, 0.28);
  ctx.lineWidth = Math.max(1, 1.2 * z);
  ctx.beginPath();
  for (const r of g.ripples) {
    if (!inRect(r, 40)) continue;
    const [x, y] = toLayer(s, r);
    ctx.moveTo(x - r.len * 14 * z, y);
    ctx.lineTo(x + r.len * 14 * z, y);
  }
  ctx.stroke();

  // 陸（砂浜・芝）
  fill(ctx, s, t.coast, city.sand);
  fill(ctx, s, g.grassEdge, city.grass);

  // 草の濃淡
  for (const tf of g.tufts) {
    if (!inRect(tf, 8)) continue;
    const [x, y] = toLayer(s, tf);
    const c = tf.shade < 0.5 ? mix(city.grass, city.grassDark, 0.9) : mix(city.grass, city.tree3, 0.55);
    ctx.fillStyle = c;
    const rx = (3 + tf.size * 3) * z;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 畑（畝の筋）
  for (const f of t.fields) {
    fill(ctx, s, f.pts, mix(city.sand, city.grassDark, 0.35 + f.crop * 0.12));
    const [a, b, c, d] = f.pts as [P2, P2, P2, P2];
    const rows = 12;
    ctx.strokeStyle = f.crop === 1 ? mix(city.tree3, city.sand, 0.2) : mix(city.tree2, city.grass, 0.4);
    ctx.lineWidth = Math.max(1, 3.2 * z);
    ctx.beginPath();
    for (let i = 0; i <= rows; i += 1) {
      const u = (i + 0.5) / (rows + 1);
      const p0 = f.rows === 'x' ? lerp(a, d, u) : lerp(a, b, u);
      const p1 = f.rows === 'x' ? lerp(b, c, u) : lerp(d, c, u);
      const [x0, y0] = toLayer(s, p0);
      const [x1, y1] = toLayer(s, p1);
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
    // 畑の縁の土の筋
    pathOf(ctx, s, f.pts);
    ctx.strokeStyle = mix(city.sand, city.roofTile, 0.3);
    ctx.lineWidth = Math.max(1, 1.5 * z);
    ctx.stroke();
  }

  // 川（岸の砂と水）
  const left = offsetPolyline(t.river.center, 0);
  const bankPts: P2[] = [];
  const waterPts: P2[] = [];
  left.forEach((p, i) => {
    const w = (t.river.width[i] ?? 1.5) / 2;
    const prev = t.river.center[Math.max(0, i - 1)] as P2;
    const next = t.river.center[Math.min(t.river.center.length - 1, i + 1)] as P2;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    bankPts.push({ x: p.x - (ty / len) * (w + 0.28), y: p.y + (tx / len) * (w + 0.28) });
    waterPts.push({ x: p.x - (ty / len) * w, y: p.y + (tx / len) * w });
  });
  const bankPts2: P2[] = [];
  const waterPts2: P2[] = [];
  left.forEach((p, i) => {
    const w = (t.river.width[i] ?? 1.5) / 2;
    const prev = t.river.center[Math.max(0, i - 1)] as P2;
    const next = t.river.center[Math.min(t.river.center.length - 1, i + 1)] as P2;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    bankPts2.push({ x: p.x + (ty / len) * (w + 0.28), y: p.y - (tx / len) * (w + 0.28) });
    waterPts2.push({ x: p.x + (ty / len) * w, y: p.y - (tx / len) * w });
  });
  // 川は陸の中だけ（河口で海に溶ける）
  ctx.save();
  pathOf(ctx, s, offsetOutline(t.coast, 0.9));
  ctx.clip();
  fill(ctx, s, [...bankPts, ...bankPts2.reverse()], mix(city.sand, city.grassDark, 0.3));
  fill(ctx, s, [...waterPts, ...waterPts2.reverse()], mix(city.water, city.shallow, 0.5));
  ctx.restore();

  // 丘（段ごとに側面と上面）
  for (const hill of t.hills) {
    hill.levels.forEach((outline, i) => {
      const zTop = (i + 1) * HILL_STEP;
      const zBottom = i * HILL_STEP;
      extrude(ctx, s, outline, zTop, zBottom, mix(city.grassDark, city.groundSide, 0.35));
      fill(ctx, s, outline, mix(city.grass, city.tree3, 0.12 * (i + 1)), zTop);
      // 段の縁の明るい線
      pathOf(ctx, s, outline, zTop);
      ctx.strokeStyle = rgbaOf(mix(city.grass, city.sand, 0.4), 0.55);
      ctx.lineWidth = Math.max(1, 1.2 * z);
      ctx.stroke();
    });
  }

  // 区画の地面（種類ごとの色を薄く敷き、縁を細く描く）
  for (const zone of g.zones) {
    const color = zoneTint[zone.kind];
    for (const c of zone.cells) {
      const cell = [{ x: c.x + 0.06, y: c.y + 0.06 }, { x: c.x + 0.94, y: c.y + 0.06 }, { x: c.x + 0.94, y: c.y + 0.94 }, { x: c.x + 0.06, y: c.y + 0.94 }];
      if (!inRect({ x: c.x + 0.5, y: c.y + 0.5 }, 64 * z)) continue;
      ctx.globalAlpha = 0.42;
      fill(ctx, s, cell, color);
      ctx.globalAlpha = 0.8;
      pathOf(ctx, s, cell);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, 1.2 * z);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // 橋（水面に落ちる影と、橋桁の側面）
  for (const r of g.roads) {
    if (r.road.kind !== 'bridge') continue;
    ctx.globalAlpha = 0.32;
    fill(ctx, s, r.outer.map((p) => ({ x: p.x + 0.32, y: p.y + 0.12 })), rgbaOf(hud.bg, 1));
    ctx.globalAlpha = 1;
    extrude(ctx, s, r.outer, 0, -0.18, mix(city.wallStone, city.curb, 0.45));
  }

  // 道路（縁石 → 路面 → 白線 → 横断歩道 → 転回場）
  const curbTop = mix(city.curb, city.lineWhite, 0.45);
  for (const r of g.roads) {
    fill(ctx, s, r.outer, r.road.kind === 'bridge' ? mix(city.wallStone, city.lineWhite, 0.3) : curbTop);
    for (const c of r.turnarounds) fill(ctx, s, circle(c, 0.78), curbTop);
  }
  for (const r of g.roads) {
    const asphalt = r.road.kind === 'lane' ? mix(city.paving, city.sand, 0.22) : city.paving;
    fill(ctx, s, r.surface, asphalt);
    for (const c of r.turnarounds) {
      fill(ctx, s, circle(c, 0.78 - ROAD_CURB), asphalt);
      // 転回場の中央の植え込み
      fill(ctx, s, circle(c, 0.22), city.tree3);
    }
    for (const island of r.islands) {
      fill(ctx, s, island, curbTop);
      fill(ctx, s, offsetOutline(island, -0.05), mix(city.grass, city.tree3, 0.5));
    }
  }
  ctx.strokeStyle = city.lineWhite;
  ctx.lineWidth = Math.max(1, 2 * z);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (const r of g.roads) {
    for (const [a, b] of r.dashes) {
      const [x0, y0] = toLayer(s, a);
      const [x1, y1] = toLayer(s, b);
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
  }
  ctx.stroke();
  for (const r of g.roads) for (const c of r.crossings) fill(ctx, s, c, city.lineWhite);
  // 橋の欄干（手すりと支柱）
  const rail = mix(city.lineWhite, city.wallStone, 0.3);
  const railH = 0.11;
  for (const r of g.roads) {
    for (const line of r.rails) {
      ctx.strokeStyle = shade(rail, 0.8);
      ctx.lineWidth = Math.max(1, 1.3 * z);
      ctx.beginPath();
      line.forEach((p, i) => {
        if (i % 2 !== 0 && i !== line.length - 1) return;
        const [x0, y0] = toLayer(s, p, 0);
        const [x1, y1] = toLayer(s, p, railH);
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      });
      ctx.stroke();
      pathOf(ctx, s, line, railH, false);
      ctx.strokeStyle = rail;
      ctx.lineWidth = Math.max(1.5, 2.2 * z);
      ctx.stroke();
    }
  }
  // 路面の細かな汚れ（単調にしない）
  ctx.globalAlpha = 0.08;
  for (const r of g.roads) {
    pathOf(ctx, s, r.surface);
    ctx.strokeStyle = city.curb;
    ctx.lineWidth = Math.max(1, 3 * z);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}


function lerp(a: P2, b: P2, t: number): P2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** 地盤の縁まで含めた、層の座標での範囲 */
export function groundBounds(s: LayerSpace, t: Terrain): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of t.slab) {
    for (const zz of [0, -SLAB_DEPTH]) {
      const [x, y] = toLayer(s, p, zz);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, x1, y1 };
}
