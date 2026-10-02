import type { Stage } from '@/game/stage';
import { MAP_SIZE, START_AREA } from './terrain';
import type { Rect, RoadKind, ZoneKind } from './types';

/**
 * 都市を作る規則の値（docs/city-design.md 2・3・8 章、docs/game-design.md 2・6・7 章）。
 * 施設の費用は content/facilities.json。ここは道路・区画・成長・霧の値を持つ。
 */

/** 学習者が引ける道路（橋は川を渡る所に自動で架かる） */
export type BuildRoadKind = Exclude<RoadKind, 'bridge'>;

export const ROAD_RULES: Record<BuildRoadKind, { name: string; costPerCell: number; minStage: Stage }> = {
  lane: { name: '細い道', costPerCell: 10, minStage: 1 },
  street: { name: '一般道', costPerCell: 20, minStage: 1 },
  avenue: { name: '大通り', costPerCell: 60, minStage: 3 },
  roundabout: { name: 'ロータリー', costPerCell: 40, minStage: 3 },
};

/** 橋（docs/game-design.md 6 章: 町から）。川の上のマスは費用が BRIDGE.costFactor 倍 */
export const BRIDGE = { minStage: 2 as Stage, costFactor: 4, maxCells: 5 };

export const ZONE_RULES: Record<ZoneKind, { name: string; costPerCell: number; minStage: Stage }> = {
  residential: { name: '住宅', costPerCell: 5, minStage: 1 },
  commercial: { name: '商業', costPerCell: 5, minStage: 2 },
  office: { name: 'オフィス', costPerCell: 8, minStage: 1 },
};

/**
 * 開発資金の初めの値。Phase 2 では資金は固定値で、建てても減らない（docs/development-plan.md）。
 * 足りない時の判定（docs/city-design.md 8 章）は、この値と費用を比べて行う。
 */
export const INITIAL_FUNDS = 5000;

/** 都市の 1 日の長さ（秒）。画面の時計と、車と人の動きが使う */
export const SECONDS_PER_DAY = 4;

/** 建設の 3 段階（基礎 → 骨組み → 完成）。1 段 = 1 日（docs/city-design.md 6 章） */
export const BUILD_DAYS_PER_STAGE = 1;
export type ConstructionStage = 'foundation' | 'frame' | 'done';

export function constructionStage(builtDay: number, day: number): ConstructionStage {
  const t = day - builtDay;
  if (t < BUILD_DAYS_PER_STAGE) return 'foundation';
  if (t < BUILD_DAYS_PER_STAGE * 2) return 'frame';
  return 'done';
}

/**
 * 区画の建物が持つ人と仕事（レベル 1〜5）。
 * 住宅は住む人（都市規模）、商業とオフィスは仕事の数（雇用）。
 */
export const CAPACITY: Record<ZoneKind, readonly [number, number, number, number, number]> = {
  residential: [8, 40, 150, 600, 1500],
  commercial: [6, 20, 80, 250, 600],
  office: [12, 40, 160, 500, 1200],
};

/** 施設 1 つが生む仕事（レベルあたり） */
export const FACILITY_JOBS_PER_LEVEL = 15;

/**
 * 発展段階ごとの、区画の建物の上限のレベル（docs/game-design.md 6 章・docs/city-design.md 3 章）。
 * 村と町は低層（住宅は戸建て → 低層集合住宅）、地方都市で中層、中核都市で高層、技術都市で超高層。
 */
export function levelCap(stage: Stage): number {
  return Math.max(2, stage);
}

/**
 * 需要（docs/game-design.md 7 章）: 住宅は雇用から、オフィスは技術力から、商業は人口から生まれる。
 * 値は「あと何人・何人分の仕事が入れるか」。正なら建つ・育つ。
 */
export function demandOf(s: { population: number; jobs: number; commercialJobs: number; officeJobs: number; techPower: number }): Record<ZoneKind, number> {
  return {
    residential: 30 + s.jobs * 3 - s.population,
    commercial: s.population / 10 - s.commercialJobs,
    office: 20 + s.techPower * 15 - s.officeJobs,
  };
}

/** 1 日に新しく建つ数と、育つ数の上限（区画の種類ごと） */
export const NEW_PER_DAY = 4;
export const UPGRADES_PER_DAY = 2;

/** 周辺の良さを数える範囲（マス）。公園と施設が区画の育ちを良くする */
export const PARK_RADIUS = 4;
export const FACILITY_RADIUS = 5;

/**
 * 霧の晴れた範囲（docs/city-design.md 1 章: 初めは中央の 24×24。発展段階で外側の霧が晴れる）。
 * 段階ごとに一辺 16 マスずつ広がり、技術都市で島の全体。
 */
export function revealedFor(stage: Stage): Rect[] {
  const side = Math.min(MAP_SIZE, START_AREA.w + (stage - 1) * 16);
  if (stage >= 5) return [{ x: 0, y: 0, w: MAP_SIZE, h: MAP_SIZE }];
  const cx = START_AREA.x + START_AREA.w / 2;
  const cy = START_AREA.y + START_AREA.h / 2;
  return [{ x: cx - side / 2, y: cy - side / 2, w: side, h: side }];
}

export function isRevealed(revealed: readonly Rect[], x: number, y: number): boolean {
  return revealed.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/**
 * 施設のアップグレードの費用（docs/game-design.md 5 章: レベル N に上げるには、その分野のスキル段階が N 以上、かつ資金）。
 * 建てた費用 × 上げた後のレベル ÷ 2。
 */
export function upgradeCost(baseCost: number, toLevel: number): number {
  return Math.round((baseCost * toLevel) / 2);
}
