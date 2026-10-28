import { pathOf, type Network } from './network';
import { ROAD_CAPACITY } from './rules';
import { CELLS, DISTRICT_COUNT, ROAD_KINDS, type Space } from './space';

/**
 * 雇用と通勤（docs/game-design.md 13.6）。
 * 働く人を、収入の帯の合う仕事に、近い順（道路の時間）に入れる。地区から地区への流れで計算する。
 * 通勤時間 = 道のりの各マスの時間 × 混み具合（道路の流れ ÷ 容量。1 を超えた分だけ延びる）
 */

export interface Flow {
  from: number;
  to: number;
  band: number;
  people: number;
}

export interface Commute {
  flows: Flow[];
  /** [地区 × 3 + 帯] 仕事に就いた人 */
  employed: Float64Array;
  /** [地区 × 3 + 帯] 埋まった仕事の割合（0〜1） */
  fill: Float64Array;
  /** [地区 × 3 + 帯] 失業率（働く人がいなければ 0） */
  unemployment: Float64Array;
  /** 地区ごとの平均の通勤時間（分）。通勤する人がいなければ、一番近い仕事までの時間。仕事に着けなければ Infinity */
  minutes: Float32Array;
  /** 道路のマスごとの通勤の流れ（交通の表示と混み具合） */
  traffic: Float32Array;
}

/**
 * workers・jobs: [地区 × 3 + 帯] の働く人と仕事の数
 * trafficWeight: [地区] 行き先の地区の、道路に出る流れの倍率（譲歩の traffic。駐車場を増やす・送迎の車を出す。無ければ 1）
 * bus: [地区] 住む地区から通う人の通勤の時間の倍率（受理した請願のバス。docs/content-spec.md 7.3。無ければ 1）
 */
export function commuteOf(space: Space, net: Network, workers: Float64Array, jobs: Float64Array, trafficWeight?: Float64Array, bus?: Float64Array): Commute {
  const n = DISTRICT_COUNT;
  const needWork = Float64Array.from(workers);
  const openJobs = Float64Array.from(jobs);
  const employed = new Float64Array(n * 3);
  const flows: Flow[] = [];
  // 時間の短い組から順に、帯ごとに埋める（同じ時間は組の番号の順。乱数を使わない）
  for (let k = 0; k < net.pairsByTime.length; k += 1) {
    const p = net.pairsByTime[k] as number;
    const from = Math.floor(p / n);
    const to = p % n;
    for (let band = 0; band < 3; band += 1) {
      const a = needWork[from * 3 + band] as number;
      const b = openJobs[to * 3 + band] as number;
      if (a <= 0 || b <= 0) continue;
      const people = Math.min(a, b);
      needWork[from * 3 + band] = a - people;
      openJobs[to * 3 + band] = b - people;
      employed[from * 3 + band] = (employed[from * 3 + band] as number) + people;
      flows.push({ from, to, band, people });
    }
  }
  // 道路の流れ（道のりの各マスに、通る人を足す）
  const traffic = new Float32Array(CELLS);
  const paths = new Map<number, number[]>();
  const pathFor = (from: number, to: number): number[] => {
    const key = from * n + to;
    let hit = paths.get(key);
    if (!hit) {
      hit = pathOf(net, from, to);
      paths.set(key, hit);
    }
    return hit;
  };
  for (const f of flows) {
    const people = f.people * (trafficWeight ? (trafficWeight[f.to] as number) : 1);
    for (const c of pathFor(f.from, f.to)) traffic[c] = (traffic[c] as number) + people;
  }
  // 混み具合を入れた時間（同じ地区の中は、混んでいない時の時間のまま）
  const congested = (from: number, to: number): number => {
    if (from === to) return net.minutes[from * n + to] as number;
    let t = 0;
    for (const c of pathFor(from, to)) {
      const cap = ROAD_CAPACITY[ROAD_KINDS[space.roadKind[c] as number] ?? 'lane'];
      t += (net.cellMinutes[c] as number) * Math.max(1, (traffic[c] as number) / cap);
    }
    return t;
  };
  const sum = new Float64Array(n);
  const people = new Float64Array(n);
  for (const f of flows) {
    sum[f.from] = (sum[f.from] as number) + congested(f.from, f.to) * f.people;
    people[f.from] = (people[f.from] as number) + f.people;
  }
  const minutes = new Float32Array(n).fill(Infinity);
  const anyJobs = jobs.some((j) => j > 0);
  for (let d = 0; d < n; d += 1) {
    const k = bus ? (bus[d] as number) : 1;
    if ((people[d] as number) > 0) {
      minutes[d] = ((sum[d] as number) / (people[d] as number)) * k;
      continue;
    }
    if (!anyJobs) continue;
    // 通勤する人がいない地区: 仕事のある一番近い地区までの時間（住んだら、どれだけかかるか）
    let best = Infinity;
    for (let to = 0; to < n; to += 1) {
      const t = net.minutes[d * n + to] as number;
      if (t < best && ((jobs[to * 3] as number) + (jobs[to * 3 + 1] as number) + (jobs[to * 3 + 2] as number)) > 0) best = t;
    }
    minutes[d] = best * k;
  }
  const fill = new Float64Array(n * 3);
  const unemployment = new Float64Array(n * 3);
  for (let i = 0; i < n * 3; i += 1) {
    const j = jobs[i] as number;
    fill[i] = j > 0 ? (j - (openJobs[i] as number)) / j : 0;
    const w = workers[i] as number;
    unemployment[i] = w > 0 ? (needWork[i] as number) / w : 0;
  }
  return { flows, employed, fill, unemployment, minutes, traffic };
}
