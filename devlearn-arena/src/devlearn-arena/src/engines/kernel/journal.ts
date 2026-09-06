/**
 * タイムトラベルの土台。
 * 「操作のたびに完成した状態そのもの」を積む。差分ではなく状態を持つのは、
 * 巻き戻しが O(1) になり、途中の再計算で結果がずれる余地を無くすため。
 * 状態は不変オブジェクトなので、変わらなかった部分は構造共有される。
 */
export interface JournalEntry<T> {
  /** 0 始まり。0 は初期状態 */
  readonly index: number;
  /** 何をした結果か（コマンド行や tick 番号） */
  readonly label: string;
  readonly state: T;
}

export interface Journal<T> {
  readonly entries: readonly JournalEntry<T>[];
  /** 今どこを見ているか */
  readonly cursor: number;
}

export const DEFAULT_LIMIT = 500;

export function createJournal<T>(initial: T, label = 'initial'): Journal<T> {
  return { entries: [{ index: 0, label, state: initial }], cursor: 0 };
}

/**
 * 新しい状態を積む。巻き戻し中に積んだ場合は、その先の履歴を捨てる
 * （編集履歴の分岐を作らない = 常に1本道にする）。
 */
export function push<T>(journal: Journal<T>, state: T, label: string, limit = DEFAULT_LIMIT): Journal<T> {
  const kept = journal.entries.slice(0, journal.cursor + 1);
  kept.push({ index: kept.length, label, state });
  const trimmed = kept.length > limit ? kept.slice(kept.length - limit) : kept;
  const reindexed = trimmed.map((e, i) => ({ ...e, index: i }));
  return { entries: reindexed, cursor: reindexed.length - 1 };
}

export function seek<T>(journal: Journal<T>, index: number): Journal<T> {
  const clamped = Math.max(0, Math.min(journal.entries.length - 1, index));
  return { ...journal, cursor: clamped };
}

export function current<T>(journal: Journal<T>): T {
  const entry = journal.entries[journal.cursor] ?? journal.entries[0];
  if (!entry) throw new Error('journal is empty');
  return entry.state;
}

export function isAtLatest<T>(journal: Journal<T>): boolean {
  return journal.cursor === journal.entries.length - 1;
}

export function labels<T>(journal: Journal<T>): string[] {
  return journal.entries.map((e) => e.label);
}
