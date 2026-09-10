import { describe, expect, it } from 'vitest';
import {
  attemptsUntilNextHint, autoHintCount, NO_HINTS, reveal, revealedCount, shouldShowAnswer,
  shownHints, stepKey,
} from './hints';

describe('ヒントの開示状態', () => {
  const first = stepKey('git/01/first-commit', 0);
  const second = stepKey('git/01/first-commit', 1);

  it('最初は何も開いていない', () => {
    expect(revealedCount(NO_HINTS, first)).toBe(0);
  });

  it('開いたヒントは同じ手順のあいだ残る', () => {
    const one = reveal(NO_HINTS, first);
    expect(revealedCount(one, first)).toBe(1);
    const two = reveal(one, first);
    expect(revealedCount(two, first)).toBe(2);
    // 何コマンド打っても状態は変わらないので、数え直す必要がない
    expect(revealedCount(two, first)).toBe(2);
  });

  it('次の手順へ進むと数え直す', () => {
    const two = reveal(reveal(NO_HINTS, first), first);
    expect(revealedCount(two, second)).toBe(0);
    expect(reveal(two, second)).toEqual({ key: second, count: 1 });
  });

  it('別の任務へ移っても数え直す', () => {
    const one = reveal(NO_HINTS, first);
    expect(revealedCount(one, stepKey('k8s/01/first-pod', 0))).toBe(0);
  });
});

describe('つまずいたときに自分から開くヒント', () => {
  it('2 回目までは開かない', () => {
    expect(autoHintCount(0)).toBe(0);
    expect(autoHintCount(1)).toBe(0);
    expect(autoHintCount(2)).toBe(0);
  });

  it('3 回目で 1 つ、以後 2 回ごとに増える', () => {
    expect(autoHintCount(3)).toBe(1);
    expect(autoHintCount(4)).toBe(1);
    expect(autoHintCount(5)).toBe(2);
    expect(autoHintCount(7)).toBe(3);
    expect(autoHintCount(9)).toBe(4);
  });

  it('次に開くまでの回数を数えられる', () => {
    expect(attemptsUntilNextHint(0)).toBe(3);
    expect(attemptsUntilNextHint(2)).toBe(1);
    expect(attemptsUntilNextHint(3)).toBe(2);
    expect(attemptsUntilNextHint(4)).toBe(1);
  });

  it('自分で開いた数と自動の多いほうを見せる', () => {
    const key = stepKey('m', 0);
    const two = reveal(reveal(NO_HINTS, key), key);
    expect(shownHints(two, key, 0, 3)).toBe(2);
    expect(shownHints(NO_HINTS, key, 5, 3)).toBe(2);
    expect(shownHints(two, key, 9, 3)).toBe(3);
  });

  it('用意した数を超えて見せない', () => {
    expect(shownHints(NO_HINTS, stepKey('m', 0), 99, 2)).toBe(2);
  });

  it('ヒントを出し切ってもなお通らなければ答えを見せる', () => {
    expect(shouldShowAnswer(3, 2)).toBe(false);
    expect(shouldShowAnswer(5, 2)).toBe(false);
    expect(shouldShowAnswer(7, 2)).toBe(true);
  });
});
