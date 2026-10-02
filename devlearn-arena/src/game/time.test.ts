import { describe, expect, it } from 'vitest';
import { addDays, dayOf, instantOf, plusMinutes } from './time';

describe('時刻と日付の計算（Date を使わない）', () => {
  it('日付に日数を足す。月末・年末・うるう年をまたぐ', () => {
    expect(addDays('2026-10-02', 1)).toBe('2026-10-03');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-10-02', 30)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('時刻に分を足す。日をまたいでも時差の表記を保つ', () => {
    expect(plusMinutes('2026-10-02T23:59:00+09:00', 2)).toBe('2026-10-03T00:01:00+09:00');
    expect(plusMinutes('2026-10-02T10:00:00Z', 90)).toBe('2026-10-02T11:30:00Z');
  });

  it('時差の違う時刻も前後を正しく比べる', () => {
    expect(instantOf('2026-10-02T09:00:00+09:00')).toBe(instantOf('2026-10-02T00:00:00Z'));
    expect(instantOf('2026-10-02T08:59:00+09:00')).toBeLessThan(instantOf('2026-10-02T00:00:00Z'));
  });

  it('端末の日付は地方時の日付', () => {
    expect(dayOf('2026-10-03T00:30:00+09:00')).toBe('2026-10-03');
  });
});
