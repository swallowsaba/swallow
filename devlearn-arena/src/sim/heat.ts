import { cellKindAt, facilityCells } from '@/city/cells';
import { COVERAGE_KINDS } from '@/city/facilities';
import { parkAt, serviceAt } from './land';
import { adultsOf, LAYERS, sizeOf } from './layers';
import { facilityPowerDistrict, stoppedNow } from './power';
import { CELLS, DISTRICT_COUNT, indexOf, inMap, SIZE } from './space';
import type { World } from './types';
import type { WeekView } from './week';

/**
 * ヒートマップの値（docs/game-design.md 14 章・docs/ui-design.md 11.1）。
 * 毎週の計算の途中の値（WeekView）から、マスごとの値を作る。値の無いマスは NaN。
 * Worker は週に 1 回これを作って画面へ移し（写さない）、画面は画面の外の Canvas に 1 回だけ塗る（docs/architecture.md 9.3）。
 */

export const HEAT_KINDS = ['land', 'rent', 'density', 'noise', 'jobs', 'service', 'police', 'fire', 'school', 'clinic', 'park', 'power', 'approval'] as const;
export type HeatKind = (typeof HEAT_KINDS)[number];

/** 公共サービスの行き届きの 5 種（平均 service はこの 5 つの平均。docs/game-design.md 14 章） */
export const SERVICE_HEAT = [...COVERAGE_KINDS, 'park'] as const satisfies readonly HeatKind[];
export type ServiceHeat = (typeof SERVICE_HEAT)[number];

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
  return { week: world.sim.week, cells: { land, rent, density, noise, jobs, approval, ...serviceHeat(view, mask), power: powerHeat(world, view) }, jobless };
}

/**
 * 公共サービスの行き届き（0〜100%）: 道路に面した陸のマス（行き届きは道路で届くので、道路に面していないマスには塗らない）に、
 * 面する道路の行き届き × 定員の余り（住民の満足と同じ値。24.2）。平均は 5 種（警察・消防・学校・診療所・公園）の平均
 */
function serviceHeat(view: WeekView, mask: Uint8Array): Record<ServiceHeat | 'service', Float32Array> {
  const out = { police: blank(), fire: blank(), school: blank(), clinic: blank(), park: blank(), service: blank() };
  for (let i = 0; i < CELLS; i += 1) {
    if (!mask[i] || view.space.roadKind[i] !== -1) continue;
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    if (!facesRoad(view, x, y)) continue;
    let sum = 0;
    for (const kind of COVERAGE_KINDS) {
      const sv = serviceAt(view.field, kind, x, y);
      const v = sv.value > 0 ? sv.value * (sv.src >= 0 ? view.capFactor(sv.src) : 1) * 100 : 0;
      out[kind][i] = v;
      sum += v;
    }
    const park = parkAt(view.field, x, y).value * 100;
    out.park[i] = park;
    out.service[i] = (sum + park) / SERVICE_HEAT.length;
  }
  return out;
}

const facesRoad = (view: WeekView, x: number, y: number): boolean =>
  (x > 0 && view.space.roadKind[indexOf(x - 1, y)] !== -1) || (x < SIZE - 1 && view.space.roadKind[indexOf(x + 1, y)] !== -1)
  || (y > 0 && view.space.roadKind[indexOf(x, y - 1)] !== -1) || (y < SIZE - 1 && view.space.roadKind[indexOf(x, y + 1)] !== -1);

/** 電力（docs/city-design.md 9.4）: 建物と施設のマスに、来ていれば 1、今の週に止まった地区なら 0 */
function powerHeat(world: Pick<World, 'sim'>, view: WeekView): Float32Array {
  const out = blank();
  const stopped = stoppedNow(world.sim.power);
  for (const zb of [...view.space.residential, ...view.space.workplaces]) out[zb.cell] = stopped.has(zb.district) ? 0 : 1;
  for (const af of [...view.space.facilities, ...view.space.civic]) {
    const v = stopped.has(facilityPowerDistrict(af.facility)) ? 0 : 1;
    for (const c of facilityCells(af.facility)) if (inMap(c.x, c.y)) out[indexOf(c.x, c.y)] = v;
  }
  return out;
}

/** 移す（transfer）物の一覧 */
export function heatBuffers(h: HeatFields): ArrayBuffer[] {
  return [...Object.values(h.cells).map((a) => a.buffer as ArrayBuffer), h.jobless.buffer as ArrayBuffer];
}
