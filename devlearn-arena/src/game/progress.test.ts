import { describe, expect, it } from 'vitest';
import { LESSONS } from './lessons';
import { addDays, answerReview, completeLesson, emptyProgress, enterLesson, startLesson, XP_LOG_LIMIT } from './progress';
import { rankOf } from './rank';
import { applyRecords, type LearningRecord } from './records';
import { skillOf } from './skill';
import { plusMinutes } from './time';
import type { LessonMeta } from './types';

const catalog: LessonMeta[] = [
  { id: 'linux.b.01', domain: 'linux', difficulty: 'b', title: '端末とシェル' },
  { id: 'linux.i.01', domain: 'linux', difficulty: 'i', title: 'サービスと systemd' },
  { id: 'linux.a.01', domain: 'linux', difficulty: 'a', title: '起動しないサービスを直す' },
  { id: 'net.b.01', domain: 'net', difficulty: 'b', title: 'ネットワークとは' },
];

const DAY1 = '2026-10-02T19:00:00+09:00';
const DAY1_LATER = '2026-10-02T22:00:00+09:00';
const DAY2 = '2026-10-03T19:00:00+09:00';

/** クイズ 4 問に全て初回で正解し、実戦をヒント無しで成功し、まとめまで行く回 */
function perfectRun(lessonId: string, at: string): LearningRecord {
  return {
    kind: 'lesson', lessonId, at,
    quiz: [1, 2, 3, 4].map((n) => ({ quizId: `${lessonId}.q${String(n)}`, correct: true })),
    practice: [{ success: true }],
    complete: true,
  };
}
const sum = (xs: { amount: number }[]): number => xs.reduce((s, e) => s + e.amount, 0);
const bySource = (o: { events: { source: string; amount: number }[] }, source: string): number => sum(o.events.filter((e) => e.source === source));

describe('学習の記録から XP を計算する（docs/game-design.md 3 章）', () => {
  it('初級を初回で通すと: まとめ 30 + クイズ 5 × 4 + 実戦 20 = 70。スキルの段階が上がれば +50', () => {
    const o = applyRecords(emptyProgress(), [perfectRun('net.b.01', DAY1)], catalog);
    expect(bySource(o, 'lesson-complete')).toBe(30);
    expect(bySource(o, 'quiz')).toBe(20);
    expect(bySource(o, 'practice')).toBe(20);
    // net は 1 本だけの分野: 修了 1・クイズ 1・実戦 1・定着 1（カードができ、予定日は明日）→ 100（熟練）
    expect(o.skillUps).toEqual(expect.arrayContaining([expect.objectContaining({ domain: 'net', to: 5 })]));
    expect(bySource(o, 'skill-up')).toBe(5 * 50);
    expect(o.progress.xp).toBe(70 + 250);
  });

  it('開発資金は、得た XP と同じ量が入る（docs/game-design.md 2 章）', () => {
    const o = applyRecords(emptyProgress(), [perfectRun('linux.a.01', DAY1)], catalog);
    expect(o.funds).toBe(o.progress.xp);
    expect(o.funds).toBe(sum(o.events));
  });

  it('ヒントありの成功は半分。エラーから自力で回復すると +10（上級 55 / 2 = 27.5 → 28）', () => {
    const o = applyRecords(emptyProgress(), [{ kind: 'lesson', lessonId: 'linux.a.01', at: DAY1, practice: [{ success: true, hintsUsed: 2, recoveredFromError: true }] }], catalog);
    expect(bySource(o, 'practice')).toBe(28);
    expect(bySource(o, 'troubleshoot')).toBe(10);
  });

  it('実戦は 1 つの回で 1 度だけ XP になる（失敗の後の成功は数える）', () => {
    const o = applyRecords(emptyProgress(), [{ kind: 'lesson', lessonId: 'linux.b.01', at: DAY1, practice: [{ success: false }, { success: true }, { success: true }] }], catalog);
    expect(bySource(o, 'practice')).toBe(20);
    // 記録は 3 回とも残り、スキルの実戦の成功率に入る
    expect(o.progress.lessons['linux.b.01']?.practice).toHaveLength(3);
  });

  it('クイズ: 誤答 → 正解は 2。3 回誤答した後の正解（総当たり）は 0。既に正解した問題は 0', () => {
    const o = applyRecords(emptyProgress(), [{
      kind: 'lesson', lessonId: 'linux.b.01', at: DAY1,
      quiz: [
        { quizId: 'a', correct: false }, { quizId: 'a', correct: true },
        { quizId: 'b', correct: false }, { quizId: 'b', correct: false }, { quizId: 'b', correct: false }, { quizId: 'b', correct: true },
        { quizId: 'c', correct: true }, { quizId: 'c', correct: true },
      ],
    }], catalog);
    expect(bySource(o, 'quiz')).toBe(2 + 0 + 5);
    expect(o.progress.lessons['linux.b.01']?.quiz.map((q) => q.tryNo)).toEqual([1, 2, 1, 2, 3, 4, 1, 2]);
  });
});

describe('稼ぎを防ぐ規則（docs/game-design.md 3 章）', () => {
  it('2 回目以降の回（別の日）: まとめ 0、クイズと実戦は 1/4', () => {
    const first = applyRecords(emptyProgress(), [perfectRun('linux.b.01', DAY1)], catalog);
    const second = applyRecords(first.progress, [perfectRun('linux.b.01', DAY2)], catalog);
    expect(bySource(second, 'lesson-complete')).toBe(0);
    expect(bySource(second, 'quiz')).toBe(4 * 1);
    expect(bySource(second, 'practice')).toBe(5);
    expect(second.progress.lessons['linux.b.01']?.completions).toBe(2);
  });

  it('同じ日に同じレッスンからは 1 回分まで: 同じ日の 2 回目の回は 0', () => {
    const first = applyRecords(emptyProgress(), [perfectRun('linux.b.01', DAY1)], catalog);
    const again = applyRecords(first.progress, [perfectRun('linux.b.01', DAY1_LATER)], catalog);
    expect(sum(again.events.filter((e) => e.source !== 'skill-up'))).toBe(0);
    expect(again.funds).toBe(sum(again.events));
  });

  it('同じ日でも、1 つ目の回の中の行動は全て数える（途中で XP を得ても、その回は続けて得られる）', () => {
    const o = applyRecords(emptyProgress(), [perfectRun('linux.i.01', DAY1)], catalog);
    expect(bySource(o, 'lesson-complete') + bySource(o, 'quiz') + bySource(o, 'practice')).toBe(50 + 20 + 35);
  });

  it('同じ日でも、別のレッスンは制限されない', () => {
    const first = applyRecords(emptyProgress(), [perfectRun('linux.b.01', DAY1)], catalog);
    const other = applyRecords(first.progress, [perfectRun('linux.i.01', DAY1_LATER)], catalog);
    expect(bySource(other, 'lesson-complete')).toBe(50);
  });

  it('同じレッスンを繰り返しても XP はほとんど増えない（10 日続けても、初回の 1/3 に届かない）', () => {
    const first = applyRecords(emptyProgress(), [perfectRun('linux.b.01', DAY1)], catalog);
    const firstXp = sum(first.events.filter((e) => e.source !== 'skill-up'));
    let p = first.progress;
    let later = 0;
    for (let d = 1; d <= 10; d += 1) {
      const o = applyRecords(p, [perfectRun('linux.b.01', `${addDays('2026-10-02', d)}T19:00:00+09:00`)], catalog);
      later += sum(o.events.filter((e) => e.source !== 'skill-up'));
      p = o.progress;
    }
    expect(later).toBe(10 * (4 + 5));
    expect(later / 10).toBeLessThan(firstXp / 3);
  });
});

describe('復習（docs/learning-design.md 11 章）', () => {
  it('初めてまとめまで行くと、1 日後が予定日の復習カードができる。2 回目の修了では増えない', () => {
    let p = completeLesson(startLesson(emptyProgress(), 'linux.b.01', DAY1), 'linux.b.01', DAY1, catalog).progress;
    expect(p.reviews).toEqual([{ id: 'review.linux.b.01', lessonId: 'linux.b.01', due: '2026-10-03', intervalDays: 1, ease: 1 }]);
    p = completeLesson(startLesson(p, 'linux.b.01', DAY2), 'linux.b.01', DAY2, catalog).progress;
    expect(p.reviews).toHaveLength(1);
  });

  it('予定日に正解すると +10 で、間隔は 1 → 3 → 7 → 14 → 30 日と延びる。誤答は 1 日に戻る', () => {
    let p = completeLesson(startLesson(emptyProgress(), 'linux.b.01', DAY1), 'linux.b.01', DAY1, catalog).progress;
    const intervals: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const card = p.reviews[0];
      if (!card) throw new Error('カードが無い');
      const o = answerReview(p, { cardId: card.id, correct: true }, `${card.due}T08:00:00+09:00`, catalog);
      expect(o.events.find((e) => e.source === 'review')?.amount).toBe(10);
      p = o.progress;
      intervals.push(p.reviews[0]?.intervalDays ?? 0);
    }
    expect(intervals).toEqual([3, 7, 14, 30, 30, 30]);
    const card = p.reviews[0];
    if (!card) throw new Error('カードが無い');
    const wrong = answerReview(p, { cardId: card.id, correct: false }, `${card.due}T08:00:00+09:00`, catalog);
    expect(wrong.events).toEqual([]);
    expect(wrong.progress.reviews[0]).toMatchObject({ intervalDays: 1, due: addDays(card.due, 1) });
  });

  it('予定日の前に答えても XP は無く、予定も変わらない', () => {
    const p = completeLesson(startLesson(emptyProgress(), 'linux.b.01', DAY1), 'linux.b.01', DAY1, catalog).progress;
    const o = answerReview(p, { cardId: 'review.linux.b.01', correct: true }, DAY1_LATER, catalog);
    expect(o.events).toEqual([]);
    expect(o.progress.reviews).toEqual(p.reviews);
  });

  it('予定日を過ぎると定着度が下がり、復習すると戻る。段階が戻ると +50 が付く', () => {
    const done = applyRecords(emptyProgress(), [perfectRun('net.b.01', DAY1)], catalog);
    const late = '2026-10-20T08:00:00+09:00';
    expect(skillOf('net', done.progress, catalog, '2026-10-02').value).toBe(100);
    expect(skillOf('net', done.progress, catalog, '2026-10-20').value).toBe(90);
    const o = answerReview(done.progress, { cardId: 'review.net.b.01', correct: true }, late, catalog);
    expect(skillOf('net', o.progress, catalog, '2026-10-20').value).toBe(100);
    // 90 も 100 も熟練（段階 5）なので段階は上がらない
    expect(o.events.map((e) => e.source)).toEqual(['review']);
  });
});

describe('ミッション・資金・エンジニア段階', () => {
  it('ミッションを達成すると XP と、XP と同じ資金に報酬の資金を足した分が入る。同じミッションは 1 度だけ', () => {
    const o = applyRecords(emptyProgress(), [{ kind: 'mission', missionId: 'web-server', xp: 300, funds: 500, at: DAY1 }], catalog);
    expect(o.progress.xp).toBe(300);
    expect(o.funds).toBe(800);
    const again = applyRecords(o.progress, [{ kind: 'mission', missionId: 'web-server', xp: 300, funds: 500, at: DAY2 }], catalog);
    expect(again.funds).toBe(0);
  });

  it('総合 XP でエンジニア段階が決まる', () => {
    const o = applyRecords(emptyProgress(), [{ kind: 'mission', missionId: 'a', xp: 400, at: DAY1 }, { kind: 'mission', missionId: 'b', xp: 400, at: DAY1 }, { kind: 'mission', missionId: 'c', xp: 400, at: DAY1 }], catalog);
    expect(o.progress.xp).toBe(1200);
    expect(rankOf(o.progress.xp)).toBe('junior');
  });

  it('XP の記録は直近 1,000 件まで。累計 XP は減らない', () => {
    let p = emptyProgress();
    for (let i = 0; i < XP_LOG_LIMIT + 5; i += 1) p = applyRecords(p, [{ kind: 'mission', missionId: `m${String(i)}`, xp: 1, at: plusMinutes(DAY1, i) }], catalog).progress;
    expect(p.xpLog).toHaveLength(XP_LOG_LIMIT);
    expect(p.xp).toBe(XP_LOG_LIMIT + 5);
  });

  it('同じ記録からは同じ結果になる', () => {
    const records = [perfectRun('linux.b.01', DAY1), perfectRun('net.b.01', DAY1_LATER), perfectRun('linux.b.01', DAY2)];
    expect(applyRecords(emptyProgress(), records, LESSONS)).toEqual(applyRecords(emptyProgress(), records, LESSONS));
  });
});

describe('レッスンを始める（docs/learning-design.md 2 章: どの段でも中断でき、再開できる）', () => {
  it('学習中のレッスンをもう一度始めると、進んだ段と始めた時刻を保ったまま続きから', () => {
    const p = startLesson(emptyProgress(), 'linux.i.01', DAY1);
    const mid = { ...p, lessons: { ...p.lessons, 'linux.i.01': { ...p.lessons['linux.i.01']!, stage: 'quiz' as const } } };
    const again = enterLesson(mid, 'linux.i.01', DAY1_LATER);
    expect(again.lessons['linux.i.01']?.stage).toBe('quiz');
    expect(again.lessons['linux.i.01']?.startedAt).toBe(DAY1);
  });

  it('修了したレッスンは、解説から新しい回として始め直せる', () => {
    const done = completeLesson(startLesson(emptyProgress(), 'linux.b.01', DAY1), 'linux.b.01', DAY1, catalog).progress;
    const again = enterLesson(done, 'linux.b.01', DAY2);
    expect(again.lessons['linux.b.01']).toMatchObject({ status: 'in-progress', stage: 'explain', startedAt: DAY2, completions: 1 });
  });

  it('始めていないレッスンは、解説から始まる', () => {
    expect(enterLesson(emptyProgress(), 'net.b.01', DAY1).lessons['net.b.01']).toMatchObject({ status: 'in-progress', stage: 'explain', startedAt: DAY1 });
  });
});
