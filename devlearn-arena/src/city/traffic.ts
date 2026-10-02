import { createRandom } from './random';
import { resample } from './roadGeometry';
import type { City, Point, Road } from './types';

/**
 * 車と人の動き（docs/city-design.md 6 章: 車が道路を走り、人が歩道を歩く。数は都市規模に応じて増える）。
 * 道路の網をたどる道のりを seed から決め、時刻から位置を計算する（同じ時刻なら同じ位置）。
 * 車は左側を走る。人は縁石の上（歩道）を歩く。
 */

interface Lane {
  road: Road;
  pts: Point[];
  /** 始点から各点までの距離 */
  acc: number[];
  length: number;
  /** この道路の上の交わる所（距離 s で、他の道路 to の距離 toS に移れる） */
  joints: { s: number; to: number; toS: number }[];
}

export interface Network {
  lanes: Lane[];
}

const STEP = 0.25;

function laneOf(road: Road): Lane {
  let pts: Point[];
  if (road.kind === 'roundabout') {
    const c = road.path[0] ?? { x: 0, y: 0 };
    pts = Array.from({ length: 25 }, (_, i) => ({ x: c.x + Math.cos((i / 24) * Math.PI * 2), y: c.y + Math.sin((i / 24) * Math.PI * 2) }));
  } else {
    pts = resample(road.path, STEP);
  }
  const acc = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1] as Point;
    const b = pts[i] as Point;
    acc.push((acc[i - 1] as number) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return { road, pts, acc, length: acc[acc.length - 1] ?? 0, joints: [] };
}

function nearest(lane: Lane, p: Point): { s: number; d: number } {
  let best = { s: 0, d: Infinity };
  lane.pts.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < best.d) best = { s: lane.acc[i] as number, d };
  });
  return best;
}

/** 道路の網（どの道路のどこで、どの道路に移れるか） */
export function roadNetwork(roads: readonly Road[]): Network {
  const lanes = roads.map(laneOf).filter((l) => l.length > 0.2);
  lanes.forEach((a, ai) => {
    lanes.forEach((b, bi) => {
      if (ai === bi) return;
      // 交差: a の点が b の線に近い所（近い点の中で一番近い 1 つだけを残す）
      let open: { s: number; d: number; toS: number } | null = null;
      const flush = (): void => {
        if (open) a.joints.push({ s: open.s, to: bi, toS: open.toS });
        open = null;
      };
      a.pts.forEach((p, i) => {
        const n = nearest(b, p);
        if (n.d < 0.55) {
          if (!open || n.d < open.d) open = { s: a.acc[i] as number, d: n.d, toS: n.s };
        } else flush();
      });
      flush();
      // 丁字路: a の端が b の近くで止まる
      for (const end of [0, a.length]) {
        const p = end === 0 ? a.pts[0] : a.pts[a.pts.length - 1];
        if (!p) continue;
        const n = nearest(b, p);
        if (n.d >= 0.55 && n.d < 1.1 && !a.joints.some((j) => j.to === bi && Math.abs(j.s - end) < 0.6)) a.joints.push({ s: end, to: bi, toS: n.s });
      }
    });
    a.joints.sort((x, y) => x.s - y.s);
  });
  return { lanes };
}

/** 1 つの道路の上の、1 つの区間（s0 から s1 へ。s1 < s0 なら逆向き） */
interface Leg {
  lane: number;
  s0: number;
  s1: number;
}

export interface Route {
  legs: Leg[];
  /** 区間の終わりまでの距離の累計 */
  ends: number[];
  length: number;
}

/** 網をたどる道のり。交わる所で曲がるか直進するかを seed から決め、行き止まりでは転回する */
export function routeOf(net: Network, seed: number, minLength = 160): Route | null {
  const rand = createRandom(seed);
  const total = net.lanes.reduce((a, l) => a + l.length, 0);
  if (total <= 0) return null;
  // 長い道路ほど選ばれやすい
  let pick = rand() * total;
  let lane = 0;
  for (let i = 0; i < net.lanes.length; i += 1) {
    pick -= (net.lanes[i] as Lane).length;
    if (pick <= 0) {
      lane = i;
      break;
    }
  }
  let s = rand() * (net.lanes[lane] as Lane).length;
  let dir = rand() < 0.5 ? 1 : -1;
  const legs: Leg[] = [];
  const ends: number[] = [];
  let length = 0;
  for (let guard = 0; length < minLength && guard < 400; guard += 1) {
    const l = net.lanes[lane] as Lane;
    const ahead = l.joints.filter((j) => (dir > 0 ? j.s > s + 0.3 : j.s < s - 0.3));
    const next = dir > 0 ? ahead[0] : ahead[ahead.length - 1];
    const stop = next ? next.s : dir > 0 ? l.length : 0;
    legs.push({ lane, s0: s, s1: stop });
    length += Math.abs(stop - s);
    ends.push(length);
    if (!next) {
      // 行き止まり: 転回する
      dir = -dir;
      s = stop;
      continue;
    }
    const atEnd = next.s < 0.6 || next.s > l.length - 0.6;
    if (atEnd || rand() < 0.55) {
      const to = net.lanes[next.to] as Lane;
      lane = next.to;
      s = next.toS;
      dir = s < 0.6 ? 1 : s > to.length - 0.6 ? -1 : rand() < 0.5 ? 1 : -1;
    } else {
      s = stop;
    }
  }
  return legs.length > 0 ? { legs, ends, length } : null;
}

function pointOn(lane: Lane, s: number): { p: Point; t: Point } {
  const acc = lane.acc;
  let lo = 0;
  let hi = acc.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if ((acc[mid] as number) <= s) lo = mid;
    else hi = mid;
  }
  const a = lane.pts[lo] as Point;
  const b = lane.pts[hi] as Point;
  const span = (acc[hi] as number) - (acc[lo] as number) || 1;
  const u = Math.max(0, Math.min(1, (s - (acc[lo] as number)) / span));
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, t: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } };
}

export interface AgentPose {
  /** 地図の上の位置 */
  x: number;
  y: number;
  /** 進む向き（長さ 1） */
  dx: number;
  dy: number;
}

/**
 * 道のりの上の、走った距離 d の姿勢。道のりの終わりまで行くと、同じ道を戻る。
 * side は進む向きの左へのずれ。道幅の半分に対する比（車線は 0.4、歩道は 0.9）
 */
export function poseOn(net: Network, route: Route, d: number, side: number): AgentPose {
  const cycle = route.length * 2;
  let x = ((d % cycle) + cycle) % cycle;
  const back = x > route.length;
  if (back) x = cycle - x;
  let i = 0;
  while (i < route.ends.length - 1 && (route.ends[i] as number) < x) i += 1;
  const leg = route.legs[i] as Leg;
  const start = i === 0 ? 0 : (route.ends[i - 1] as number);
  const along = x - start;
  const forward = leg.s1 >= leg.s0 ? 1 : -1;
  const s = leg.s0 + forward * along;
  const lane = net.lanes[leg.lane] as Lane;
  const { p, t } = pointOn(lane, s);
  const sign = forward * (back ? -1 : 1);
  const dx = t.x * sign;
  const dy = t.y * sign;
  // 左は (dy, -dx)（y が下向きの地図で、進む向きに対して左）
  const off = side * (lane.road.kind === 'avenue' ? 1 : 0.5);
  return { x: p.x + dy * off, y: p.y - dx * off, dx, dy };
}

export interface Agent {
  kind: 'car' | 'person';
  variant: number;
  route: Route;
  speed: number;
  offset: number;
  side: number;
}

/** 車と人の数（都市規模に応じて増える） */
export function agentCounts(city: Pick<City, 'population' | 'facilities' | 'roads'>): { cars: number; people: number } {
  if (city.roads.length === 0) return { cars: 0, people: 0 };
  const active = city.facilities.filter((f) => f.state === 'active').length;
  return {
    cars: Math.min(60, Math.round(Math.sqrt(city.population) * 1.5) + active * 2),
    people: Math.min(80, Math.round(Math.sqrt(city.population) * 2) + active),
  };
}

/** 都市の車と人の一覧（seed と道路から決まる） */
export function agentsOf(city: Pick<City, 'seed' | 'population' | 'facilities' | 'roads'>, net: Network): Agent[] {
  const { cars, people } = agentCounts(city);
  const out: Agent[] = [];
  for (let i = 0; i < cars; i += 1) {
    const route = routeOf(net, city.seed * 31 + i * 7919);
    if (!route) break;
    out.push({ kind: 'car', variant: i % 5, route, speed: 1.1 + (i % 4) * 0.15, offset: (i * 37.3) % route.length, side: 0.4 });
  }
  for (let i = 0; i < people; i += 1) {
    const route = routeOf(net, city.seed * 17 + i * 104729, 24);
    if (!route) break;
    out.push({ kind: 'person', variant: i % 4, route, speed: 0.3 + (i % 3) * 0.05, offset: (i * 11.7) % route.length, side: i % 2 === 0 ? 0.9 : -0.9 });
  }
  return out;
}

/** 時刻 seconds の姿勢 */
export function agentPose(net: Network, agent: Agent, seconds: number): AgentPose {
  return poseOn(net, agent.route, agent.offset + seconds * agent.speed, agent.side);
}
