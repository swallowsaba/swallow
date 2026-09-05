import { describe, expect, it } from 'vitest';
import { diffDays, nextStreak } from './date';

describe('streak', () => {
  it('初日は1', () => {
    expect(nextStreak(0, null, '2026-01-01')).toBe(1);
  });
  it('同じ日なら据え置き', () => {
    expect(nextStreak(3, '2026-01-01', '2026-01-01')).toBe(3);
  });
  it('翌日なら+1', () => {
    expect(nextStreak(3, '2026-01-01', '2026-01-02')).toBe(4);
  });
  it('間が空いたら1に戻る', () => {
    expect(nextStreak(9, '2026-01-01', '2026-01-05')).toBe(1);
  });
  it('月をまたぐ差分を数えられる', () => {
    expect(diffDays('2026-01-31', '2026-02-01')).toBe(1);
  });
});
