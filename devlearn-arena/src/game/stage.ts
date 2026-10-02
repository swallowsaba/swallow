/** 都市の発展段階の名前（docs/game-design.md 6 章） */
export const STAGE_NAMES = { 1: '村', 2: '町', 3: '地方都市', 4: '中核都市', 5: '技術都市' } as const;
export type Stage = keyof typeof STAGE_NAMES;

/** 段階に上がる条件。技術力と都市規模の両方を満たす（特定の分野を必須にしない） */
export const STAGE_THRESHOLDS: Record<Stage, { techPower: number; population: number }> = {
  1: { techPower: 0, population: 0 },
  2: { techPower: 5, population: 500 },
  3: { techPower: 12, population: 3000 },
  4: { techPower: 22, population: 15000 },
  5: { techPower: 35, population: 50000 },
};

/** 技術力（施設 Lv の合計）と都市規模から、発展段階を決める */
export function stageOf(techPower: number, population: number): Stage {
  let stage: Stage = 1;
  for (const s of [2, 3, 4, 5] as const) {
    const t = STAGE_THRESHOLDS[s];
    if (techPower >= t.techPower && population >= t.population) stage = s;
  }
  return stage;
}
