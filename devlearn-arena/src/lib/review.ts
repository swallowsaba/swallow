import type { ReviewItem } from './storage/schema';

/**
 * 間隔反復（SM-2 の簡易版）。
 * 躓いた任務ほど早く、身に付いたものほど遠くへ送る。
 */
export const MIN_EASE = 1.3;
const MAX_EASE = 2.8;

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export function addDays(day: string, days: number): string {
  const base = Date.parse(`${day}T00:00:00Z`);
  const next = new Date(base + days * 86_400_000);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${String(y)}-${m}-${d}`;
}

export function createItem(lessonId: string, today: string): ReviewItem {
  return { lessonId, due: addDays(today, 1), intervalDays: 1, ease: 2.5, reps: 0 };
}

/** 次に見直す日を決める */
export function schedule(item: ReviewItem, grade: Grade, today: string): ReviewItem {
  const delta = grade === 'again' ? -0.3 : grade === 'hard' ? -0.15 : grade === 'easy' ? 0.15 : 0;
  const ease = Math.min(MAX_EASE, Math.max(MIN_EASE, item.ease + delta));

  if (grade === 'again') {
    return { ...item, ease, intervalDays: 1, reps: 0, due: addDays(today, 1) };
  }

  const reps = item.reps + 1;
  const interval =
    reps === 1 ? 1 : reps === 2 ? 3 : Math.min(180, Math.round(item.intervalDays * ease));
  return { ...item, ease, reps, intervalDays: interval, due: addDays(today, interval) };
}

/** 今日見直すもの。期限を過ぎたものほど前に来る */
export function dueItems(queue: readonly ReviewItem[], today: string): ReviewItem[] {
  return queue
    .filter((item) => item.due <= today)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

/**
 * 成績から積むかどうかを決める。ヒントを使ったか、失敗したかで判断する。
 * 解答を見て飛ばした手順があれば、成績にかかわらず必ず積む。
 */
export function shouldReview(input: {
  hintsUsed: number;
  mistakes: number;
  score: number;
  skipped?: number;
}): boolean {
  if ((input.skipped ?? 0) > 0) return true;
  return input.hintsUsed > 0 || input.mistakes > 0 || input.score < 80;
}

export function upsert(
  queue: readonly ReviewItem[],
  item: ReviewItem,
): ReviewItem[] {
  return [...queue.filter((q) => q.lessonId !== item.lessonId), item];
}

export function remove(queue: readonly ReviewItem[], lessonId: string): ReviewItem[] {
  return queue.filter((q) => q.lessonId !== lessonId);
}
