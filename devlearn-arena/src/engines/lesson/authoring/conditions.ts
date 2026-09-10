import type { AssertContext } from '../types';
import type { Check } from './assert';

/**
 * 通過条件を「小さな条件の集まり」として持つ。
 *
 * 合否だけを返す関数にしてしまうと、
 * 正しそうなコマンドを打ったのに通らないとき、
 * 学ぶ側には何が足りないのか分からない。
 * 条件を名前付きで分けておけば、どれが満たされていないかを画面に出せる。
 */
export interface Condition {
  /** 人が読める条件。「〜であること」の形で書く */
  label: string;
  test: Check;
  /** 満たされていないときに何を見ればよいか */
  howTo?: string;
}

export interface StepCondition {
  assert: Check;
  parts: readonly Condition[];
  /** 全ての条件を並べた文字列。step.check にそのまま使える */
  summary: string;
}

export function requireAll(...parts: readonly Condition[]): StepCondition {
  return {
    parts,
    assert: (ctx) => parts.every((p) => p.test(ctx)),
    summary: parts.map((p) => p.label).join(' / '),
  };
}

/** いま満たされている条件と、まだのものを分ける */
export function evaluateParts(
  parts: readonly Condition[],
  ctx: AssertContext,
): { condition: Condition; passing: boolean }[] {
  return parts.map((condition) => {
    let passing = false;
    try {
      passing = condition.test(ctx);
    } catch {
      passing = false;
    }
    return { condition, passing };
  });
}

/** まだ満たされていない条件から、次の一手の助言を作る */
export function adviseFromParts(
  parts: readonly Condition[],
  ctx: AssertContext,
): string | null {
  const pending = evaluateParts(parts, ctx).filter((p) => !p.passing);
  if (pending.length === 0) return null;
  const first = pending[0];
  if (!first) return null;
  const head = `まだ「${first.condition.label}」が満たされていません。`;
  return first.condition.howTo === undefined ? head : `${head}${first.condition.howTo}`;
}
