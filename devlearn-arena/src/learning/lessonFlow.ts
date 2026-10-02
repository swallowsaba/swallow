import type { Choice, Explain, Lesson, QuizItem, UnderstandItem } from '@/content/schema';
import { instantOf } from '@/game/time';
import type { LessonProgress, LessonStage } from '@/game/types';

/**
 * レッスンの進み（docs/learning-design.md 2〜5 章）。純粋な計算。
 *
 *   解説 → 理解 → クイズ → 実戦 → 結果・フィードバック → まとめ → XP / スキル
 *
 * - 段は戻って見られる。進んだ段は記録に残り（LessonProgress.stage）、次に開くとその段から続く
 * - 理解は採点しない。間違えたら、関係する解説の箇所を示す
 * - クイズは 1 問ずつ判定し、誤答には「なぜ違うか」、正答には「なぜ正しいか」を添える
 */

export const STAGES: readonly LessonStage[] = ['explain', 'understand', 'quiz', 'practice', 'result', 'summary', 'done'];

export const STAGE_NAMES: Record<LessonStage, string> = {
  explain: '解説',
  understand: '理解',
  quiz: 'クイズ',
  practice: '実戦',
  result: '結果',
  summary: 'まとめ',
  done: 'XP / スキル',
};

export const stageIndex = (s: LessonStage): number => STAGES.indexOf(s);

/** 段 a が段 b より後か */
export const isAfter = (a: LessonStage, b: LessonStage): boolean => stageIndex(a) > stageIndex(b);

/** 開ける段（進んだ段まで。終わった段は戻って見られる） */
export function openStages(reached: LessonStage): LessonStage[] {
  return STAGES.slice(0, stageIndex(reached) + 1);
}

/* ---------- 解説 ---------- */

export type ExplainKey = 'what' | 'why' | 'use' | 'when' | 'situation';

/** 解説の見出し（4 つの問いと状況説明） */
export const EXPLAIN_TITLES: Record<ExplainKey, string> = {
  what: '何か',
  why: 'なぜ必要か',
  use: '何に使うか',
  when: 'どんな場面で使うか',
  situation: 'こんな場面',
};

export interface ExplainPage {
  key: ExplainKey;
  title: string;
  text: string;
  /** 右に出す図 */
  figure: string;
}

/**
 * 解説を 1 画面 1 問いに分ける（1 画面の文章は 200 字以内。docs/learning-design.md 8 章）。
 * 順は 何か → なぜ必要か → 何に使うか → どんな場面で使うか（3 章）。状況説明があれば最後に、その場面を示す
 */
export function explainPages(explain: Explain): ExplainPage[] {
  const keys: ExplainKey[] = ['what', 'why', 'use', 'when'];
  if (explain.situation) keys.push('situation');
  const figures = explain.figures;
  return keys.map((key, i) => ({
    key,
    title: EXPLAIN_TITLES[key],
    text: explain[key] ?? '',
    figure: figures[Math.min(i, figures.length - 1)] ?? figures[0] ?? '',
  }));
}

/* ---------- 並びを混ぜる（seed から決める） ---------- */

function hashOf(s: string): number {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 並べ替えの問題に出す順。seed（レッスンと問題の ID）から決まり、同じ問題はいつも同じ順で出る。
 * 2 つ以上ある時は、正しい順のままにはしない
 */
export function shuffled<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  let s = hashOf(seed) || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  if (out.length > 1 && out.every((x, i) => x === items[i])) out.push(out.shift() as T);
  return out;
}

/* ---------- 理解（採点しない） ---------- */

export type RelationKind = 'contains' | 'before' | 'cause';

export const RELATION_NAMES: Record<RelationKind, (a: string, b: string) => string> = {
  contains: (a, b) => `「${a}」は「${b}」を含む`,
  before: (a, b) => `「${a}」は「${b}」より先に起きる`,
  cause: (a, b) => `「${a}」が原因で「${b}」が起きる`,
};

export type UnderstandAnswer =
  | { kind: 'figure-pick'; parts: readonly string[] }
  | { kind: 'order'; items: readonly string[] }
  | { kind: 'situation'; choiceId: string }
  | { kind: 'yesno'; value: boolean }
  | { kind: 'match'; pairs: readonly (readonly [string, string])[] }
  | { kind: 'relation'; value: RelationKind };

export interface UnderstandJudge {
  correct: boolean;
  /** 違っていた所（並べ替え・結ぶ問題の位置。図の問題では押した部分のうち違う物） */
  wrong: string[];
  /** 間違えた時に示す解説の箇所 */
  see: ExplainKey | null;
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

export function judgeUnderstand(item: UnderstandItem, answer: UnderstandAnswer): UnderstandJudge {
  if (answer.kind !== item.kind) throw new Error(`答えの形 ${answer.kind} が問題の形 ${item.kind} と違う`);
  let wrong: string[] = [];
  let correct = false;
  switch (item.kind) {
    case 'figure-pick': {
      const parts = (answer as Extract<UnderstandAnswer, { kind: 'figure-pick' }>).parts;
      correct = sameSet(parts, item.answer);
      wrong = parts.filter((p) => !item.answer.includes(p));
      break;
    }
    case 'order': {
      const items = (answer as Extract<UnderstandAnswer, { kind: 'order' }>).items;
      wrong = items.filter((x, i) => item.items[i] !== x);
      correct = items.length === item.items.length && wrong.length === 0;
      break;
    }
    case 'situation': {
      const id = (answer as Extract<UnderstandAnswer, { kind: 'situation' }>).choiceId;
      correct = item.choices.find((c) => c.id === id)?.correct === true;
      if (!correct) wrong = [id];
      break;
    }
    case 'yesno':
      correct = (answer as Extract<UnderstandAnswer, { kind: 'yesno' }>).value === item.answer;
      break;
    case 'match': {
      const pairs = (answer as Extract<UnderstandAnswer, { kind: 'match' }>).pairs;
      wrong = item.pairs.filter(([l, r]) => !pairs.some(([pl, pr]) => pl === l && pr === r)).map(([l]) => l);
      correct = pairs.length === item.pairs.length && wrong.length === 0;
      break;
    }
    case 'relation':
      correct = (answer as Extract<UnderstandAnswer, { kind: 'relation' }>).value === item.answer;
      break;
  }
  return { correct, wrong, see: correct ? null : (item.see ?? null) };
}

/* ---------- クイズ ---------- */

export interface QuizAnswer {
  /** 選んだ選択肢（選択・複数選択・状況判断・原因特定・結果予測・用語理解） */
  choiceIds?: readonly string[];
  /** 並べた順（並べ替え） */
  order?: readonly string[];
}

export interface QuizJudge {
  correct: boolean;
  /** 選んだ誤答（それぞれに「なぜ違うか」がある） */
  wrongPicked: Choice[];
  /** 選び損ねた正答（複数選択） */
  missed: Choice[];
  /** 並べ替えで、位置の違う手順 */
  misplaced: string[];
}

/** 複数を選ぶ問題か（正答が 2 つ以上・または複数選択の形） */
export const isMulti = (q: QuizItem): boolean => q.kind === 'multi' || (q.choices ?? []).filter((c) => c.correct).length > 1;

export function judgeQuiz(q: QuizItem, answer: QuizAnswer): QuizJudge {
  if (q.kind === 'order') {
    const order = answer.order ?? [];
    const right = q.order ?? [];
    const misplaced = order.filter((x, i) => right[i] !== x);
    return { correct: order.length === right.length && misplaced.length === 0, wrongPicked: [], missed: [], misplaced };
  }
  const choices = q.choices ?? [];
  const picked = choices.filter((c) => (answer.choiceIds ?? []).includes(c.id));
  const wrongPicked = picked.filter((c) => !c.correct);
  const missed = choices.filter((c) => c.correct && !picked.includes(c));
  return { correct: picked.length > 0 && wrongPicked.length === 0 && missed.length === 0, wrongPicked, missed, misplaced: [] };
}

/* ---------- 途中から続ける ---------- */

/** 今の回のクイズの答え（回を始めた時刻より後の物） */
function thisRun(lp: LessonProgress | undefined): LessonProgress['quiz'] {
  if (!lp?.startedAt || lp.status !== 'in-progress') return [];
  const start = instantOf(lp.startedAt);
  return lp.quiz.filter((q) => instantOf(q.at) >= start);
}

/** 今の回で正解したクイズの ID */
export function solvedQuiz(lp: LessonProgress | undefined): Set<string> {
  return new Set(thisRun(lp).filter((q) => q.correct).map((q) => q.quizId));
}

/** 今の回で、その問題に何回答えたか */
export function triesOf(lp: LessonProgress | undefined, quizId: string): number {
  return thisRun(lp).filter((q) => q.quizId === quizId).length;
}

/** 開いた時に出す段（学習中なら進んだ段から。それ以外は解説から） */
export function resumeStage(lp: LessonProgress | undefined): LessonStage {
  return lp?.status === 'in-progress' ? lp.stage : 'explain';
}

/** クイズの段で最初に出す問題（今の回でまだ正解していない最初の問題。全て正解なら最後の問題） */
export function resumeQuiz(lesson: Lesson, lp: LessonProgress | undefined): number {
  const solved = solvedQuiz(lp);
  const i = lesson.quiz.findIndex((q) => !solved.has(q.id));
  return i === -1 ? lesson.quiz.length - 1 : i;
}
