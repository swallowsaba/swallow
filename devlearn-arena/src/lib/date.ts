/** UI 向けの日付ユーティリティ。エンジン層からは呼ばない（決定論のため）。 */
export function dayKey(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(y)}-${m}-${day}`;
}

export function diffDays(fromDay: string, toDay: string): number {
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDay}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** 連続日数を更新する。同日なら据え置き、翌日なら +1、それ以外は 1 に戻す。 */
export function nextStreak(current: number, lastDay: string | null, today: string): number {
  if (lastDay === null) return 1;
  const gap = diffDays(lastDay, today);
  if (gap <= 0) return Math.max(1, current);
  if (gap === 1) return current + 1;
  return 1;
}
