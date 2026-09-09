import { describe, expect, it } from 'vitest';
import { NO_HINTS, reveal, revealedCount, stepKey } from './hints';

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
