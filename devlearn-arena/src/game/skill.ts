/**
 * スキルの段階（docs/game-design.md 4 章の表）。値は 0〜100。
 * 値の計算（学習履歴と理解度からの式）は Phase 4 で足す。
 */
export type SkillStage = 0 | 1 | 2 | 3 | 4 | 5;

export const SKILL_STAGE_NAMES: Record<SkillStage, string> = { 0: '未修得', 1: '見習い', 2: '初級', 3: '中級', 4: '上級', 5: '熟練' };

/** 段階の下限の値 */
const STAGE_FLOORS: [SkillStage, number][] = [[5, 90], [4, 70], [3, 50], [2, 30], [1, 10], [0, 0]];

export function skillStageOf(value: number): SkillStage {
  for (const [stage, floor] of STAGE_FLOORS) if (value >= floor) return stage;
  return 0;
}
