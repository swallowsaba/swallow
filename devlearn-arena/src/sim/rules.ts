import type { RoadKind } from '@/city/types';

/**
 * 都市の模擬の値（docs/game-design.md 13 章）。表の値は初めの値で、テストで固定する。
 * 値を変える時は、game-design を先に直してから、こことテストを直す。
 */

/* ---------- 時間（13.1） ---------- */

/** 1 倍の速さで、都市の 1 日の長さ（秒）。2 秒（都市の模型と同じ値） */
export { SECONDS_PER_DAY } from '@/city/rules';
export const DAYS_PER_WEEK = 7;
export const WEEKS_PER_YEAR = 52;
export const WEEKS_PER_TERM = 208;
export const SPEEDS = [1, 2, 3] as const;
export type Speed = (typeof SPEEDS)[number];

/** 日付の表示（「2 年目 14 週」）。0 日目は 1 年目 1 週 */
export function dateOf(day: number): { year: number; week: number } {
  const w = Math.floor(Math.max(0, day) / DAYS_PER_WEEK);
  return { year: Math.floor(w / WEEKS_PER_YEAR) + 1, week: (w % WEEKS_PER_YEAR) + 1 };
}

/* ---------- 地図と地区（13.6・docs/architecture.md 9.2） ---------- */

/** 地区は 8×8 マス。96×96 の地図で 12×12 = 144 地区 */
export const DISTRICT_SIZE = 8;

/* ---------- 住まい（13.2・13.5） ---------- */

/** 1 世帯の人数の目安（戸数 = 住宅の CAPACITY ÷ この値） */
export const PEOPLE_PER_UNIT = 2.3;
/** 家賃 = 地価 × この円 × 建物の型 × 需給の倍率 */
export const RENT_YEN_PER_VALUE = 600;
/** 建物の型の倍率（戸建て = 住宅の Lv1、集合 = Lv2 以上） */
export const RENT_TYPE = { house: 1.3, apartment: 1.0 } as const;
/** 家賃の負担がこれ以下なら新しく入れる・これを超えると出ていく */
export const BURDEN_LIVABLE = 0.3;
export const BURDEN_LEAVE = 0.4;
/** 負担が 40% を超えた層が 1 週に出ていく割合 */
export const LEAVE_RATE = 0.05;
/** 需給の倍率: 1 + 0.8 × (5% − 空き室の割合) ÷ 5%。0.6〜1.8 に収め、1 週に ±0.03 まで動く */
export const RENT_FACTOR = { vacancyTarget: 0.05, slope: 0.8, min: 0.6, max: 1.8, step: 0.03 } as const;

/* ---------- 事業者（13.3） ---------- */

export type BusinessKind = 'shop' | 'office' | 'it' | 'factory';
/** 雇う人の収入の帯の割合（低・中・高） */
export const JOB_BANDS: Record<BusinessKind | 'staff', readonly [number, number, number]> = {
  shop: [0.6, 0.4, 0],
  office: [0, 0.7, 0.3],
  it: [0, 0.5, 0.5],
  factory: [0.5, 0.5, 0],
  staff: [0, 0.6, 0.4],
};
/** IT 企業になるのは、IT 施設から 8 マス以内のオフィス */
export const IT_RANGE = 8;
/** 店の客が通う範囲（道路で 10 マス） */
export const SHOP_RANGE = 10;
/** 成長: 売上が費用を 4 週続けて上回り、働く人が 9 割集まっている。撤退: 8 週続けて下回る */
export const GROW_WEEKS = 4;
export const GROW_FILL = 0.9;
export const CLOSE_WEEKS = 8;
/** 撤退した建物に、次の事業者が入るまでの週 */
export const REOPEN_WEEKS = 8;
/**
 * 売上と費用（1 週・1 人の働き口あたりの単位）。
 * 費用 = 働き口 × WAGE × (1 + (税率 − 10%) × TAX_COST)。税率を上げると費用が増え、撤退しやすくなる（22.2）
 */
export const WAGE = 2;
export const TAX_COST = 0.05;
/** 住民の買い物の量 = Σ 世帯 × 月の収入（万円）× 0.02（23 章） */
export const SPENDING_RATE = 0.02;
/** 事務所の売上の元: (20 + 技術力 × 15 + 人口 × 0.05) × この値を、事務所の働き口で分ける */
export const OFFICE_REVENUE = 2.2;
/** IT 企業の売上: 事務所と同じ元に、近くの IT 施設の Lv の合計 × 0.1 の割り増し */
export const IT_BONUS_PER_LEVEL = 0.1;
/** 工場・倉庫の売上の元: 道路網の大きさ（マス）× 0.5 × この値を、工場の働き口で分ける */
export const FACTORY_REVENUE = 2.2;

/* ---------- 地価と騒音（13.4） ---------- */

export const LAND_BASE = 100;
export const LAND_ROAD: Partial<Record<RoadKind, number>> = { street: 10, avenue: 20, roundabout: 10, bridge: 10 };
export const LAND_PARK_MAX = 30;
export const LAND_SERVICE_MAX = 30;
/** 仕事への近さ: 平均の通勤時間が 20 分以下で +20、60 分で 0 */
export const LAND_JOBS = { max: 20, near: 20, far: 60 } as const;
export const LAND_WATER = { value: 15, range: 3 } as const;
export const LAND_HILL_STEP = 5;
/** 施設: Lv × 4、半径 6 マスで薄まる */
export const LAND_FACILITY = { perLevel: 4, radius: 6 } as const;
/** 騒音 × この値を地価から引く（G2 で 0.8 から下げた。docs/game-design.md 13.4） */
export const LAND_NOISE = 0.4;

/** 騒音の発生源（値・半径）。距離に比例して薄まり、半径で 0 */
export const NOISE = {
  industrialPerLevel: 8, industrialRadius: 4,
  avenue: 6, avenueRadius: 2,
  commercial: 3, commercialRadius: 2,
  /** 夜も動く施設（データセンター・クラスタ施設・クラウドセンター）: 6 + Lv × 3、半径 4 */
  nightBase: 6, nightPerLevel: 3, nightRadius: 4,
} as const;
export const NIGHT_FACILITIES = ['datacenter', 'cluster', 'cloud'] as const;

/** 公園の類の行き届く距離（道路で。24.2） */
export const PARK_REACH: Record<string, number> = { park: 6, plaza: 5, fountain: 3, treerow: 2 };

/* ---------- 通勤（13.6） ---------- */

/** 道路の速さ（マス／分） */
export const ROAD_SPEED: Record<RoadKind, number> = { lane: 1, street: 1.5, avenue: 2.5, bridge: 1.5, roundabout: 1.5 };
/** 道路 1 マスの容量（1 日に通る通勤の人数。混み具合 = 流れ ÷ 容量。1 を超えた分だけ通勤時間が延びる） */
export const ROAD_CAPACITY: Record<RoadKind, number> = { lane: 300, street: 800, avenue: 2400, bridge: 800, roundabout: 1600 };
/** 同じ地区の中の通勤の道のり（マス） */
export const SAME_DISTRICT_CELLS = 4;

/* ---------- 満足と支持率（13.8） ---------- */

/** 区切りの点を直線でつなぐ（両端の外は端の値） */
export function piecewise(points: readonly (readonly [number, number])[], x: number): number {
  const first = points[0] as readonly [number, number];
  const last = points[points.length - 1] as readonly [number, number];
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i] as readonly [number, number];
    const [x0, y0] = points[i - 1] as readonly [number, number];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

export const AFFORD_POINTS = [[0.25, 5], [0.3, 0], [0.4, -15], [0.5, -20]] as const;
export const JOBS_POINTS = [[0.03, 5], [0.1, -10], [0.2, -20]] as const;
export const COMMUTE_POINTS = [[20, 3], [45, -5], [60, -10]] as const;
export const NOISE_POINTS = [[20, 0], [60, -10], [80, -15]] as const;
export const GREEN_POINTS = 6;
/** 税: (10 − 税率%) × 1 */
export const taxPoints = (taxRate: number): number => 10 - taxRate;
/** 支持は 1 週に、目標との差の 1/4 だけ近づく */
export const SUPPORT_EASE = 0.25;
/** 市政への信頼: −15〜+15。1 年で 0 へ 1/4 戻る */
export const TRUST_LIMIT = 15;
export const TRUST_WEEKLY_KEEP = Math.pow(0.75, 1 / WEEKS_PER_YEAR);

/* ---------- 税収（22.2） ---------- */

export const INITIAL_TAX_RATE = 10;
export const INITIAL_TREASURY = 800;
/** 税収（週）= Σ 世帯 × 月の収入（万円）× 税率 × 0.03 + Σ 事業者の雇う人 × 0.05 × 税率 ÷ 10% */
export const TAX_RESIDENT = 0.03;
export const TAX_BUSINESS = 0.05;

/* ---------- 電力（24.1。G10 で使う。版 4 の形のために陸揚げ所と上限を持つ） ---------- */

export const EXTERNAL_POWER_CAP = 8;

/* ---------- 政治資本（21.5・27 章。版 4 の形の初めの値） ---------- */

export const INITIAL_CAPITAL = 10;
