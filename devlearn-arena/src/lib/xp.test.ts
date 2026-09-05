import { describe, expect, it } from 'vitest';
import { levelFromXp, rankFromLevel, scoreAttempt, xpForLevel, xpForScore, xpProgress } from './xp';

describe('xp curve', () => {
  it('レベル1は0XPから始まる', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(levelFromXp(0)).toBe(1);
  });

  it('必要XPは単調増加する', () => {
    for (let l = 1; l < 60; l += 1) {
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
    }
  });

  it('しきい値ちょうどでレベルが上がる', () => {
    const need = xpForLevel(5);
    expect(levelFromXp(need - 1)).toBe(4);
    expect(levelFromXp(need)).toBe(5);
  });

  it('ランクはレベルに応じて上がる', () => {
    expect(rankFromLevel(1)).toBe('Novice');
    expect(rankFromLevel(6)).toBe('Junior');
    expect(rankFromLevel(14)).toBe('Mid');
    expect(rankFromLevel(25)).toBe('Senior');
    expect(rankFromLevel(99)).toBe('SRE');
  });

  it('進捗の比率は0..1に収まる', () => {
    for (const xp of [0, 1, 99, 500, 12_345]) {
      const p = xpProgress(xp);
      expect(p.ratio).toBeGreaterThanOrEqual(0);
      expect(p.ratio).toBeLessThanOrEqual(1);
    }
  });
});

describe('scoring', () => {
  it('ヒントなし・手数どおりなら満点', () => {
    expect(scoreAttempt({ hintsUsed: 0, commandsUsed: 5, parCommands: 5 })).toBe(100);
  });

  it('ヒントで減点される', () => {
    expect(scoreAttempt({ hintsUsed: 2, commandsUsed: 5, parCommands: 5 })).toBe(76);
  });

  it('超過手数の減点には上限がある', () => {
    expect(scoreAttempt({ hintsUsed: 0, commandsUsed: 500, parCommands: 5 })).toBe(70);
  });

  it('0未満にはならない', () => {
    expect(scoreAttempt({ hintsUsed: 20, commandsUsed: 500, parCommands: 1 })).toBe(0);
  });

  it('BOSSのXPが最も大きい', () => {
    expect(xpForScore(100, 'boss')).toBeGreaterThan(xpForScore(100, 'challenge'));
    expect(xpForScore(100, 'drill')).toBeGreaterThan(xpForScore(100, 'concept'));
  });
});
