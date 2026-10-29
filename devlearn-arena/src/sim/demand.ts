import type { ZoneKind } from '@/city/types';
import { TAX_COST, WAGE } from './rules';

/**
 * 需要（RCI。docs/game-design.md 23 章）。13 章の模擬の週の値から計算する。区画を塗る判断の手がかりで、毎日の区画の建物の建ち方もこれに従う。
 *
 *   住宅 = 空いた仕事の数 × 1.2 + 都市の魅力（満足の平均 − 50）× 2 − 空いている戸に住める人の数
 *   商業 = 住民の買い物の量 ÷ 1 店の売り場あたりの量 − 店の雇う人の数 + 褒賞の建物（市民記念館 +10。25 章）
 *   オフィス = 20 + 技術力 × 15 − 事務所と IT 企業の雇う人の数
 *   工業 = 低と中の帯の失業者の数 + 道路網の大きさ（マス）× 0.5 − 工場・倉庫の雇う人の数
 *
 * 「1 店の売り場あたりの量」は、店の働き口 1 つが費用（賃金 × 税の倍率。13.3）を賄う買い物の量。買い物で賄える店の働き口の数から、今の働き口を引く。
 * 項は保存する（docs/data-model.md 8 章の lastWeek.demand。前の週の値が次の週の毎日の建ち方を決める）。
 */

/** 区画の種類ごとの項の並び（docs/ui-design.md 11.4 の内訳の小窓に、この順で出す） */
export const DEMAND_TERMS = {
  residential: ['openJobs', 'attraction', 'vacant'],
  commercial: ['spending', 'shopJobs', 'award'],
  office: ['base', 'tech', 'officeJobs'],
  industrial: ['unemployed', 'roads', 'factoryJobs'],
} as const satisfies Record<ZoneKind, readonly string[]>;

export type DemandTermId = (typeof DEMAND_TERMS)[ZoneKind][number];
/** 区画の種類 → 項の値（DEMAND_TERMS の順） */
export type DemandTerms = Record<ZoneKind, number[]>;

/** 項の名前（内訳の小窓） */
export const DEMAND_TERM_NAMES: Record<DemandTermId, string> = {
  openJobs: '空いた仕事 × 1.2',
  attraction: '都市の魅力（満足の平均 − 50）× 2',
  vacant: '空いている戸に住める人',
  spending: '住民の買い物で賄える店の働き口',
  shopJobs: '店の働き口',
  award: '市民記念館の来訪',
  base: '基本',
  tech: '技術力 × 15',
  officeJobs: '事務所と IT 企業の働き口',
  unemployed: '低と中の帯の失業者',
  roads: '道路網の大きさ × 0.5',
  factoryJobs: '工場・倉庫の働き口',
};

/** 区画の種類の名前（棒の名札） */
export const DEMAND_NAMES: Record<ZoneKind, string> = { residential: '住宅', commercial: '店', office: 'オフィス', industrial: '工業' };

/** 棒の幅（−100〜+100。docs/ui-design.md 11.4） */
export const DEMAND_BAR = 100;

export interface DemandInput {
  openJobs: number;
  attraction: number;
  /** 空いている戸に住める人の数（住める層のある建物の空いた戸 × 1 戸の人数） */
  vacantPeople: number;
  /** 住民の買い物の量（Σ 世帯 × 月の収入 × 0.02） */
  spending: number;
  taxRate: number;
  shopJobs: number;
  techPower: number;
  officeJobs: number;
  unemployedLowMid: number;
  roadCells: number;
  factoryJobs: number;
  /** 褒賞の建物が足す商業の需要（市民記念館 +10。docs/game-design.md 25 章） */
  awardShop?: number;
}

/** 100 分の 1 に丸める（−0 は 0 にする。保存の JSON で −0 は 0 になり、読み込んだ後と比べられなくなる） */
const r2 = (v: number): number => Math.round(v * 100) / 100 || 0;

/** 店の働き口 1 つが費用を賄う買い物の量（賃金 × 税の倍率） */
export const spendingPerShopJob = (taxRate: number): number => WAGE * (1 + (taxRate - 10) * TAX_COST);

/** 需要の項 */
export function demandTermsOf(d: DemandInput): DemandTerms {
  return {
    residential: [d.openJobs * 1.2, d.attraction * 2, -d.vacantPeople].map(r2),
    commercial: [d.spending / spendingPerShopJob(d.taxRate), -d.shopJobs, d.awardShop ?? 0].map(r2),
    office: [20, d.techPower * 15, -d.officeJobs].map(r2),
    industrial: [d.unemployedLowMid, d.roadCells * 0.5, -d.factoryJobs].map(r2),
  };
}

/** 項の合計（区画の種類ごとの需要） */
export function demandOfTerms(t: DemandTerms): Record<ZoneKind, number> {
  const sum = (a: readonly number[]): number => r2(a.reduce((s, v) => s + v, 0));
  return { residential: sum(t.residential), commercial: sum(t.commercial), office: sum(t.office), industrial: sum(t.industrial) };
}

/** 棒の長さ（−100〜+100 に収める） */
export const demandBar = (v: number): number => Math.max(-DEMAND_BAR, Math.min(DEMAND_BAR, v));
