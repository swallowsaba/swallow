import { describe, expect, it } from 'vitest';
import { LESSONS } from '@/game/lessons';
import { answerQuiz, completeLesson, emptyProgress, startLesson } from '@/game/progress';
import type { Progress } from '@/game/types';
import { recommend, reviewsDue, weakDomains } from './recommend';

const T = (h: number): string => `2026-10-03T${String(h).padStart(2, '0')}:00:00+09:00`;

function completed(ids: string[]): Progress {
  let p = emptyProgress();
  ids.forEach((id, i) => {
    p = startLesson(p, id, T(8 + i));
    p = completeLesson(p, id, T(8 + i), LESSONS).progress;
  });
  return p;
}

describe('おすすめ（docs/ui-design.md 3 章・docs/learning-design.md 8・10 章）', () => {
  it('最初に遊ぶ人には、IT 基礎の最初のレッスンを勧める', () => {
    const r = recommend(emptyProgress(), LESSONS);
    expect(r[0]).toMatchObject({ lessonId: 'found.b.01', reason: 'order' });
    expect(r[0]?.why).toContain('初めて');
    expect(r).toHaveLength(3);
  });

  it('学習中のレッスンを先に（続きから）、次に修了したレッスンの「次に学ぶとよい」', () => {
    let p = completed(['found.b.04']);
    p = startLesson(p, 'linux.i.01', T(12));
    const r = recommend(p, LESSONS);
    expect(r.map((x) => [x.lessonId, x.reason])).toEqual([['linux.i.01', 'continue'], ['found.b.06', 'next'], ['linux.b.01', 'next']]);
    expect(r[1]?.why).toBe('「ファイルとディレクトリ」の次に学ぶとよい');
  });

  it('修了したレッスンは勧めない。推奨学習順で、まだのレッスンで埋める', () => {
    const r = recommend(completed(['found.b.01', 'found.b.02']), LESSONS);
    expect(r.map((x) => x.lessonId)).not.toContain('found.b.01');
    expect(r.map((x) => x.lessonId)).not.toContain('found.b.02');
    expect(r).toHaveLength(3);
  });

  it('誤答の多い分野は、その分野の推奨前提の復習を勧める（docs/game-design.md 11 章）', () => {
    let p = startLesson(emptyProgress(), 'linux.i.01', T(8));
    for (const q of ['q1', 'q2', 'q3', 'q4']) p = answerQuiz(p, { lessonId: 'linux.i.01', quizId: q, choiceIds: ['x'], correct: q === 'q1' }, T(9), LESSONS).progress;
    expect(weakDomains(p, LESSONS)).toEqual(['linux']);
    const r = recommend(p, LESSONS);
    expect(r[0]).toMatchObject({ lessonId: 'linux.i.01', reason: 'continue' });
    expect(r[1]).toMatchObject({ lessonId: 'linux.b.08', reason: 'shore-up' });
  });

  it('答えが少ない分野は、誤答が多くても弱いとみなさない', () => {
    let p = startLesson(emptyProgress(), 'linux.i.01', T(8));
    p = answerQuiz(p, { lessonId: 'linux.i.01', quizId: 'q1', choiceIds: ['x'], correct: false }, T(9), LESSONS).progress;
    expect(weakDomains(p, LESSONS)).toEqual([]);
  });

  it('復習の予定を近い順に、あと何日かと一緒に', () => {
    const p = completed(['found.b.04', 'linux.i.01']);
    const due = reviewsDue(p, '2026-10-03');
    expect(due.map((d) => [d.lessonId, d.due, d.inDays])).toEqual([['found.b.04', '2026-10-04', 1], ['linux.i.01', '2026-10-04', 1]]);
    expect(reviewsDue(p, '2026-10-06')[0]?.inDays).toBe(-2);
  });
});
