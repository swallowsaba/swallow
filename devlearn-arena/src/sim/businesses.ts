import { facilityJobs, zoneCapacity } from '@/city/rules';
import type { ZoneKind } from '@/city/types';
import { reach } from './network';
import { facilityPowerDistrict } from './power';
import {
  CLOSE_WEEKS, FACTORY_REVENUE, GROW_FILL, GROW_WEEKS, IT_BONUS_PER_LEVEL, IT_RANGE, JOB_BANDS, OFFICE_REVENUE, REOPEN_WEEKS, SHOP_RANGE,
  TAX_COST, WAGE, type BusinessKind,
} from './rules';
import type { ActiveFacility, Space, ZoneBuilding } from './space';
import type { BusinessState } from './types';

/**
 * 事業者（docs/game-design.md 13.3）。区画の建物（商業・オフィス・工業）と施設が、事業者を持つ。
 * 売上が費用を 4 週続けて上回り、働く人が集まっていれば、高さの段が上がる。8 週続けて下回ると撤退し、建物は空きになる
 * （同じ業種の組で 1 週に 1 つ。赤字の割合の大きい物から）
 */

/** 雇い手（区画の建物の事業者・施設の職員） */
export interface Employer {
  id: string;
  kind: BusinessKind | 'staff';
  district: number;
  /** 帯ごとの働き口 */
  slots: [number, number, number];
  /** 区画の建物（施設なら無い） */
  place?: ZoneBuilding;
  facility?: ActiveFacility;
}

/** 区画の建物の業種（オフィスは、IT 施設から 8 マス以内なら IT 企業） */
export function businessKindOf(kind: Exclude<ZoneKind, 'residential'>, place: ZoneBuilding, facilities: readonly ActiveFacility[]): BusinessKind {
  if (kind === 'commercial') return 'shop';
  if (kind === 'industrial') return 'factory';
  const x = place.building.cell.x + 0.5;
  const y = place.building.cell.y + 0.5;
  return facilities.some((f) => Math.hypot(f.center.x - x, f.center.y - y) <= IT_RANGE) ? 'it' : 'office';
}

const split = (total: number, bands: readonly [number, number, number]): [number, number, number] =>
  [total * bands[0], total * bands[1], total * bands[2]];

/**
 * 建物と事業者を合わせる: 新しい建物に事業者を入れ（撤退して 8 週たたない建物には入れない）、無くなった建物の事業者を消す。
 * 返すのは、今週の雇い手の一覧と、合わせた後の事業者
 */
export function employersOf(space: Space, businesses: Record<string, BusinessState>, vacant: Record<string, number>, week: number, stopped: ReadonlySet<number> = new Set()): {
  employers: Employer[];
  businesses: Record<string, BusinessState>;
  vacant: Record<string, number>;
} {
  const next: Record<string, BusinessState> = {};
  const nextVacant: Record<string, number> = {};
  const employers: Employer[] = [];
  for (const place of space.workplaces) {
    const id = place.building.id;
    const closedAt = vacant[id];
    if (closedAt !== undefined && week - closedAt < REOPEN_WEEKS) {
      nextVacant[id] = closedAt;
      continue;
    }
    const kind = businessKindOf(place.kind as Exclude<ZoneKind, 'residential'>, place, space.facilities);
    const cur = businesses[id];
    next[id] = cur ? (cur.kind === kind ? cur : { ...cur, kind }) : { kind, workers: [0, 0, 0], profitWeeks: 0 };
    const total = zoneCapacity(place.kind, place.building.level, space.zoneMods.get(place.zoneId));
    employers.push({ id, kind, district: place.district, slots: split(total, JOB_BANDS[kind]), place });
  }
  // 停電した地区の IT 施設は雇用に数えない（docs/game-design.md 24.1。学習には効かない）。公共サービス・発電所・褒賞の建物の職員も雇い手（13.3）
  for (const af of space.facilities) {
    if (stopped.has(facilityPowerDistrict(af.facility))) continue;
    employers.push({ id: af.facility.id, kind: 'staff', district: af.district, slots: split(facilityJobs(af.facility), JOB_BANDS.staff), facility: af });
  }
  // 公共サービス・発電所・褒賞の建物は Lv 1 のまま（譲歩で雇う人を変えた分は数える。docs/content-spec.md 7.1.1）
  for (const af of [...space.civic, ...space.awards]) {
    employers.push({ id: af.facility.id, kind: 'staff', district: af.district, slots: split(facilityJobs({ level: 1, ...(af.facility.mods ? { mods: af.facility.mods } : {}) }), JOB_BANDS.staff), facility: af });
  }
  return { employers, businesses: next, vacant: nextVacant };
}

export interface Sales {
  /** 雇い手 ID → 1 週の売上 */
  revenue: Map<string, number>;
  /** 1 週の費用（働き口 × 賃金 × 税の効き） */
  cost: Map<string, number>;
}

const slotsOf = (e: Employer): number => e.slots[0] + e.slots[1] + e.slots[2];

/**
 * 売上と費用。
 * - 店: 道路で 10 マス以内の住民の買い物（Σ 世帯 × 月の収入（万円）× 0.02）を、そこへ通える店で働き口の比で分ける
 * - 事務所: (20 + 技術力 × 15 + 人口 × 0.05) × 2.2 を、事務所と IT 企業の働き口で分ける
 * - IT 企業: 事務所と同じ分け前に、8 マス以内の IT 施設の Lv の合計 × 0.1 の割り増し
 * - 工場・倉庫: 道路網の大きさ × 0.5 × 2.2 を、工場の働き口で分ける
 * homeSpending: 道路のマス → そこに面する住宅の住民の買い物の量
 */
/**
 * noiseLimit: 工業の建物 ID → 騒音の倍率。受理した請願で騒音を抑えた工場は、売上も同じ割合で下がる（docs/content-spec.md 7.3）。
 * stopped: 停電している地区。その地区の事業者の売上は 0（docs/game-design.md 24.1）
 */
export function salesOf(space: Space, employers: readonly Employer[], homeSpending: Map<number, number>, techPower: number, population: number, taxRate: number, noiseLimit?: ReadonlyMap<string, number>, stopped?: ReadonlySet<number>): Sales {
  const revenue = new Map<string, number>();
  const cost = new Map<string, number>();
  const taxFactor = 1 + (taxRate - 10) * TAX_COST;
  // 店: 通える道路のマスごとに、店の働き口を数える
  const shops = employers.filter((e) => e.kind === 'shop' && e.place);
  const reached = shops.map((e) => reach(space, [e.place?.front ?? -1].filter((c) => c >= 0), SHOP_RANGE));
  const shopSlotsAt = new Map<number, number>();
  shops.forEach((e, i) => {
    for (const c of (reached[i] as Map<number, number>).keys()) shopSlotsAt.set(c, (shopSlotsAt.get(c) ?? 0) + slotsOf(e));
  });
  shops.forEach((e, i) => {
    let r = 0;
    for (const c of (reached[i] as Map<number, number>).keys()) {
      const spend = homeSpending.get(c) ?? 0;
      if (spend > 0) r += (spend * slotsOf(e)) / (shopSlotsAt.get(c) ?? 1);
    }
    revenue.set(e.id, r);
  });
  const officeSlots = employers.filter((e) => e.kind === 'office' || e.kind === 'it').reduce((s, e) => s + slotsOf(e), 0);
  const officePool = (20 + techPower * 15 + population * 0.05) * OFFICE_REVENUE;
  const factorySlots = employers.filter((e) => e.kind === 'factory').reduce((s, e) => s + slotsOf(e), 0);
  const factoryPool = space.roadCells.length * 0.5 * FACTORY_REVENUE;
  for (const e of employers) {
    if (e.kind === 'staff') continue;
    const slots = slotsOf(e);
    cost.set(e.id, slots * WAGE * taxFactor);
    if (e.kind === 'office' || e.kind === 'it') {
      let r = officeSlots > 0 ? (officePool * slots) / officeSlots : 0;
      if (e.kind === 'it' && e.place) {
        const x = e.place.building.cell.x + 0.5;
        const y = e.place.building.cell.y + 0.5;
        const levels = space.facilities.filter((f) => Math.hypot(f.center.x - x, f.center.y - y) <= IT_RANGE).reduce((s, f) => s + f.facility.level, 0);
        r *= 1 + levels * IT_BONUS_PER_LEVEL;
      }
      revenue.set(e.id, r);
    } else if (e.kind === 'factory') {
      revenue.set(e.id, (factorySlots > 0 ? (factoryPool * slots) / factorySlots : 0) * (noiseLimit?.get(e.id) ?? 1));
    }
  }
  if (stopped && stopped.size > 0) for (const e of employers) if (e.kind !== 'staff' && stopped.has(e.district)) revenue.set(e.id, 0);
  return { revenue, cost };
}

export interface BusinessResult {
  businesses: Record<string, BusinessState>;
  vacant: Record<string, number>;
  /** 段を上げる建物 ID */
  grow: string[];
  /** 撤退した建物 ID */
  closed: string[];
}

/**
 * 売上と費用から、続いた週を数え、成長と撤退を決める。
 * fill: [地区 × 3 + 帯] 埋まった仕事の割合（雇っている人数 = 働き口 × 割合）
 */
export function settleBusinesses(employers: readonly Employer[], businesses: Record<string, BusinessState>, vacant: Record<string, number>, sales: Sales, fill: Float64Array, week: number, levelCap: number): BusinessResult {
  const next: Record<string, BusinessState> = { ...businesses };
  const nextVacant = { ...vacant };
  const grow: string[] = [];
  const closed: string[] = [];
  /** 撤退の候補（業種の組 → 赤字の割合の大きい順に 1 つ） */
  const leaving = new Map<string, { id: string; ratio: number }>();
  for (const e of employers) {
    const cur = next[e.id];
    if (!cur || !e.place) continue;
    const workers = e.slots.map((s, b) => s * (fill[e.district * 3 + b] as number));
    const r = sales.revenue.get(e.id) ?? 0;
    const c = sales.cost.get(e.id) ?? 0;
    const profitWeeks = r > c ? Math.max(0, cur.profitWeeks) + 1 : Math.min(0, cur.profitWeeks) - 1;
    const slots = slotsOf(e);
    const filled = slots > 0 ? workers.reduce((s, w) => s + w, 0) / slots : 0;
    if (profitWeeks <= -CLOSE_WEEKS) {
      const group = e.kind === 'it' ? 'office' : e.kind;
      const ratio = c > 0 ? r / c : 1;
      const best = leaving.get(group);
      if (!best || ratio < best.ratio || (ratio === best.ratio && e.id < best.id)) leaving.set(group, { id: e.id, ratio });
    }
    if (profitWeeks >= GROW_WEEKS && filled >= GROW_FILL && e.place.building.level < levelCap) {
      grow.push(e.id);
      next[e.id] = { kind: cur.kind, workers, profitWeeks: 0 };
      continue;
    }
    next[e.id] = { kind: cur.kind, workers, profitWeeks };
  }
  // 撤退は、同じ業種の組（店・事務所と IT 企業・工場と倉庫）で 1 週に 1 つ。
  // 売上は同じ組の中で分け合うので、1 つ抜けると残りの売上が増える。一斉に抜けて雇用が消え、また一斉に入る、を繰り返さないため
  for (const { id } of [...leaving.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    delete next[id];
    nextVacant[id] = week;
    closed.push(id);
  }
  return { businesses: next, vacant: nextVacant, grow, closed };
}
