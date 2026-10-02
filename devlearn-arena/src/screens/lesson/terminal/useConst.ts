import { useRef } from 'react';

/**
 * 初回レンダー時に1度だけ生成し、以後同じ実体を返す。
 * `useRef(null)` + `??=` だと型が `T | null` のままになるため、
 * 生成済みかどうかを値の有無で判定して絞り込む。
 */
export function useConst<T>(factory: () => T): T {
  const ref = useRef<T>();
  const current = ref.current;
  if (current !== undefined) return current;
  const created = factory();
  ref.current = created;
  return created;
}
