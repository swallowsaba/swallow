/**
 * どの手順で何個ヒントを開いたか。
 *
 * 以前はコマンドを実行するたびに 0 へ戻していたため、
 * ヒントを見て打鍵した瞬間にヒントが消えていた。
 * 手順を鍵にして持てば、消すための処理そのものが要らなくなる。
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

/** 何回つまずいたら次のヒントを自分から開くか */
const FIRST_AUTO_HINT = 3;
const EVERY = 2;

/**
 * 同じ手順で何度も通らないときに、こちらから開くヒントの数。
 *
 * 手が止まったまま放置されるほうが学びを損なうので、
 * 3 回目からは黙って1つ開き、以後は 2 回ごとに増やす。
 */
export function autoHintCount(attempts: number): number {
  if (attempts < FIRST_AUTO_HINT) return 0;
  return Math.floor((attempts - FIRST_AUTO_HINT) / EVERY) + 1;
}

/** 次に自分からヒントが開くまで、あと何回か */
export function attemptsUntilNextHint(attempts: number): number {
  if (attempts < FIRST_AUTO_HINT) return FIRST_AUTO_HINT - attempts;
  return EVERY - ((attempts - FIRST_AUTO_HINT) % EVERY);
}

/** 実際に見せるヒントの数。自分で開いた数と、自動で開いた数の多いほう */
export function shownHints(state: HintReveal, key: string, attempts: number, total: number): number {
  return Math.min(total, Math.max(revealedCount(state, key), autoHintCount(attempts)));
}

/** 答えそのものを見せてよいか。ヒントを出し切ってもなお通らないとき */
export function shouldShowAnswer(attempts: number, hintCount: number): boolean {
  return autoHintCount(attempts) > hintCount;
}
