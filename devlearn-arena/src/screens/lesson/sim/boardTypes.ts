import type { SimAction, SimOutcome, SimState } from '@/engines/sim/types';

/** 型ごとの画面に渡す物。操作は act に渡し、結果（エラーの文）をその場の動きに使う。状態を変えるのは模擬（src/engines/sim）だけ */
export interface BoardProps<S extends SimState> {
  s: S;
  act: (action: SimAction) => SimOutcome;
  /** 今の手順の達成条件の式（全て置いた・並べたのに合っていない時、どこが違うかを示すのに使う）。終えていれば null */
  expr: string | null;
}
