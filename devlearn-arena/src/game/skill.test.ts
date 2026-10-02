import { describe, expect, it } from 'vitest';
import { LESSONS } from './lessons';
import { emptyProgress } from './progress';
import { skillOf, skillStageOf } from './skill';
import { plusMinutes } from './time';
import type { LessonMeta, LessonProgress, PracticeAttempt, Progress, QuizAttempt, ReviewCard } from './types';

describe('スキルの段階（docs/game-design.md 4 章の表）', () => {
  it('0〜9 未修得・10〜29 見習い・30〜49 初級・50〜69 中級・70〜89 上級・90〜100 熟練', () => {
    const cases: [number, number][] = [[0, 0], [9, 0], [10, 1], [29, 1], [30, 2], [49, 2], [50, 3], [69, 3], [70, 4], [89, 4], [90, 5], [100, 5]];
    for (const [value, stage] of cases) expect(skillStageOf(value), String(value)).toBe(stage);
  });
});

/** 初級 2・中級 1・上級 1 の小さな分野（重みの合計 1 + 1 + 2 + 3 = 7） */
const catalog: LessonMeta[] = [
  { id: 'linux.b.01', domain: 'linux', difficulty: 'b', title: 'a' },
  { id: 'linux.b.02', domain: 'linux', difficulty: 'b', title: 'b' },
  { id: 'linux.i.01', domain: 'linux', difficulty: 'i', title: 'c' },
  { id: 'linux.a.01', domain: 'linux', difficulty: 'a', title: 'd' },
  { id: 'net.b.01', domain: 'net', difficulty: 'b', title: 'e' },
];
const TODAY = '2026-10-10';
/** n 分後の時刻（2026-10-01 から） */
const t = (n: number): string => plusMinutes('2026-10-01T09:00:00+09:00', n);

function lesson(id: string, over: Partial<LessonProgress> = {}): LessonProgress {
  return { lessonId: id, status: 'completed', stage: 'done', completions: 1, quiz: [], practice: [], ...over };
}
function quiz(n: number, correct: boolean, tryNo = 1): QuizAttempt {
  return { quizId: `q${String(n)}`, at: t(n), choiceIds: ['a'], correct, tryNo };
}
function practice(n: number, success: boolean, hintsUsed = 0): PracticeAttempt {
  return { at: t(n), stepsDone: [], hintsUsed, errors: [], recoveredFromError: false, dangerousUsed: [], success, commands: [] };
}
function card(lessonId: string, due: string): ReviewCard {
  return { id: `review.${lessonId}`, lessonId, due, intervalDays: 1, ease: 1 };
}
function progress(lessons: LessonProgress[], reviews: ReviewCard[] = []): Progress {
  return { ...emptyProgress(), lessons: Object.fromEntries(lessons.map((l) => [l.lessonId, l])), reviews };
}

describe('スキルの式（docs/game-design.md 4 章）', () => {
  it('記録が無ければ 0（未修得）。復習カードが無ければ定着度も 0', () => {
    const s = skillOf('linux', emptyProgress(), catalog, TODAY);
    expect(s.value).toBe(0);
    expect(s.stage).toBe(0);
    expect(s.breakdown).toEqual({ completion: 0, quizFirstTry: 0, practiceSuccess: 0, retention: 0 });
  });

  it('修了率は難易度で重みを付ける（初級 1 / 中級 2 / 上級 3）。40 点満点', () => {
    // 初級 1 本 = 1/7、上級 1 本 = 3/7
    expect(skillOf('linux', progress([lesson('linux.b.01')]), catalog, TODAY).breakdown.completion).toBeCloseTo(1 / 7);
    expect(skillOf('linux', progress([lesson('linux.a.01')]), catalog, TODAY).breakdown.completion).toBeCloseTo(3 / 7);
    const all = progress(catalog.filter((l) => l.domain === 'linux').map((l) => lesson(l.id)));
    expect(skillOf('linux', all, catalog, TODAY).breakdown.completion).toBe(1);
    expect(skillOf('linux', all, catalog, TODAY).value).toBe(40);
  });

  it('途中のレッスン（まとめまで到達していない）は修了に数えない', () => {
    const p = progress([lesson('linux.a.01', { status: 'in-progress', stage: 'quiz', completions: 0 })]);
    expect(skillOf('linux', p, catalog, TODAY).breakdown.completion).toBe(0);
  });

  it('クイズの初回正答率は、直近 20 問の初回の答えで数える（25 点満点）', () => {
    // 古い 10 問は全て誤答、新しい 20 問は 15 問正解 → 15/20
    const old = Array.from({ length: 10 }, (_, i) => quiz(i, false));
    const recent = Array.from({ length: 20 }, (_, i) => quiz(100 + i, i < 15));
    // 2 回目の答え（tryNo 2）は数えない
    const retries = Array.from({ length: 5 }, (_, i) => quiz(200 + i, true, 2));
    const p = progress([lesson('linux.b.01', { completions: 0, status: 'in-progress', quiz: [...old, ...recent, ...retries] })]);
    const s = skillOf('linux', p, catalog, TODAY);
    expect(s.breakdown.quizFirstTry).toBe(0.75);
    expect(s.counts.quizFirstTries).toBe(20);
    expect(s.value).toBe(Math.round(25 * 0.75));
  });

  it('実戦の成功率は直近 10 回。ヒント無しの成功 1・ヒントあり 0.5・失敗 0（25 点満点）', () => {
    const old = Array.from({ length: 5 }, (_, i) => practice(i, true));
    // 直近 10 回: ヒント無し 4・ヒントあり 4・失敗 2 → (4 + 2) / 10 = 0.6
    const recent = [
      ...Array.from({ length: 4 }, (_, i) => practice(100 + i, true, 0)),
      ...Array.from({ length: 4 }, (_, i) => practice(110 + i, true, 2)),
      ...Array.from({ length: 2 }, (_, i) => practice(120 + i, false)),
    ];
    const p = progress([lesson('linux.b.01', { completions: 0, status: 'in-progress', practice: [...old, ...recent] })]);
    const s = skillOf('linux', p, catalog, TODAY);
    expect(s.breakdown.practiceSuccess).toBeCloseTo(0.6);
    expect(s.value).toBe(15);
  });

  it('定着度は、復習カードのうち予定日を過ぎていない割合（10 点満点）。予定日当日は過ぎていない', () => {
    const p = progress(
      [lesson('linux.b.01', { completions: 0 }), lesson('linux.b.02', { completions: 0 }), lesson('linux.i.01', { completions: 0 }), lesson('linux.a.01', { completions: 0 })],
      [card('linux.b.01', '2026-10-09'), card('linux.b.02', TODAY), card('linux.i.01', '2026-10-12'), card('linux.a.01', '2026-10-01')],
    );
    const s = skillOf('linux', p, catalog, TODAY);
    expect(s.breakdown.retention).toBe(0.5);
    expect(s.value).toBe(5);
  });

  it('長く触れないと定着度が下がり、スキルが少し下がる（罰ではなく知らせのため）', () => {
    const p = progress([lesson('linux.b.01')], [card('linux.b.01', '2026-10-11')]);
    const now = skillOf('linux', p, catalog, TODAY).value;
    const later = skillOf('linux', p, catalog, '2026-11-30').value;
    expect(later).toBe(now - 10);
  });

  it('4 つを足し、四捨五入した整数にする', () => {
    // 修了率 4/7 × 40 = 22.857…・クイズ 1 問中 0・実戦 1 回ヒントあり 0.5 × 25 = 12.5 → 35.36 → 35
    const p = progress([lesson('linux.b.01'), lesson('linux.a.01', { practice: [practice(1, true, 1)], quiz: [quiz(2, false)] })]);
    const s = skillOf('linux', p, catalog, TODAY);
    expect(s.value).toBe(35);
    expect(s.stage).toBe(2);
  });

  it('段階の境で四捨五入が効く: 29.64 → 30 で初級、29.29 → 29 で見習い', () => {
    // 上級 1 本 3/7 × 40 = 17.14 + 実戦 1 回ヒントあり 12.5 = 29.64 → 30
    const up = progress([lesson('linux.a.01', { practice: [practice(1, true, 1)] })]);
    expect(skillOf('linux', up, catalog, TODAY).value).toBe(30);
    expect(skillOf('linux', up, catalog, TODAY).stage).toBe(2);
    // 初級 1 本 1/7 × 40 = 5.71 + クイズ 5 問中 4 問 0.8 × 25 = 20 + 実戦 4 回中ヒントあり 1 回 0.125 × 25 = 3.125 → 28.84 → 29
    const down = progress([lesson('linux.b.01', {
      quiz: [quiz(1, true), quiz(2, true), quiz(3, true), quiz(4, true), quiz(5, false)],
      practice: [practice(6, true, 1), practice(7, false), practice(8, false), practice(9, false)],
    })]);
    expect(skillOf('linux', down, catalog, TODAY).value).toBe(29);
    expect(skillOf('linux', down, catalog, TODAY).stage).toBe(1);
  });

  it('全てを満たすと 100（熟練）', () => {
    const ids = catalog.filter((l) => l.domain === 'linux').map((l) => l.id);
    const p = progress(
      ids.map((id, i) => lesson(id, { quiz: [quiz(i, true)], practice: [practice(10 + i, true)] })),
      ids.map((id) => card(id, '2026-10-20')),
    );
    const s = skillOf('linux', p, catalog, TODAY);
    expect(s.value).toBe(100);
    expect(s.stage).toBe(5);
  });

  it('スキルは XP の合計ではない: XP が多くても、記録が同じなら同じ値', () => {
    const p = progress([lesson('linux.b.01')]);
    expect(skillOf('linux', { ...p, xp: 99999 }, catalog, TODAY).value).toBe(skillOf('linux', p, catalog, TODAY).value);
  });

  it('他の分野の記録は数えない', () => {
    const p = progress([lesson('net.b.01', { quiz: [quiz(1, true)], practice: [practice(2, true)] })], [card('net.b.01', '2026-10-20')]);
    expect(skillOf('linux', p, catalog, TODAY).value).toBe(0);
    expect(skillOf('net', p, catalog, TODAY).value).toBe(100);
  });

  it('全レッスンの一覧で、Linux の分母は 21 本（初級 9・中級 8・上級 4。重み 9 + 16 + 12 = 37）', () => {
    const s = skillOf('linux', progress([lesson('linux.b.00')]), LESSONS, TODAY);
    expect(s.counts.totalLessons).toBe(21);
    expect(s.breakdown.completion).toBeCloseTo(1 / 37);
  });
});
