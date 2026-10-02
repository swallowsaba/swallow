import { describe, expect, it } from 'vitest';
import { stageOf } from './stage';

/** docs/game-design.md 6 章の表を、値を写してそのまま固定する */
const TABLE: [stage: number, techPower: number, population: number][] = [
  [1, 0, 0],
  [2, 5, 500],
  [3, 12, 3000],
  [4, 22, 15000],
  [5, 35, 50000],
];

describe('都市の発展段階（docs/game-design.md 6 章）', () => {
  it('技術力と都市規模の両方が境目に届くと、その段階になる', () => {
    for (const [stage, tech, pop] of TABLE) {
      expect(stageOf(tech, pop), `段階 ${String(stage)}`).toBe(stage);
      if (stage > 1) {
        expect(stageOf(tech - 1, pop), `技術力が 1 足りない ${String(stage)}`).toBe(stage - 1);
        expect(stageOf(tech, pop - 1), `都市規模が 1 足りない ${String(stage)}`).toBe(stage - 1);
      }
    }
  });

  it('片方だけが大きくても上がらない（技術力だけ・都市規模だけ）', () => {
    expect(stageOf(100, 499)).toBe(1);
    expect(stageOf(4, 1000000)).toBe(1);
    expect(stageOf(35, 14999)).toBe(3);
  });

  it('技術力の 35 は「7 施設を Lv5」でも「12 施設を Lv3」でも届く（特定の分野を必須にしない）', () => {
    expect(stageOf(7 * 5, 50000)).toBe(5);
    expect(stageOf(12 * 3, 50000)).toBe(5);
  });
});
