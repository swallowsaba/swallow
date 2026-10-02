import { describe, expect, it } from 'vitest';
import { skillStageOf } from './skill';

describe('スキルの段階（docs/game-design.md 4 章の表）', () => {
  it('0〜9 未修得・10〜29 見習い・30〜49 初級・50〜69 中級・70〜89 上級・90〜100 熟練', () => {
    const cases: [number, number][] = [[0, 0], [9, 0], [10, 1], [29, 1], [30, 2], [49, 2], [50, 3], [69, 3], [70, 4], [89, 4], [90, 5], [100, 5]];
    for (const [value, stage] of cases) expect(skillStageOf(value), String(value)).toBe(stage);
  });
});
