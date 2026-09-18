import { planTown, stretchTown, type PlannedLot, type PlanDistrict, type TownPlan } from '@/engines/cityscape';
import type { CivicView, SceneMapInput, TownGrowth } from './isoScene';

/**
 * 街全体の割り付け。
 *
 * 上町（市民施設の街区と住宅街）と、下町（いまの任務の現場）を、ひと続きの碁盤の目として置く。
 * 帯を縦に積むのをやめ、どちらも街区と通りで組んだ街にして、大通りで背中合わせにつなぐ。
 */

/** 市民施設の通りの列数。順に読めるよう左上から右へ並べる */
const CIVIC_COLS = 6;
/** 1 つの住宅街区に入る家の数 */
const HOMES_PER_BLOCK = 9;
/** 家が無くても用意しておく住宅街区の数（街の伸びしろを見せる） */
const MIN_HOME_BLOCKS = 2;

export interface TownLayout {
  /** 上町（市民施設・住宅）の割り付け */
  uptown: TownPlan;
  /** 下町（現場）の割り付け。上町と幅をそろえてある */
  site: TownPlan;
  /** 下町を描くときの縦のずれ */
  siteY: number;
  width: number;
  height: number;
  /** 市民施設 id → その区画 */
  civicLot: Map<string, PlannedLot>;
  /** 住宅。区画と、積み上げた階数 */
  houses: { id: string; x: number; y: number; w: number; d: number; level: number }[];
}

/** 家ごとの階数。積み上げた階を家に均等に配る */
export function houseLevels(growth: TownGrowth): number[] {
  const houses = Math.max(0, growth.houses);
  if (houses === 0) return [];
  const base = Math.floor(growth.floors / houses);
  const extra = growth.floors % houses;
  return Array.from({ length: houses }, (_, i) => Math.min(5, 1 + base + (i < extra ? 1 : 0)));
}

/** 市民施設と住宅から、上町の地区を組み立てる */
function uptownDistricts(civic: readonly CivicView[], levels: readonly number[]): PlanDistrict[] {
  const districts: PlanDistrict[] = [
    {
      id: 'civic',
      tone: 'accent',
      order: 'rows',
      cols: CIVIC_COLS,
      members: civic.map((f) => `civic:${f.id}`),
      min: Math.max(civic.length, CIVIC_COLS),
    },
  ];
  const blocks = Math.max(MIN_HOME_BLOCKS, Math.ceil(levels.length / HOMES_PER_BLOCK));
  for (let i = 0; i < blocks; i += 1) {
    const slice = levels.slice(i * HOMES_PER_BLOCK, (i + 1) * HOMES_PER_BLOCK);
    districts.push({
      id: `homes:${String(i)}`,
      tone: 'ok',
      order: 'rows',
      cols: 3,
      members: slice.map((_, k) => `home:${String(i * HOMES_PER_BLOCK + k)}`),
      min: HOMES_PER_BLOCK,
    });
  }
  return districts;
}

export function townLayout(input: SceneMapInput): TownLayout {
  const levels = houseLevels(input.growth);
  const planned = planTown(uptownDistricts(input.civic, levels));
  // 上町と下町で大通りの長さをそろえ、街の道を端から端までつなげる
  const width = Math.max(planned.width, input.scene.plan.width);
  const uptown = stretchTown(planned, width);
  const site = stretchTown(input.scene.plan, width);

  const civicLot = new Map<string, PlannedLot>();
  for (const f of input.civic) {
    const lot = uptown.lots.get(`civic:${f.id}`);
    if (lot) civicLot.set(f.id, lot);
  }
  const houses = levels.flatMap((level, i) => {
    const lot = uptown.lots.get(`home:${String(i)}`);
    return lot ? [{ id: `home:${String(i)}`, x: lot.x, y: lot.y, w: lot.w, d: lot.d, level }] : [];
  });

  // 上町の下端の大通りと、下町の上端の大通りが背中合わせになって 1 本の広い大通りになる
  const siteY = uptown.height;
  return {
    uptown,
    site,
    siteY,
    width,
    height: siteY + site.height,
    civicLot,
    houses,
  };
}
