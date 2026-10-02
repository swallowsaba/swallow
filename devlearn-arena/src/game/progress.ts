import type { DomainId } from '@/city/types';
import { lessonMeta } from './lessons';
import { skillOf } from './skill';
import { addDays, dayOf, instantOf } from './time';
import type { LessonMeta, LessonProgress, LessonStage, PracticeAttempt, Progress, ReviewCard, XpEvent, XpSource } from './types';
import { completionXp, practiceXp, quizXp, reviewXp, skillUpXp, troubleshootXp, type RunContext } from './xp';

/**
 * 学習の行動から、記録・XP・開発資金を計算する（docs/game-design.md 2〜4 章）。純粋な関数。
 *
 * - 開発資金は、得た XP と同じ量が入る（ミッションは報酬の資金も足す）
 * - 稼ぎ防止: 2 回目以降の回はまとめ 0・クイズと実戦 1/4。1 日（端末の日付）に同じレッスンから得る XP は 1 回分まで
 * - スキルの段階が上がると +50（上がった段の数だけ）
 *
 * 時刻 at は端末の地方時の ISO 文字列。先頭の 10 文字（YYYY-MM-DD）を端末の日付とする。
 */

export interface Outcome {
  progress: Progress;
  /** この行動で得た XP（0 のものは入れない） */
  events: XpEvent[];
  /** 開発資金に入る量 */
  funds: number;
  /** 段階が上がった分野 */
  skillUps: { domain: DomainId; from: number; to: number }[];
}

export const XP_LOG_LIMIT = 1000;

/** 復習の間隔（日。docs/learning-design.md 11 章） */
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30] as const;

const LESSON_SOURCES: ReadonlySet<XpSource> = new Set(['lesson-complete', 'quiz', 'practice', 'troubleshoot']);

export function emptyProgress(): Progress {
  return { xp: 0, lessons: {}, reviews: [], missions: {}, xpLog: [] };
}

export { addDays, dayOf } from './time';

function blankLesson(lessonId: string): LessonProgress {
  return { lessonId, status: 'not-started', stage: 'explain', completions: 0, quiz: [], practice: [] };
}

/** レッスンを始める（新しい回）。途中の回があっても、ここから数え直す */
export function startLesson(progress: Progress, lessonId: string, at: string): Progress {
  const prev = progress.lessons[lessonId] ?? blankLesson(lessonId);
  return withLesson(progress, { ...prev, status: 'in-progress', stage: 'explain', startedAt: at });
}

/** 画面からレッスンに入る。学習中なら進んだ段から続け、そうでなければ新しい回を始める（docs/learning-design.md 2 章） */
export function enterLesson(progress: Progress, lessonId: string, at: string): Progress {
  const cur = progress.lessons[lessonId];
  return cur?.status === 'in-progress' && cur.startedAt ? progress : startLesson(progress, lessonId, at);
}

const STAGE_ORDER: readonly LessonStage[] = ['explain', 'understand', 'quiz', 'practice', 'result', 'summary', 'done'];

/**
 * 段を進めた記録（途中保存。docs/learning-design.md 2 章: どの段でも中断でき、再開できる）。
 * 進んだ段より前へは戻さない（終わった段を見返しても、続きの位置は変わらない）。学習中でなければ何もしない
 */
export function reachStage(progress: Progress, lessonId: string, stage: LessonStage): Progress {
  const cur = progress.lessons[lessonId];
  if (cur?.status !== 'in-progress') return progress;
  if (STAGE_ORDER.indexOf(stage) <= STAGE_ORDER.indexOf(cur.stage)) return progress;
  return withLesson(progress, { ...cur, stage });
}

/** 今の回（始めていなければ、ここで始める） */
function run(progress: Progress, lessonId: string, at: string): { progress: Progress; lesson: LessonProgress; startedAt: string } {
  const cur = progress.lessons[lessonId];
  const p = cur?.status === 'in-progress' && cur.startedAt ? progress : startLesson(progress, lessonId, at);
  const lesson = p.lessons[lessonId] as LessonProgress;
  return { progress: p, lesson, startedAt: lesson.startedAt as string };
}

/**
 * 今日、この回より前の回で、このレッスンから XP を得ているか（1 日に 1 回分まで）
 */
export function cappedToday(progress: Progress, lessonId: string, startedAt: string, day: string): boolean {
  if (progress.lessons[lessonId]?.lastXpDay !== day) return false;
  const start = instantOf(startedAt);
  return progress.xpLog.some((e) => e.ref === lessonId && LESSON_SOURCES.has(e.source) && e.amount > 0 && dayOf(e.at) === day && instantOf(e.at) < start);
}

function ctxOf(lesson: LessonProgress): RunContext {
  return { repeat: lesson.completions > 0 };
}

/** クイズの 1 問に答える */
export function answerQuiz(
  progress: Progress,
  a: { lessonId: string; quizId: string; choiceIds: string[]; correct: boolean },
  at: string,
  catalog: readonly LessonMeta[],
): Outcome {
  const r = run(progress, a.lessonId, at);
  const thisRun = r.lesson.quiz.filter((q) => q.quizId === a.quizId && instantOf(q.at) >= instantOf(r.startedAt));
  const tryNo = thisRun.length + 1;
  const alreadyCorrect = thisRun.some((q) => q.correct);
  const lesson: LessonProgress = { ...r.lesson, stage: 'quiz', quiz: [...r.lesson.quiz, { quizId: a.quizId, at, choiceIds: [...a.choiceIds], correct: a.correct, tryNo }] };
  const amount = quizXp({ correct: a.correct, tryNo, alreadyCorrect }, ctxOf(r.lesson));
  return settle(r.progress, lesson, [{ source: 'quiz', amount }], r.startedAt, at, catalog);
}

/** 実戦を 1 回終える（成功でも失敗でも） */
export function finishPractice(progress: Progress, a: { lessonId: string; attempt: PracticeAttempt }, at: string, catalog: readonly LessonMeta[]): Outcome {
  const r = run(progress, a.lessonId, at);
  const meta = lessonMeta(a.lessonId, catalog);
  const ctx = ctxOf(r.lesson);
  // 1 つの回で XP を得る実戦の成功は 1 度だけ
  const succeededThisRun = r.lesson.practice.some((p) => p.success && instantOf(p.at) >= instantOf(r.startedAt));
  const attempt: PracticeAttempt = { ...a.attempt, at };
  const lesson: LessonProgress = { ...r.lesson, stage: attempt.success ? 'result' : 'practice', practice: [...r.lesson.practice, attempt] };
  const gains: { source: XpSource; amount: number }[] = succeededThisRun || !meta
    ? []
    : [
        { source: 'practice', amount: practiceXp({ difficulty: meta.difficulty, success: attempt.success, hintsUsed: attempt.hintsUsed }, ctx) },
        { source: 'troubleshoot', amount: troubleshootXp(attempt, ctx) },
      ];
  return settle(r.progress, lesson, gains, r.startedAt, at, catalog);
}

/** まとめまで到達する。初めての修了なら復習カードを作る */
export function completeLesson(progress: Progress, lessonId: string, at: string, catalog: readonly LessonMeta[]): Outcome {
  const r = run(progress, lessonId, at);
  const meta = lessonMeta(lessonId, catalog);
  const amount = meta ? completionXp(meta.difficulty, ctxOf(r.lesson)) : 0;
  const lesson: LessonProgress = { ...r.lesson, status: 'completed', stage: 'done', completedAt: at, completions: r.lesson.completions + 1 };
  let p = r.progress;
  if (!p.reviews.some((c) => c.lessonId === lessonId)) {
    const card: ReviewCard = { id: `review.${lessonId}`, lessonId, due: addDays(dayOf(at), REVIEW_INTERVALS[0]), intervalDays: REVIEW_INTERVALS[0], ease: 1 };
    p = { ...p, reviews: [...p.reviews, card] };
  }
  // スキルの段階は、行動の前（復習カードを作る前）と比べる
  return settle(p, lesson, [{ source: 'lesson-complete', amount }], r.startedAt, at, catalog, progress);
}

/**
 * 復習カードに答える。予定日（以降）に正解すると +10 で、次の間隔へ。誤答は 1 日後からやり直す。
 * 予定日の前に答えても、予定は変えず XP も無い。
 */
export function answerReview(progress: Progress, a: { cardId: string; correct: boolean }, at: string, catalog: readonly LessonMeta[]): Outcome {
  const card = progress.reviews.find((c) => c.id === a.cardId);
  if (!card) return { progress, events: [], funds: 0, skillUps: [] };
  const day = dayOf(at);
  const amount = reviewXp({ correct: a.correct, due: card.due, day });
  let next = card;
  if (card.due <= day) {
    const longest = REVIEW_INTERVALS[REVIEW_INTERVALS.length - 1] as number;
    const interval: number = a.correct ? (REVIEW_INTERVALS.find((n) => n > card.intervalDays) ?? longest) : REVIEW_INTERVALS[0];
    next = { ...card, intervalDays: interval, due: addDays(day, interval) };
  }
  const p = { ...progress, reviews: progress.reviews.map((c) => (c.id === card.id ? next : c)) };
  const domain = lessonMeta(card.lessonId, catalog)?.domain;
  return finish(progress, p, [{ at, source: 'review', ref: card.id, amount }], domain ? [domain] : [], 0, at, catalog);
}

/** ミッションを達成する（XP と、報酬の開発資金） */
export function completeMission(progress: Progress, a: { missionId: string; xp: number; funds?: number }, at: string, catalog: readonly LessonMeta[]): Outcome {
  if (progress.missions[a.missionId]?.status === 'completed') return { progress, events: [], funds: 0, skillUps: [] };
  const p: Progress = { ...progress, missions: { ...progress.missions, [a.missionId]: { ...progress.missions[a.missionId], missionId: a.missionId, status: 'completed', completedAt: at } } };
  return finish(progress, p, [{ at, source: 'mission', ref: a.missionId, amount: Math.round(a.xp) }], [], a.funds ?? 0, at, catalog);
}

/* ---------- 共通 ---------- */

function withLesson(progress: Progress, lesson: LessonProgress): Progress {
  return { ...progress, lessons: { ...progress.lessons, [lesson.lessonId]: lesson } };
}

/**
 * レッスンの行動の XP に、1 日 1 回分の規則を掛けて記録する。
 * origin は行動の前の記録（スキルの段階の上がりを比べる元）。省略すると before
 */
function settle(
  before: Progress,
  lesson: LessonProgress,
  gains: { source: XpSource; amount: number }[],
  startedAt: string,
  at: string,
  catalog: readonly LessonMeta[],
  origin: Progress = before,
): Outcome {
  const day = dayOf(at);
  const capped = cappedToday(before, lesson.lessonId, startedAt, day);
  const events: XpEvent[] = capped ? [] : gains.filter((g) => g.amount > 0).map((g) => ({ at, source: g.source, ref: lesson.lessonId, amount: g.amount }));
  const next = withLesson(before, events.length > 0 ? { ...lesson, lastXpDay: day } : lesson);
  const domain = lessonMeta(lesson.lessonId, catalog)?.domain;
  return finish(origin, next, events, domain ? [domain] : [], 0, at, catalog);
}

/** スキルの段階の上がりを見て +50 を足し、XP と記録をまとめる */
function finish(before: Progress, after: Progress, gained: XpEvent[], domains: DomainId[], extraFunds: number, at: string, catalog: readonly LessonMeta[]): Outcome {
  const day = dayOf(at);
  const events = gained.filter((e) => e.amount > 0);
  const skillUps: Outcome['skillUps'] = [];
  for (const d of domains) {
    const from = skillOf(d, before, catalog, day).stage;
    const to = skillOf(d, after, catalog, day).stage;
    if (to > from) {
      skillUps.push({ domain: d, from, to });
      events.push({ at, source: 'skill-up', ref: d, amount: skillUpXp(from, to) });
    }
  }
  const total = events.reduce((s, e) => s + e.amount, 0);
  const progress: Progress = { ...after, xp: after.xp + total, xpLog: [...after.xpLog, ...events].slice(-XP_LOG_LIMIT) };
  return { progress, events, funds: total + extraFunds, skillUps };
}
