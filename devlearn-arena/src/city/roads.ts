import { cellKindAt } from './cells';
import type { Terrain } from './terrain';
import type { Point, Road } from './types';
import type { BuildRoadKind } from './rules';

/**
 * 道路の引き方（docs/city-design.md 2 章）。直線と、曲線（始点・制御点・終点）。
 * 道路はマスの中心を通る折れ線で持つ。大通り（2 マス）は 2 列のマスの境を通る。
 */

export type RoadPlan =
  | { kind: Exclude<BuildRoadKind, 'roundabout'>; shape: 'straight'; from: Point; to: Point }
  | { kind: Exclude<BuildRoadKind, 'roundabout'>; shape: 'curve'; from: Point; ctrl: Point; to: Point }
  | { kind: 'roundabout'; center: Point };

const center = (c: Point): Point => ({ x: c.x + 0.5, y: c.y + 0.5 });

/** 2 次ベジェ曲線を折れ線にする */
export function bezier(p0: Point, ctrl: Point, p1: Point, steps = 16): Point[] {
  const path: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    path.push({ x: u * u * p0.x + 2 * u * t * ctrl.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * ctrl.y + t * t * p1.y });
  }
  return path;
}

/** 直線の終点を、始点から縦か横の真っすぐな向きにそろえる */
export function snapStraight(from: Point, to: Point): Point {
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
}

/** 引く計画から、道路の形（ID は空）を作る */
export function roadOfPlan(plan: RoadPlan): Road {
  if (plan.kind === 'roundabout') return { id: '', kind: 'roundabout', path: [center(plan.center)] };
  if (plan.shape === 'curve') {
    const steps = Math.max(8, Math.round(Math.hypot(plan.to.x - plan.from.x, plan.to.y - plan.from.y) * 2));
    return { id: '', kind: plan.kind, path: bezier(center(plan.from), plan.ctrl, center(plan.to), steps) };
  }
  const to = snapStraight(plan.from, plan.to);
  const a = center(plan.from);
  const b = center(to);
  if (plan.kind === 'avenue') {
    // 2 列のマスの境を通す（始点のマスと、その右か下のマスの 2 列）
    const alongX = a.y === b.y;
    const shift = { x: alongX ? 0 : 0.5, y: alongX ? 0.5 : 0 };
    return { id: '', kind: 'avenue', path: [{ x: a.x + shift.x, y: a.y + shift.y }, { x: b.x + shift.x, y: b.y + shift.y }] };
  }
  return { id: '', kind: plan.kind, path: [a, b] };
}

/* ---------- 橋 ---------- */

function lengthOf(path: readonly Point[]): number {
  let len = 0;
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i] as Point;
    const b = path[i + 1] as Point;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

/** 折れ線の上の、始点から距離 s の点 */
export function pointAt(path: readonly Point[], s: number): Point {
  let left = s;
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i] as Point;
    const b = path[i + 1] as Point;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len || i + 2 === path.length) {
      const t = len > 0 ? Math.max(0, Math.min(1, left / len)) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= len;
  }
  return path[0] ?? { x: 0, y: 0 };
}

/** 折れ線の s0 から s1 までの部分 */
export function subPath(path: readonly Point[], s0: number, s1: number): Point[] {
  const out: Point[] = [pointAt(path, s0)];
  let acc = 0;
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i] as Point;
    const b = path[i + 1] as Point;
    acc += Math.hypot(b.x - a.x, b.y - a.y);
    if (acc > s0 + 1e-6 && acc < s1 - 1e-6) out.push(b);
  }
  out.push(pointAt(path, s1));
  return out;
}

/** 道路が川を渡る区間（始点からの距離）。川のマスの上を通る所 */
export function riverSpans(path: readonly Point[], terrain: Terrain): { s0: number; s1: number }[] {
  const len = lengthOf(path);
  const step = 0.1;
  const spans: { s0: number; s1: number }[] = [];
  let open: number | null = null;
  for (let s = 0; s <= len + 1e-9; s += step) {
    const p = pointAt(path, Math.min(s, len));
    const river = cellKindAt(terrain, Math.floor(p.x), Math.floor(p.y)) === 'river';
    if (river && open === null) open = s;
    if (!river && open !== null) {
      spans.push({ s0: open, s1: s });
      open = null;
    }
  }
  if (open !== null) spans.push({ s0: open, s1: len });
  return spans;
}

/**
 * 川を渡る所に橋を架ける（docs/city-design.md 2 章: 自動で架かる）。
 * 道路を「陸の道路・橋・陸の道路」に分ける。橋は岸のマスに半マスずつ掛かる。
 */
export function splitBridges(road: Road, terrain: Terrain): Road[] {
  if (road.kind === 'roundabout') return [road];
  const spans = riverSpans(road.path, terrain);
  if (spans.length === 0) return [road];
  const len = lengthOf(road.path);
  const straight = road.path.length === 2;
  const out: Road[] = [];
  const piece = (kind: Road['kind'], s0: number, s1: number): void => {
    if (s1 - s0 < 0.3) return;
    const sub = subPath(road.path, s0, s1);
    out.push({ id: '', kind, path: straight ? [sub[0] as Point, sub[sub.length - 1] as Point] : sub });
  };
  let cursor = 0;
  for (const span of spans) {
    const b0 = Math.max(0, span.s0 - 0.5);
    const b1 = Math.min(len, span.s1 + 0.5);
    piece(road.kind, cursor, b0);
    piece('bridge', b0, b1);
    cursor = b1;
  }
  piece(road.kind, cursor, len);
  return out;
}
