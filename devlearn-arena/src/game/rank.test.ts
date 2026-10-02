import { describe, expect, it } from 'vitest';
import { nextRankOf, rankOf } from './rank';

describe('エンジニア段階（docs/game-design.md 9 章・docs/decisions.md D-08）', () => {
  it('見習い 0 / ジュニア 1,000 / ミドル 5,000 / シニア 12,000 / リード 20,000', () => {
    const cases: [number, string][] = [
      [0, 'apprentice'], [999, 'apprentice'], [1000, 'junior'], [4999, 'junior'], [5000, 'middle'],
      [11999, 'middle'], [12000, 'senior'], [19999, 'senior'], [20000, 'lead'], [99999, 'lead'],
    ];
    for (const [xp, rank] of cases) expect(rankOf(xp), String(xp)).toBe(rank);
  });

  it('次の段階までの XP を出す。リードは次が無い', () => {
    expect(nextRankOf(0)).toMatchObject({ rank: 'junior', name: 'ジュニア', remaining: 1000, from: 0 });
    expect(nextRankOf(6000)).toMatchObject({ rank: 'senior', remaining: 6000, from: 5000 });
    expect(nextRankOf(20000)).toBeNull();
  });
});
