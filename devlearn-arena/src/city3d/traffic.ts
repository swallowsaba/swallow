import type { Vec2 } from './model';
import type { RoadNetwork, RoadPath } from './roads';
import { stream } from './seed';

/**
 * 車の道すじ（REWORK 7-2）。
 *
 * 道路の中心線を、交差点で区切った「区間」の網にする。車は区間を走り、
 * 交差点に着くたびに次に入る道を選ぶ（曲がる）。最後は出発点へ戻る道を探して輪にするので、
 * 車は端で消えて反対側から湧き出ることなく、ずっと走り続けられる。
 *
 * ここは three に触れない純粋な計算。同じ街からは必ず同じ道すじになる。
 */

/** 区間の端。交差点・道の端・ロータリー */
interface Stop {
  /** 道の始点からの距離（メートル） */
  at: number;
  node: string;
}

interface Edge {
  a: string;
  b: string;
  /** a から b へ向かう中心線 */
  points: Vec2[];
}

export interface TrafficGraph {
  edges: Edge[];
  /** その端から出ている区間（向き付き） */
  out: Map<string, { edge: number; forward: boolean }[]>;
  /** ロータリーの中心と、車が回る半径 */
  circles: Map<string, { at: Vec2; radius: number }>;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function polyline(road: RoadPath): Vec2[] {
  const first = road.points[0];
  return road.closed && first !== undefined ? [...road.points, first] : [...road.points];
}

/** 点列の各点までの距離 */
function running(points: readonly Vec2[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    out.push((out[i - 1] ?? 0) + (a === undefined || b === undefined ? 0 : distance(a, b)));
  }
  return out;
}

/** 点列を距離 from..to の所で切り出す */
function slice(points: readonly Vec2[], marks: readonly number[], from: number, to: number): Vec2[] {
  const at = (d: number): Vec2 => {
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const m0 = marks[i - 1] ?? 0;
      const m1 = marks[i] ?? 0;
      if (a === undefined || b === undefined || d > m1) continue;
      const f = m1 - m0 < 1e-9 ? 0 : (d - m0) / (m1 - m0);
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    }
    return points[points.length - 1] ?? { x: 0, z: 0 };
  };
  const out = [at(from)];
  for (let i = 0; i < points.length; i += 1) {
    const m = marks[i] ?? 0;
    const p = points[i];
    if (p !== undefined && m > from + 1e-6 && m < to - 1e-6) out.push(p);
  }
  out.push(at(to));
  return out;
}

/** 2 本の線分が交わる所。道の始点からの距離も返す */
function crossings(a: readonly Vec2[], am: readonly number[], b: readonly Vec2[], bm: readonly number[]) {
  const found: { at: Vec2; da: number; db: number }[] = [];
  for (let i = 1; i < a.length; i += 1) {
    const a1 = a[i - 1];
    const a2 = a[i];
    if (a1 === undefined || a2 === undefined) continue;
    for (let j = 1; j < b.length; j += 1) {
      const b1 = b[j - 1];
      const b2 = b[j];
      if (b1 === undefined || b2 === undefined) continue;
      const d = (a2.x - a1.x) * (b2.z - b1.z) - (a2.z - a1.z) * (b2.x - b1.x);
      if (Math.abs(d) < 1e-9) continue;
      const t = ((b1.x - a1.x) * (b2.z - b1.z) - (b1.z - a1.z) * (b2.x - b1.x)) / d;
      const u = ((b1.x - a1.x) * (a2.z - a1.z) - (b1.z - a1.z) * (a2.x - a1.x)) / d;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      found.push({
        at: { x: a1.x + (a2.x - a1.x) * t, z: a1.z + (a2.z - a1.z) * t },
        da: (am[i - 1] ?? 0) + t * distance(a1, a2),
        db: (bm[j - 1] ?? 0) + u * distance(b1, b2),
      });
    }
  }
  return found;
}

/** 車が通れる道の網を作る。塞がれた道と、何も通っていない道は入れない */
export function trafficGraph(network: RoadNetwork): TrafficGraph {
  const roads = network.roads.filter((r) => r.active && !r.blocked && r.points.length >= 2);
  const lines = roads.map(polyline);
  const marks = lines.map(running);
  const stops: Stop[][] = roads.map(() => []);
  const circles = new Map<string, { at: Vec2; radius: number }>();
  network.roundabouts.forEach((circle, k) => {
    circles.set(`r:${String(k)}`, { at: circle.at, radius: circle.radius - circle.laneWidth / 2 });
  });

  // 道の端。同じ所で終わる道どうし、同じロータリーに付く道どうしは、同じ端を共有する
  const endNode = (at: Vec2, width: number): string => {
    const k = network.roundabouts.findIndex((c) => Math.abs(distance(at, c.at) - c.radius) < width + 2);
    if (k >= 0) return `r:${String(k)}`;
    return `e:${String(Math.round(at.x / 4))},${String(Math.round(at.z / 4))}`;
  };
  roads.forEach((road, i) => {
    const line = lines[i] ?? [];
    const total = marks[i]?.[line.length - 1] ?? 0;
    const first = line[0];
    const last = line[line.length - 1];
    if (first === undefined || last === undefined) return;
    stops[i]?.push({ at: 0, node: endNode(first, road.width) });
    stops[i]?.push({ at: total, node: road.closed ? endNode(first, road.width) : endNode(last, road.width) });
  });

  // 交差点。2 本の道の組ごとに 1 度だけ求め、両方の道に同じ名前で刻む
  let serial = 0;
  for (let i = 0; i < roads.length; i += 1) {
    for (let j = i + 1; j < roads.length; j += 1) {
      for (const hit of crossings(lines[i] ?? [], marks[i] ?? [], lines[j] ?? [], marks[j] ?? [])) {
        const node = `j:${String(serial)}`;
        serial += 1;
        stops[i]?.push({ at: hit.da, node });
        stops[j]?.push({ at: hit.db, node });
      }
    }
  }

  const edges: Edge[] = [];
  const out = new Map<string, { edge: number; forward: boolean }[]>();
  const link = (node: string, edge: number, forward: boolean) => {
    const list = out.get(node);
    if (list === undefined) out.set(node, [{ edge, forward }]);
    else list.push({ edge, forward });
  };
  roads.forEach((_, i) => {
    const line = lines[i] ?? [];
    const mark = marks[i] ?? [];
    const sorted = [...(stops[i] ?? [])].sort((p, q) => p.at - q.at);
    // 近すぎる区切りは 1 つにまとめる（交差点のすぐ脇に道の端がある所など）
    const merged: Stop[] = [];
    for (const stop of sorted) {
      const prev = merged[merged.length - 1];
      if (prev !== undefined && stop.at - prev.at < 1) {
        if (prev.node.startsWith('e:')) merged[merged.length - 1] = { at: prev.at, node: stop.node };
        continue;
      }
      merged.push(stop);
    }
    for (let k = 1; k < merged.length; k += 1) {
      const a = merged[k - 1];
      const b = merged[k];
      if (a === undefined || b === undefined || a.node === b.node) continue;
      const index = edges.length;
      edges.push({ a: a.node, b: b.node, points: slice(line, mark, a.at, b.at) });
      link(a.node, index, true);
      link(b.node, index, false);
    }
  });
  return { edges, out, circles };
}

/** 区間を向き付きでたどった点列 */
function pointsOf(graph: TrafficGraph, leg: { edge: number; forward: boolean }): Vec2[] {
  const points = graph.edges[leg.edge]?.points ?? [];
  return leg.forward ? points : [...points].reverse();
}

function endOf(graph: TrafficGraph, leg: { edge: number; forward: boolean }): string {
  const edge = graph.edges[leg.edge];
  return (leg.forward ? edge?.b : edge?.a) ?? '';
}

function startOf(graph: TrafficGraph, leg: { edge: number; forward: boolean }): string {
  const edge = graph.edges[leg.edge];
  return (leg.forward ? edge?.a : edge?.b) ?? '';
}

/** ある端から別の端への、区間の数がいちばん少ない道 */
function shortest(graph: TrafficGraph, from: string, to: string): { edge: number; forward: boolean }[] | null {
  if (from === to) return [];
  const came = new Map<string, { node: string; leg: { edge: number; forward: boolean } }>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const node = queue.shift() ?? '';
    for (const leg of graph.out.get(node) ?? []) {
      const next = endOf(graph, leg);
      if (seen.has(next)) continue;
      seen.add(next);
      came.set(next, { node, leg });
      if (next === to) {
        const path: { edge: number; forward: boolean }[] = [];
        let at = to;
        while (at !== from) {
          const step = came.get(at);
          if (step === undefined) return null;
          path.unshift(step.leg);
          at = step.node;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/** ロータリーを反時計回りに回る弧。入った所から出る所まで */
function arc(circle: { at: Vec2; radius: number }, from: Vec2, to: Vec2): Vec2[] {
  const a0 = Math.atan2(from.z - circle.at.z, from.x - circle.at.x);
  let a1 = Math.atan2(to.z - circle.at.z, to.x - circle.at.x);
  while (a1 <= a0) a1 += Math.PI * 2;
  const steps = Math.max(2, Math.ceil(((a1 - a0) * circle.radius) / 4));
  const out: Vec2[] = [];
  for (let i = 1; i < steps; i += 1) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push({ x: circle.at.x + Math.cos(a) * circle.radius, z: circle.at.z + Math.sin(a) * circle.radius });
  }
  return out;
}

/**
 * 1 台ぶんの道すじ。区間 `edge` から走り出し、交差点ごとに曲がる先を選んで、
 * 最後は出発点へ戻って輪にする。返す点列は閉じている（最初と最後が同じ所）。
 */
export function routeFrom(graph: TrafficGraph, edge: number, seed: number, legs = 10): Vec2[] {
  const rng = stream(seed);
  const first = { edge, forward: rng.chance(0.5) };
  const route = [first];
  for (let i = 0; i < legs; i += 1) {
    const last = route[route.length - 1] ?? first;
    const node = endOf(graph, last);
    const options = (graph.out.get(node) ?? []).filter((o) => o.edge !== last.edge);
    // 行き止まりでは引き返す。そうでなければ、来た道以外から選ぶ
    const pick = options.length === 0 ? { edge: last.edge, forward: !last.forward } : rng.pick(options);
    route.push(pick);
    if (endOf(graph, pick) === startOf(graph, first)) break;
  }
  const home = shortest(graph, endOf(graph, route[route.length - 1] ?? first), startOf(graph, first));
  // 戻る道が無い（網が切れている）ときは、来た道を引き返して輪にする
  route.push(...(home ?? [...route].reverse().map((leg) => ({ edge: leg.edge, forward: !leg.forward }))));

  const points: Vec2[] = [];
  route.forEach((leg, i) => {
    const along = pointsOf(graph, leg);
    const start = along[0];
    const prev = points[points.length - 1];
    // ロータリーを通って別の道へ移るときは、環道に沿って回る
    const node = startOf(graph, leg);
    const circle = graph.circles.get(node);
    if (i > 0 && circle !== undefined && prev !== undefined && start !== undefined && distance(prev, start) > 2) {
      points.push(...arc(circle, prev, start));
    }
    for (const point of along) {
      const tail = points[points.length - 1];
      if (tail !== undefined && distance(tail, point) < 0.05) continue;
      points.push(point);
    }
  });
  const head = points[0];
  if (head !== undefined) points.push(head);
  return points;
}

/** 時間を進めた直後、街の動きが速くなっている長さ（秒） */
export const RUSH_SECONDS = 3;
/** 時間を進めた直後の速さの倍率 */
export const RUSH_PACE = 4;

/**
 * 街の車と人の速さの倍率（REWORK 7-3）。
 * `kubectl wait` などで模型の時間を進めると、その直後だけ車と人が速く動き、だんだん元に戻る。
 * 「いま時間が進んだ」ことを、街の動きで見せるため。`since` は時間を進めてからの秒数。
 */
export function paceAfter(since: number | null): number {
  if (since === null || since < 0 || since >= RUSH_SECONDS) return 1;
  return 1 + (RUSH_PACE - 1) * (1 - since / RUSH_SECONDS);
}
