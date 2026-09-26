/**
 * 確かめの段のクイズの判定。画面から切り離した純粋な計算。
 */

/** 選んだ物が、正解とちょうど同じ集まりか */
export function judgePick(answer: readonly string[], chosen: readonly string[]): boolean {
  const want = new Set(answer);
  const got = new Set(chosen);
  return want.size === got.size && [...want].every((id) => got.has(id));
}

/** 並べる札を混ぜる。乱数は使わず、必ず正しい順とは違う並びにする */
export function shuffled<T>(cards: readonly T[]): T[] {
  if (cards.length < 2) return [...cards];
  const reversed = [...cards].reverse();
  const out = [...reversed.slice(1), ...reversed.slice(0, 1)];
  const same = out.every((card, i) => card === cards[i]);
  return same ? reversed : out;
}

/** 並べた札のうち、位置が違うものの番号 */
export function misplaced<T>(cards: readonly T[], placed: readonly T[]): number[] {
  return placed.flatMap((card, i) => (card === cards[i] ? [] : [i]));
}
