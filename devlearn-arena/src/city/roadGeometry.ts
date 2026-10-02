import type { P2 } from './projection';
import { distanceToPolyline } from './terrain';
import type { Road } from './types';

/**
 * 道路の形（docs/city-design.md 2 章）。地図の座標の多角形と線で返す。
 * 描画はこれを投影して塗るだけ。交差点は自動でつなぎ、行き止まりには転回場を描く。
 */

export interface RoadShape {
  road: Road;
  /** 縁石まで含めた外形 */
  outer: P2[];
  /** 路面 */
  surface: P2[];
  /** 中央線の破線（一般道だけ） */
  dashes: [P2, P2][];
  /** 横断歩道の縞 */
  crossings: P2[][];
  /** 転回場（行き止まりの丸い広場）の中心 */
  turnarounds: P2[];
  /** 緑の島（ロータリーの中央・大通りの中央分離帯） */
  islands: P2[][];
  /** 橋の欄干（左右の線） */
  rails: P2[][];
}

export const ROAD_HALF: Record<Road['kind'], number> = { lane: 0.5, street: 0.5, avenue: 1, bridge: 0.5, roundabout: 1.5 };
const CURB = 0.07;

/** 折れ線を左右に d だけずらした線（なめらかな角で） */
export function offsetPolyline(path: readonly P2[], d: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < path.length; i += 1) {
    const prev = path[Math.max(0, i - 1)] as P2;
    const next = path[Math.min(path.length - 1, i + 1)] as P2;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const p = path[i] as P2;
    out.push({ x: p.x - (ty / len) * d, y: p.y + (tx / len) * d });
  }
  return out;
}

/** 端を半マスずつ延ばす（端のマスを路面で覆うため） */
function extendEnds(path: readonly P2[], by: number): P2[] {
  if (path.length < 2) return [...path];
  const a = path[0] as P2;
  const a2 = path[1] as P2;
  const b = path[path.length - 1] as P2;
  const b2 = path[path.length - 2] as P2;
  const da = Math.hypot(a.x - a2.x, a.y - a2.y) || 1;
  const db = Math.hypot(b.x - b2.x, b.y - b2.y) || 1;
  return [
    { x: a.x + ((a.x - a2.x) / da) * by, y: a.y + ((a.y - a2.y) / da) * by },
    ...path.slice(1, -1),
    ...(path.length > 1 ? [{ x: b.x + ((b.x - b2.x) / db) * by, y: b.y + ((b.y - b2.y) / db) * by }] : []),
  ];
}

/** 折れ線を、間隔 step で細かく刻む */
export function resample(path: readonly P2[], step: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i] as P2;
    const b = path[i + 1] as P2;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k += 1) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  const last = path[path.length - 1];
  if (last) out.push(last);
  return out;
}

function band(path: readonly P2[], half: number): P2[] {
  const left = offsetPolyline(path, half);
  const right = offsetPolyline(path, -half);
  return [...left, ...right.reverse()];
}

/** 他の道路とつながっている点（交差点・丁字路） */
export function junctions(roads: readonly Road[]): P2[] {
  const out: P2[] = [];
  for (const a of roads) {
    for (const b of roads) {
      if (a === b) continue;
      // a の端が b に接する（丁字路）か、a の途中が b と交わる
      for (const p of resample(a.path, 0.5)) {
        const { dist } = distanceToPolyline(p, b.path);
        if (dist < 0.3 && !out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.8)) out.push(p);
      }
      for (const end of [a.path[0], a.path[a.path.length - 1]]) {
        if (!end) continue;
        const { dist } = distanceToPolyline(end, b.path);
        if (dist > 0.3 && dist < 1.05) {
          // 端から b の線へ下ろした足
          const near = nearestOn(end, b.path);
          if (!out.some((q) => Math.hypot(q.x - near.x, q.y - near.y) < 0.8)) out.push(near);
        }
      }
    }
  }
  return out;
}

function nearestOn(p: P2, line: readonly P2[]): P2 {
  let best = { x: p.x, y: p.y };
  let bestD = Infinity;
  for (let i = 0; i + 1 < line.length; i += 1) {
    const a = line[i] as P2;
    const b = line[i + 1] as P2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** 点から道路の中心線までの距離（ロータリーは環道の中心の輪まで） */
export function distanceToRoad(p: P2, road: Road): number {
  if (road.kind === 'roundabout') {
    const c = road.path[0];
    return c ? Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - 1) : Infinity;
  }
  return distanceToPolyline(p, road.path).dist;
}

/** 端が他のどの道路にもつながっていなければ、行き止まり */
function isDeadEnd(end: P2, road: Road, roads: readonly Road[]): boolean {
  return !roads.some((o) => o !== road && distanceToRoad(end, o) < 1.05);
}

export function roadShapes(roads: readonly Road[]): RoadShape[] {
  const joints = junctions(roads.filter((r) => r.kind !== 'roundabout' && r.kind !== 'bridge'));
  return roads.map((road) => {
    const half = ROAD_HALF[road.kind];
    if (road.kind === 'roundabout') {
      const c = road.path[0] ?? { x: 0, y: 0 };
      const ring: [P2, P2][] = [];
      const n = 28;
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        ring.push([{ x: c.x + Math.cos(a0), y: c.y + Math.sin(a0) }, { x: c.x + Math.cos(a1), y: c.y + Math.sin(a1) }]);
      }
      return { road, outer: circle(c, half, 40), surface: circle(c, half - CURB, 40), dashes: ring, crossings: [], turnarounds: [], islands: [circle(c, 0.55, 32)], rails: [] };
    }
    const ext = extendEnds(road.path, 0.5);
    const fine = resample(ext, 0.25);
    const dashes: [P2, P2][] = [];
    const crossings: P2[][] = [];
    const islands: P2[][] = [];
    const rails: P2[][] = [];
    if (road.kind === 'avenue') {
      // 中央分離帯（並木の植え込み）と、両側の車線の境の破線
      islands.push(band(resample(road.path, 0.25), 0.1));
      for (const side of [-0.5, 0.5]) {
        const lane = resample(offsetPolyline(road.path, side), 0.2);
        for (let i = 0; i + 1 < lane.length; i += 3) {
          const a = lane[i] as P2;
          const b = lane[i + 1] as P2;
          if (joints.some((j) => Math.hypot(j.x - a.x, j.y - a.y) < 1.6)) continue;
          dashes.push([a, b]);
        }
      }
    }
    if (road.kind === 'bridge') {
      const fineCenter = resample(road.path, 0.25);
      rails.push(offsetPolyline(fineCenter, half - 0.04), offsetPolyline(fineCenter, -(half - 0.04)));
    }
    if (road.kind === 'street') {
      const center = resample(road.path, 0.2);
      for (let i = 0; i + 1 < center.length; i += 2) {
        const a = center[i] as P2;
        const b = center[i + 1] as P2;
        if (joints.some((j) => Math.hypot(j.x - a.x, j.y - a.y) < 1.15)) continue;
        dashes.push([a, b]);
      }
      // 交差点の手前に横断歩道
      for (const j of joints) {
        const { dist, index } = distanceToPolyline(j, road.path);
        if (dist > 0.6) continue;
        const a = road.path[index] as P2;
        const b = road.path[index + 1] as P2;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        for (const side of [-1, 1]) {
          const cx = j.x + ux * side * 0.82;
          const cy = j.y + uy * side * 0.82;
          if (distanceToPolyline({ x: cx, y: cy }, road.path).dist > 0.2) continue;
          if (roads.some((o) => o !== road && distanceToPolyline({ x: cx, y: cy }, o.path).dist < 0.55)) continue;
          for (let k = -2; k <= 2; k += 1) {
            const off = k * 0.17;
            const px = cx - uy * off;
            const py = cy + ux * off;
            const w = 0.055;
            const l = 0.13;
            crossings.push([
              { x: px - ux * l - uy * w, y: py - uy * l + ux * w },
              { x: px + ux * l - uy * w, y: py + uy * l + ux * w },
              { x: px + ux * l + uy * w, y: py + uy * l - ux * w },
              { x: px - ux * l + uy * w, y: py - uy * l - ux * w },
            ]);
          }
        }
      }
    }
    const turnarounds: P2[] = [];
    const first = road.path[0];
    const last = road.path[road.path.length - 1];
    if (road.kind !== 'bridge') {
      if (first && isDeadEnd(first, road, roads)) turnarounds.push(first);
      if (last && last !== first && isDeadEnd(last, road, roads)) turnarounds.push(last);
    }
    return { road, outer: band(fine, half), surface: band(fine, half - CURB), dashes, crossings, turnarounds, islands, rails };
  });
}

/** 円を多角形で（転回場・ロータリー） */
export function circle(c: P2, r: number, n = 24): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}

export const ROAD_CURB = CURB;
