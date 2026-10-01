/** 都市の発展段階の名前（docs/game-design.md 6 章） */
export const STAGE_NAMES = { 1: '村', 2: '町', 3: '地方都市', 4: '中核都市', 5: '技術都市' } as const;
export type Stage = keyof typeof STAGE_NAMES;
