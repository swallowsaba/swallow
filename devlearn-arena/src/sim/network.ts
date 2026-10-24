import { ROAD_SPEED, SAME_DISTRICT_CELLS } from './rules';
import { CELLS, DISTRICT_COUNT, districtOfIndex, indexOf, inMap, NEIGHBORS, ROAD_KINDS, SIZE, type Space } from './space';

/**
 * 道路の網と、地区から地区への道のりの時間（docs/game-design.md 13.6・docs/architecture.md 9.3）。
 * 地区ごとに、その地区の道路のマスから幅優先（重みつき）に探す。道路が変わった週だけ計算し直す（同じ道路なら使い回す）。
 */

export interface Network {
  /** 道路の形の指紋（使い回しの判定） */
  key: string;
  /** マス → 1 マスを通る分（道路でなければ 0） */
  cellMinutes: Float32Array;
  /** 地区 → その地区の道路のマス */
  districtRoads: number[][];
  /** [出る地区 × 144 + 着く地区] 混んでいない時の時間（分）。着けなければ Infinity */
  minutes: Float32Array;
  /** [出る地区 × 144 + 着く地区] 着く地区のうち、一番早く着くマス（道のりをたどる） */
  arrive: Int32Array;
  /** 道路のマスの番号（詰めた番号 → マス） */
  roads: Int32Array;
  /** マス → 道路のマスの詰めた番号（道路でなければ −1） */
  roadIndex: Int32Array;
  /** 出る地区 → 道路のマスごとの 1 つ前の道路のマス（詰めた番号。道のりをたどる）。−1 は出発のマス */
  parents: Map<number, Int32Array>;
  /** 時間の短い順に並べた、着ける地区の組（出る地区 × 144 + 着く地区） */
  pairsByTime: Int32Array;
}

/** 重みつきの最短の道のり（小さな二分ヒープ） */
class Heap {
  private readonly keys: number[] = [];
  private readonly vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((k[p] as number) <= key) break;
      k[i] = k[p] as number;
      v[i] = v[p] as number;
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  /** 最後に取り出した鍵（pop が組を作らないように、鍵はここに置く） */
  key = 0;
  /** 一番小さい鍵の値を取り出す（鍵は this.key） */
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const topK = k[0] as number;
    const topV = v[0] as number;
    const lastK = k.pop() as number;
    const lastV = v.pop() as number;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && (k[r] as number) < (k[l] as number) ? r : l;
        if ((k[c] as number) >= lastK) break;
        k[i] = k[c] as number;
        v[i] = v[c] as number;
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    this.key = topK;
    return topV;
  }
}

function keyOf(space: Space): string {
  let h = 2166136261;
  for (const i of space.roadCells) {
    h ^= i * 8 + (space.roadKind[i] ?? 0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${String(space.roadCells.length)}:${String(h)}`;
}

let cached: Network | null = null;

/** 使い回しを捨てる（性能の計測で、道路が変わった週の時間を測る） */
export function resetNetworkCache(): void {
  cached = null;
}

/** 道路の網。前と同じ道路なら、前の計算を使い回す */
export function networkOf(space: Space): Network {
  const key = keyOf(space);
  if (cached?.key === key) return cached;
  cached = buildNetwork(space, key);
  return cached;
}

function buildNetwork(space: Space, key: string): Network {
  const cellMinutes = new Float32Array(CELLS);
  const districtRoads: number[][] = Array.from({ length: DISTRICT_COUNT }, () => []);
  for (const i of space.roadCells) {
    cellMinutes[i] = 1 / ROAD_SPEED[ROAD_KINDS[space.roadKind[i] as number] ?? 'lane'];
    districtRoads[districtOfIndex(i)]?.push(i);
  }
  // 探すのは道路のマスだけ（地図の全てのマスの配列を地区ごとに作らない）。隣は NEIGHBORS の順に並べる（同じ順に探す）
  const roads = Int32Array.from(space.roadCells);
  const count = roads.length;
  const roadIndex = new Int32Array(CELLS).fill(-1);
  for (let r = 0; r < count; r += 1) roadIndex[roads[r] as number] = r;
  const sides = NEIGHBORS.length;
  const next = new Int32Array(count * sides).fill(-1);
  const cost = new Float64Array(count);
  for (let r = 0; r < count; r += 1) {
    const i = roads[r] as number;
    cost[r] = cellMinutes[i] as number;
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    for (let n = 0; n < sides; n += 1) {
      const nb = NEIGHBORS[n] as readonly [number, number];
      const nx = x + nb[0];
      const ny = y + nb[1];
      if (!inMap(nx, ny)) continue;
      const j = indexOf(nx, ny);
      if ((cellMinutes[j] as number) === 0) continue;
      next[r * sides + n] = roadIndex[j] as number;
    }
  }
  const minutes = new Float32Array(DISTRICT_COUNT * DISTRICT_COUNT).fill(Infinity);
  const arrive = new Int32Array(DISTRICT_COUNT * DISTRICT_COUNT).fill(-1);
  const parents = new Map<number, Int32Array>();
  // 64 ビットで持つ（32 ビットに丸めると、取り出した値が持っている値より大きくなり、先へ進まないことがある）
  const dist = new Float64Array(count);
  for (let from = 0; from < DISTRICT_COUNT; from += 1) {
    const sources = districtRoads[from] as number[];
    if (sources.length === 0) continue;
    dist.fill(Infinity);
    const parent = new Int32Array(count).fill(-2);
    const heap = new Heap();
    for (const s of sources) {
      const r = roadIndex[s] as number;
      dist[r] = 0;
      parent[r] = -1;
      heap.push(0, r);
    }
    while (heap.size > 0) {
      const r = heap.pop();
      const d = heap.key;
      if (d > (dist[r] as number)) continue;
      for (let n = 0; n < sides; n += 1) {
        const q = next[r * sides + n] as number;
        if (q < 0) continue;
        const nd = d + (cost[q] as number);
        if (nd < (dist[q] as number)) {
          dist[q] = nd;
          parent[q] = r;
          heap.push(nd, q);
        }
      }
    }
    parents.set(from, parent);
    // 同じ地区の中は、道のり 4 マス分（その地区の道路の速さの平均）
    let mean = 0;
    for (const s of sources) mean += cellMinutes[s] as number;
    mean /= sources.length;
    for (let to = 0; to < DISTRICT_COUNT; to += 1) {
      const p = from * DISTRICT_COUNT + to;
      if (to === from) {
        minutes[p] = SAME_DISTRICT_CELLS * mean;
        arrive[p] = sources[0] as number;
        continue;
      }
      let best = Infinity;
      let at = -1;
      for (const c of districtRoads[to] as number[]) {
        const d = dist[roadIndex[c] as number] as number;
        if (d < best) {
          best = d;
          at = c;
        }
      }
      minutes[p] = best;
      arrive[p] = at;
    }
  }
  const pairs: number[] = [];
  for (let p = 0; p < minutes.length; p += 1) if (Number.isFinite(minutes[p])) pairs.push(p);
  pairs.sort((a, b) => (minutes[a] as number) - (minutes[b] as number) || a - b);
  return { key, cellMinutes, districtRoads, minutes, arrive, roads, roadIndex, parents, pairsByTime: Int32Array.from(pairs) };
}

/** 出る地区から着く地区への道のり（マスの番号。着くマスから出発のマスへ向かう順） */
export function pathOf(net: Network, from: number, to: number): number[] {
  const p = from * DISTRICT_COUNT + to;
  if (from === to) return [];
  const parent = net.parents.get(from);
  const end = net.arrive[p] ?? -1;
  if (!parent || end < 0) return [];
  const out: number[] = [];
  let r = net.roadIndex[end] ?? -1;
  while (r >= 0) {
    out.push(net.roads[r] as number);
    r = parent[r] ?? -1;
  }
  return out;
}

/**
 * 道路の上を、出発のマスから max マス以内に届く道路のマス（幅優先。マスの数で数える）。
 * 公園の行き届き（24.2）と、店に通える範囲（13.3）に使う
 */
export function reach(space: Space, starts: readonly number[], max: number): Map<number, number> {
  const out = new Map<number, number>();
  let frontier: number[] = [];
  for (const s of starts) {
    if (!out.has(s)) {
      out.set(s, 0);
      frontier.push(s);
    }
  }
  for (let d = 1; d <= max && frontier.length > 0; d += 1) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % SIZE;
      const y = Math.floor(i / SIZE);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inMap(nx, ny)) continue;
        const j = indexOf(nx, ny);
        if ((space.roadKind[j] ?? -1) < 0 || out.has(j)) continue;
        out.set(j, d);
        next.push(j);
      }
    }
    frontier = next;
  }
  return out;
}
