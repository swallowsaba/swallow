/**
 * 仕切りで2つに分けた格子の並び（grid-template-columns / rows）。
 * 手前が ratio%、奥が残り、間に仕切りの分（auto）を挟む。
 *
 * どちらも minmax(0, …fr) にして、中身の量で大きさが変わらないようにする。
 * 中身が溢れたらその枠の中で送る。ヒントが増えても端末が縮まないのはこのため。
 */
export function splitTemplate(ratio: number): string {
  return `minmax(0, ${String(ratio)}fr) auto minmax(0, ${String(100 - ratio)}fr)`;
}
