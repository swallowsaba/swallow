import type { Difficulty } from './types';

/**
 * XP の表（docs/game-design.md 3 章）。純粋な関数だけを置き、表はテストで固定する。
 * 端数は 1 つの行動ごとに四捨五入して整数にする（docs/decisions.md D-10）。
 */

export const XP_TABLE = {
  /** レッスンのまとめまで到達（初回） */
  complete: { b: 30, i: 50, a: 80 } as Record<Difficulty, number>,
  /** クイズに初回で正解（1 問ごと） */
  quizFirstTry: 5,
  /** クイズに 2 回目以降で正解 */
  quizRetry: 2,
  /** 実戦を成功（ヒント無し） */
  practice: { b: 20, i: 35, a: 55 } as Record<Difficulty, number>,
  /** 実戦を成功（ヒントあり）は上の半分 */
  hintFactor: 1 / 2,
  /** エラーから自力で回復して成功 */
  troubleshootBonus: 10,
  /** スキルが次の段階に上がる */
  skillUp: 50,
  /** 復習（間隔反復の予定日に同じ内容を正解） */
  review: 10,
  /** 同じレッスンを 2 回目以降に終えた時、クイズと実戦は 1/4 */
  repeatFactor: 1 / 4,
  /** この回数以上の誤答の後に正解した問題は 0（総当たり） */
  bruteForceWrongs: 3,
} as const;

/** レッスンの 2 回目以降の回か（1 回以上まとめまで到達している） */
export interface RunContext {
  repeat: boolean;
}

/** まとめまで到達した時の XP。2 回目以降は 0 */
export function completionXp(difficulty: Difficulty, ctx: RunContext): number {
  return ctx.repeat ? 0 : XP_TABLE.complete[difficulty];
}

/**
 * クイズの 1 問に答えた時の XP。
 * tryNo はこの回の中で何回目の答えか。誤答・この回で既に正解した問題・3 回以上の誤答の後の正解は 0。
 */
export function quizXp(a: { correct: boolean; tryNo: number; alreadyCorrect: boolean }, ctx: RunContext): number {
  if (!a.correct || a.alreadyCorrect) return 0;
  const wrongs = a.tryNo - 1;
  if (wrongs >= XP_TABLE.bruteForceWrongs) return 0;
  const base = wrongs === 0 ? XP_TABLE.quizFirstTry : XP_TABLE.quizRetry;
  return Math.round(ctx.repeat ? base * XP_TABLE.repeatFactor : base);
}

/** 実戦の XP（エラーからの回復の分を除く）。ヒントを使ったら半分 */
export function practiceXp(a: { difficulty: Difficulty; success: boolean; hintsUsed: number }, ctx: RunContext): number {
  if (!a.success) return 0;
  let xp: number = XP_TABLE.practice[a.difficulty];
  if (a.hintsUsed > 0) xp *= XP_TABLE.hintFactor;
  if (ctx.repeat) xp *= XP_TABLE.repeatFactor;
  return Math.round(xp);
}

/** エラーから自力で回復して成功した時に、実戦の XP に足す分 */
export function troubleshootXp(a: { success: boolean; recoveredFromError: boolean }, ctx: RunContext): number {
  if (!a.success || !a.recoveredFromError) return 0;
  return Math.round(ctx.repeat ? XP_TABLE.troubleshootBonus * XP_TABLE.repeatFactor : XP_TABLE.troubleshootBonus);
}

/** 復習に答えた時の XP。予定日（以降）に正解した時だけ */
export function reviewXp(a: { correct: boolean; due: string; day: string }): number {
  return a.correct && a.due <= a.day ? XP_TABLE.review : 0;
}

/** スキルの段階が上がった時の XP（上がった段の数だけ） */
export function skillUpXp(fromStage: number, toStage: number): number {
  return Math.max(0, toStage - fromStage) * XP_TABLE.skillUp;
}
