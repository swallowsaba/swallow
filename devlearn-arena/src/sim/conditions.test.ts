import { describe, expect, it } from 'vitest';
import { CONDITION_WORDS, evalCondition, parseCondition, startWordOf } from './conditions';

/**
 * 条件の式（docs/content-spec.md 7.7）。請願の `when` と公約の `goal` を、src/sim の 1 つの関数で読む。
 * 学習の語（レッスンの修了・XP・スキル）は無い（学習を市政の条件にしない）
 */

describe('条件の式を読む（7.7）', () => {
  it('語・比べ方・値を && でつなぐ。右に start.<語> と、足す・掛ける数を書ける（「2 割増やす」）', () => {
    expect(parseCondition('unemployment <= 5')).toEqual([{ word: 'unemployment', op: '<=', value: 5 }]);
    expect(parseCondition('population >= start.population * 1.2')).toEqual([{ word: 'population', op: '>=', start: 'population', times: 1.2 }]);
    expect(parseCondition('facilities.it >= start.facilities.it + 2 && approval > 40')).toEqual([
      { word: 'facilities.it', op: '>=', start: 'facilities.it', plus: 2 },
      { word: 'approval', op: '>', value: 40 },
    ]);
    expect(parseCondition('any:rentBurden.低 >= 35')).toEqual([{ word: 'any:rentBurden.低', op: '>=', value: 35 }]);
  });

  it('読めない式・知らない語・学習の語は null（検証で落とす）', () => {
    for (const bad of ['', 'population', 'population >= ', 'population => 3', 'lessonsDone >= 3', 'xp >= 100', 'skill.db >= 2', 'population >= start.xp', 'population >= 1 &&', 'start.population >= 3']) {
      expect(parseCondition(bad), bad).toBeNull();
    }
    expect(CONDITION_WORDS.some((w) => /lesson|xp|skill/i.test(w))).toBe(false);
  });

  it('値と任期の初めの値で判定する。値が無い語は満たさない', () => {
    const v = { population: 1200, approval: 55, 'facilities.it': 3 };
    expect(evalCondition(parseCondition('population >= start.population * 1.2') ?? [], v, 1000)).toBe(true);
    expect(evalCondition(parseCondition('population >= start.population * 1.2') ?? [], v, 1001)).toBe(false);
    expect(evalCondition(parseCondition('facilities.it >= start.facilities.it + 2 && approval > 50') ?? [], v, 1)).toBe(true);
    expect(evalCondition(parseCondition('approval = 55') ?? [], v)).toBe(true);
    expect(evalCondition(parseCondition('treasury >= 0') ?? [], v)).toBe(false);
  });

  it('start の語は 1 つの式で 1 つ（公約の startValue に覚える）', () => {
    expect(startWordOf(parseCondition('population >= start.population * 1.2') ?? [])).toBe('population');
    expect(startWordOf(parseCondition('unemployment <= 5') ?? [])).toBeNull();
    expect(parseCondition('population >= start.population && jobs >= start.jobs')).toBeNull();
  });
});
