import { ENTRIES, entryOf, recommendedRank } from '@/content/catalog';
import type { DomainId } from '@/content/schema';
import { lessonMeta } from '@/game/lessons';
import { addDays, instantOf } from '@/game/time';
import type { LessonMeta, Progress } from '@/game/types';
import { statusOf } from './library';

/**
 * おすすめ（docs/ui-design.md 3 章の「おすすめの欄」: 次に学ぶとよい内容・復習の予定・進行中のミッション）。純粋な計算。
 *
 * 次に学ぶとよい内容は、推奨学習順と学習履歴から決める（docs/learning-design.md 8・10 章、docs/game-design.md 11 章）:
 *   1. 学習中のレッスン（続きから）
 *   2. 誤答の多い分野は、その分野の推奨前提の復習
 *   3. 最近修了したレッスンの「次に学ぶとよい」
 *   4. 推奨学習順で、まだ修了していない最初のレッスン（最初に遊ぶ人には IT 基礎の最初のレッスン）
 * **おすすめは案内であって、ロックではない。** どのレッスンも、ここに出なくても始められる。
 */

export type RecommendReason = 'continue' | 'shore-up' | 'next' | 'order';

export interface Recommendation {
  lessonId: string;
  title: string;
  domain: DomainId;
  reason: RecommendReason;
  /** なぜ勧めるか（1 行） */
  why: string;
}

export interface ReviewDue {
  cardId: string;
  lessonId: string;
  title: string;
  due: string;
  /** 予定日まであと何日（0 なら今日。負なら過ぎている） */
  inDays: number;
}

/** 誤答の多い分野とみなす、初回の正答率と、数える答えの数 */
const WEAK_RATE = 0.5;
const WEAK_MIN_ANSWERS = 4;

function titleOf(id: string): string {
  return entryOf(id)?.title ?? id;
}

/** 初回の答えの正答率が低い分野（答えが少ない分野は数えない） */
export function weakDomains(progress: Progress, catalog: readonly LessonMeta[]): DomainId[] {
  const tally = new Map<DomainId, { n: number; ok: number }>();
  for (const lp of Object.values(progress.lessons)) {
    const domain = lessonMeta(lp.lessonId, catalog)?.domain;
    if (!domain) continue;
    for (const q of lp.quiz) {
      if (q.tryNo !== 1) continue;
      const t = tally.get(domain) ?? { n: 0, ok: 0 };
      tally.set(domain, { n: t.n + 1, ok: t.ok + (q.correct ? 1 : 0) });
    }
  }
  return [...tally].filter(([, t]) => t.n >= WEAK_MIN_ANSWERS && t.ok / t.n < WEAK_RATE).map(([d]) => d);
}

export function recommend(progress: Progress, catalog: readonly LessonMeta[], count = 3): Recommendation[] {
  const out: Recommendation[] = [];
  const add = (id: string, reason: RecommendReason, why: string): void => {
    const e = entryOf(id);
    if (!e || out.length >= count || out.some((r) => r.lessonId === id)) return;
    out.push({ lessonId: id, title: e.title, domain: e.domain, reason, why });
  };
  const done = (id: string): boolean => statusOf(id, progress) === 'completed';

  // 1. 学習中（最近始めた順）
  const doing = Object.values(progress.lessons)
    .filter((lp) => statusOf(lp.lessonId, progress) === 'in-progress' && lp.startedAt)
    .sort((a, b) => instantOf(b.startedAt as string) - instantOf(a.startedAt as string));
  for (const lp of doing) add(lp.lessonId, 'continue', '学習中。続きから始められる');

  // 2. 誤答の多い分野: その分野で学んだレッスンの、まだ修了していない推奨前提
  for (const domain of weakDomains(progress, catalog)) {
    const studied = Object.keys(progress.lessons).filter((id) => entryOf(id)?.domain === domain);
    const pre = studied.flatMap((id) => entryOf(id)?.prerequisites ?? []).filter((id) => !done(id)).sort((a, b) => recommendedRank(a) - recommendedRank(b));
    for (const id of pre) add(id, 'shore-up', `${titleOf(studied[0] ?? '')}の前提。誤答が多かった分野の土台を固める`);
  }

  // 3. 最近修了したレッスンの「次に学ぶとよい」
  const finished = Object.values(progress.lessons)
    .filter((lp) => lp.completions > 0 && lp.completedAt)
    .sort((a, b) => instantOf(b.completedAt as string) - instantOf(a.completedAt as string));
  for (const lp of finished) for (const id of entryOf(lp.lessonId)?.next ?? []) if (!done(id)) add(id, 'next', `「${titleOf(lp.lessonId)}」の次に学ぶとよい`);

  // 4. 推奨学習順
  const first = !Object.values(progress.lessons).some((lp) => lp.status !== 'not-started' || lp.completions > 0);
  for (const e of ENTRIES) if (!done(e.id)) add(e.id, 'order', first ? '初めてなら、ここから（推奨学習順の最初）' : '推奨学習順で、まだ学んでいない');
  return out;
}

/** 復習の予定（近い順）。today は端末の日付 */
export function reviewsDue(progress: Progress, today: string, count = 2): ReviewDue[] {
  const days = (due: string): number => {
    let n = 0;
    if (due <= today) {
      for (let d = due; d < today && n > -400; d = addDays(d, 1)) n -= 1;
      return n;
    }
    for (let d = today; d < due && n < 400; d = addDays(d, 1)) n += 1;
    return n;
  };
  return [...progress.reviews]
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
    .slice(0, count)
    .map((c) => ({ cardId: c.id, lessonId: c.lessonId, title: titleOf(c.lessonId), due: c.due, inDays: days(c.due) }));
}
