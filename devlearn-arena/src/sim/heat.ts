import { cellKindAt, facilityCells } from '@/city/cells';
import { adultsOf, LAYERS, sizeOf } from './layers';
import { CELLS, DISTRICT_COUNT, indexOf, inMap } from './space';
import type { World } from './types';
import type { WeekView } from './week';

/**
 * ヒートマップの値（docs/game-design.md 14 章・docs/ui-design.md 11.1）。
 * 毎週の計算の途中の値（WeekView）から、マスごとの値を作る。値の無いマスは NaN。
 * Worker は週に 1 回これを作って画面へ移し（写さない）、画面は画面の外の Canvas に 1 回だけ塗る（docs/architecture.md 9.3）。
 */

export const HEAT_KINDS = ['land', 'rent', 'density', 'noise', 'jobs', 'approval'] as const;
export type HeatKind = (typeof HEAT_KINDS)[number];

export interface HeatFields {
  /** どの週の値か */
  week: number;
  /** マスごとの値（96×96。値の無いマスは NaN） */
  cells: Record<HeatKind, Float32Array>;
  /** 住宅のマス → その住民の地区の失業率（0〜1）。雇用のヒートマップで、住宅を指した時に出す */
  jobless: Float32Array;
}

/** 地価と騒音を塗る陸のマス（地形ごとに 1 回） */
const landCache = new WeakMap<object, Uint8Array>();
function landMask(view: WeekView): Uint8Array {
  const t = view.space.terrain;
  const hit = landCache.get(t);
  if (hit) return hit;
  const out = new Uint8Array(CELLS);
  for (let i = 0; i < CELLS; i += 1) {
    const k = cellKindAt(t, i % t.size, Math.floor(i / t.size));
    if (k === 'land') out[i] = 1;
  }
  landCache.set(t, out);
  return out;
}

const blank = (): Float32Array => new Float32Array(CELLS).fill(NaN);

export function heatOf(world: World, view: WeekView): HeatFields {
  const land = blank();
  const noise = blank();
  const rent = blank();
  const density = blank();
  const jobs = blank();
  const approval = blank();
  const mask = landMask(view);
  for (let i = 0; i < CELLS; i += 1) {
    if (!mask[i] || view.space.roadKind[i] !== -1) continue;
    land[i] = view.field.land[i] as number;
    noise[i] = view.field.noise[i] as number;
  }
  for (const zb of view.space.residential) {
    const hh = world.sim.households[zb.building.id];
    const r = view.rent.get(zb.building.id);
    if (r) rent[zb.cell] = r.rent;
    if (!hh) continue;
    let people = 0;
    let s = 0;
    let w = 0;
    const support = world.sim.support[zb.district] ?? [];
    for (const l of LAYERS) {
      const n = hh[l] as number;
      people += n * sizeOf(l);
      const sup = support[l] as number;
      if (n > 0 && sup >= 0) {
        s += n * adultsOf(l) * sup;
        w += n * adultsOf(l);
      }
    }
    density[zb.cell] = people;
    if (w > 0) approval[zb.cell] = s / w;
  }
  for (const e of view.employers) {
    const total = e.slots[0] + e.slots[1] + e.slots[2];
    if (e.place) {
      jobs[e.place.cell] = total;
    } else if (e.facility) {
      const cells = facilityCells(e.facility.facility);
      for (const c of cells) if (inMap(c.x, c.y)) jobs[indexOf(c.x, c.y)] = total / cells.length;
    }
  }
  const unemployment = new Float32Array(DISTRICT_COUNT);
  const jobless = blank();
  for (let d = 0; d < DISTRICT_COUNT; d += 1) {
    let employed = 0;
    let all = 0;
    for (let b = 0; b < 3; b += 1) {
      employed += view.commute.employed[d * 3 + b] as number;
      all += view.workers[d * 3 + b] as number;
    }
    unemployment[d] = all > 0 ? 1 - employed / all : 0;
  }
  for (const zb of view.space.residential) jobless[zb.cell] = unemployment[zb.district] as number;
  return { week: world.sim.week, cells: { land, rent, density, noise, jobs, approval }, jobless };
}

/** 移す（transfer）物の一覧 */
export function heatBuffers(h: HeatFields): ArrayBuffer[] {
  return [...Object.values(h.cells).map((a) => a.buffer as ArrayBuffer), h.jobless.buffer as ArrayBuffer];
}
