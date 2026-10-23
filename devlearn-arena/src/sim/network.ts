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
  /** 出る地区 → マスごとの 1 つ前のマス（道のりをたどる）。−1 は出発のマス */
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
  pop(): [number, number] {
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
    return [topK, topV];
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
  const minutes = new Float32Array(DISTRICT_COUNT * DISTRICT_COUNT).fill(Infinity);
  const arrive = new Int32Array(DISTRICT_COUNT * DISTRICT_COUNT).fill(-1);
  const parents = new Map<number, Int32Array>();
  // 64 ビットで持つ（32 ビットに丸めると、取り出した値が持っている値より大きくなり、先へ進まないことがある）
  const dist = new Float64Array(CELLS);
  for (let from = 0; from < DISTRICT_COUNT; from += 1) {
    const sources = districtRoads[from] as number[];
    if (sources.length === 0) continue;
    dist.fill(Infinity);
    const parent = new Int32Array(CELLS).fill(-2);
    const heap = new Heap();
    for (const s of sources) {
      dist[s] = 0;
      parent[s] = -1;
      heap.push(0, s);
    }
    while (heap.size > 0) {
      const [d, i] = heap.pop();
      if (d > (dist[i] as number)) continue;
      const x = i % SIZE;
      const y = Math.floor(i / SIZE);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inMap(nx, ny)) continue;
        const j = indexOf(nx, ny);
        const m = cellMinutes[j] as number;
        if (m === 0) continue;
        const nd = d + m;
        if (nd < (dist[j] as number)) {
          dist[j] = nd;
          parent[j] = i;
          heap.push(nd, j);
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
        const d = dist[c] as number;
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
  return { key, cellMinutes, districtRoads, minutes, arrive, parents, pairsByTime: Int32Array.from(pairs) };
}

/** 出る地区から着く地区への道のり（マスの番号。着くマスから出発のマスへ向かう順） */
export function pathOf(net: Network, from: number, to: number): number[] {
  const p = from * DISTRICT_COUNT + to;
  if (from === to) return [];
  const parent = net.parents.get(from);
  let at = net.arrive[p] ?? -1;
  if (!parent || at < 0) return [];
  const out: number[] = [];
  while (at >= 0) {
    out.push(at);
    at = parent[at] ?? -1;
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
