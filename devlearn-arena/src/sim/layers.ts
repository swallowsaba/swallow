/**
 * 住民の層（docs/game-design.md 13.2）。層 = 年齢の帯（4）× 収入の帯（3）= 12 層。
 * 層の番号は `年齢の帯 × 3 + 収入の帯`（若者・低 = 0 … 高齢・高 = 11。docs/data-model.md 8 章）。
 */

export const AGE_BANDS = ['young', 'family', 'middle', 'senior'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
export const INCOME_BANDS = ['low', 'mid', 'high'] as const;
export type IncomeBand = (typeof INCOME_BANDS)[number];

export const LAYER_COUNT = 12;
export const LAYERS: readonly number[] = Array.from({ length: LAYER_COUNT }, (_, i) => i);

export const ageOf = (layer: number): number => Math.floor(layer / 3);
export const incomeOf = (layer: number): number => layer % 3;
export const layerOf = (age: number, income: number): number => age * 3 + income;

export const AGE_NAMES: Record<AgeBand, string> = { young: '若者', family: '子育て', middle: '中年', senior: '高齢' };
export const INCOME_NAMES: Record<IncomeBand, string> = { low: '低い収入', mid: '中くらいの収入', high: '高い収入' };

/** 層の名前（「低い収入の若者」） */
export function layerName(layer: number): string {
  return `${INCOME_NAMES[INCOME_BANDS[incomeOf(layer)] as IncomeBand]}の${AGE_NAMES[AGE_BANDS[ageOf(layer)] as AgeBand]}`;
}

/** 1 世帯の人数・うち 18 歳以上・働く人（年齢の帯ごと。13.2 の表） */
export const HOUSEHOLD_SIZE = [1.3, 3.4, 2.2, 1.6] as const;
export const ADULTS = [1.3, 2.0, 2.2, 1.6] as const;
export const WORKERS = [1.0, 1.5, 1.4, 0.1] as const;

/** 月の収入（万円。収入の帯ごと） */
export const MONTHLY_INCOME = [18, 35, 70] as const;

export const sizeOf = (layer: number): number => HOUSEHOLD_SIZE[ageOf(layer)] as number;
export const adultsOf = (layer: number): number => ADULTS[ageOf(layer)] as number;
export const workersOf = (layer: number): number => WORKERS[ageOf(layer)] as number;
export const incomeYenOf = (layer: number): number => (MONTHLY_INCOME[incomeOf(layer)] as number) * 10000;

/**
 * 初めの分布（docs/data-model.md 12 章の移行と、新しく入る世帯の割合）。
 * 年齢の帯 若者 30%・子育て 35%・中年 20%・高齢 15%、収入の帯 低 30%・中 50%・高 20%
 */
export const AGE_SHARE = [0.3, 0.35, 0.2, 0.15] as const;
export const INCOME_SHARE = [0.3, 0.5, 0.2] as const;
export const LAYER_SHARE: readonly number[] = LAYERS.map((l) => (AGE_SHARE[ageOf(l)] as number) * (INCOME_SHARE[incomeOf(l)] as number));

/** 初めの分布の 1 世帯の平均の人数 */
export const MEAN_HOUSEHOLD_SIZE = LAYERS.reduce((s, l) => s + (LAYER_SHARE[l] as number) * sizeOf(l), 0);

/** 満足の要因（docs/game-design.md 13.8。docs/data-model.md 9 章の FactorId と同じ並び） */
export const FACTORS = ['afford', 'jobs', 'commute', 'noise', 'green', 'police', 'school', 'clinic', 'fire', 'power', 'tax', 'trust'] as const;
export type FactorId = (typeof FACTORS)[number];
export const FACTOR_COUNT = FACTORS.length;
export const factorIndex = (f: FactorId): number => FACTORS.indexOf(f);

export const FACTOR_NAMES: Record<FactorId, string> = {
  afford: '手頃さ', jobs: '仕事', commute: '通勤', noise: '騒音', green: '緑地', police: '治安',
  school: '教育', clinic: '医療', fire: '防災', power: '電力', tax: '税', trust: '市政への信頼',
};

/**
 * 層の重み（13.2 の「重く見る物」。書いていない物は 1）。年齢の帯と収入の帯の重みを掛け合わせる。
 * 医療は高齢が ×2（24.2 の診療所の「高齢は重み 2」と同じ）
 */
const AGE_WEIGHT: Record<AgeBand, Partial<Record<FactorId, number>>> = {
  young: { afford: 1.5, jobs: 1.5 },
  family: { school: 2, police: 1.5 },
  middle: { jobs: 1.2, tax: 1.2 },
  senior: { clinic: 2, noise: 1.5 },
};
const INCOME_WEIGHT: Record<IncomeBand, Partial<Record<FactorId, number>>> = {
  low: { afford: 1.5, tax: 0.5 },
  mid: {},
  high: { tax: 1.5, afford: 0.5 },
};

export function weightOf(layer: number, factor: FactorId): number {
  const a = AGE_WEIGHT[AGE_BANDS[ageOf(layer)] as AgeBand][factor] ?? 1;
  const i = INCOME_WEIGHT[INCOME_BANDS[incomeOf(layer)] as IncomeBand][factor] ?? 1;
  return a * i;
}

/** [層 12][要因 12] の重み（毎週の計算で使い回す） */
export const WEIGHTS: readonly (readonly number[])[] = LAYERS.map((l) => FACTORS.map((f) => weightOf(l, f)));

/** 空の層の配列（長さ 12） */
export const emptyLayers = (): number[] => new Array<number>(LAYER_COUNT).fill(0);
