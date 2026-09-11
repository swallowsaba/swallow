/**
 * どの手順で何個ヒントを開いたか。
 *
 * 以前はコマンドを実行するたびに 0 へ戻していたため、
 * ヒントを見て打鍵した瞬間にヒントが消えていた。
 * 手順を鍵にして持てば、消すための処理そのものが要らなくなる。
 *
 * ヒントは端末で `hint` と打ったときだけ開く。つまずいた回数で勝手に開くことはしない。
 */
export interface HintReveal {
  /** 対象の手順を表す鍵 */
  key: string;
  count: number;
}

export const NO_HINTS: HintReveal = { key: '', count: 0 };

export function stepKey(missionId: string, stepIndex: number): string {
  return `${missionId}#${String(stepIndex)}`;
}

/** いまの手順に対して開いているヒント数。別の手順のものは数えない */
export function revealedCount(state: HintReveal, key: string): number {
  return state.key === key ? state.count : 0;
}

/** ヒントを1つ開く。手順が変わっていれば 1 から数え直す */
export function reveal(state: HintReveal, key: string): HintReveal {
  return { key, count: revealedCount(state, key) + 1 };
}
