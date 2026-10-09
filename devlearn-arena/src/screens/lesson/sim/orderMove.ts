import type { OrderState } from '@/engines/sim/types';

/** 並べるの画面で運んでいる札 */
export interface Carry {
  item: string;
  /** 今ある段（置き場からなら null） */
  from: number | null;
}

/** ドラッグした札を、受け口に入れた後の並び */
export function moveTo(s: OrderState, c: Carry, target: string): string[][] | null {
  const base = s.stages.map((g) => g.filter((x) => x !== c.item));
  if (target === 'pool') return c.from === null ? null : base.filter((g) => g.length > 0);
  if (target === 'end') base.push([c.item]);
  else if (target.startsWith('gap:')) base.splice(Number(target.slice(4)), 0, [c.item]);
  else if (target.startsWith('stage:')) {
    const at = Number(target.slice(6));
    if (at === c.from) return null;
    if (s.setup.parallel) base[at]?.push(c.item);
    // 1 列の並び: 下へ動かす時はその札の後ろ、上へ動かす時と置き場からは、その札の前に入る
    else base.splice(c.from !== null && c.from < at ? at + 1 : at, 0, [c.item]);
  } else return null;
  return base.filter((g) => g.length > 0);
}

