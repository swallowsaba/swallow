import { growsFromCommand } from './growth';

/**
 * いま街を旅している 1 行。
 *
 * 打ったコマンドが街のどこに効いたのかは、荷車が停留所を巡ることで見える（REWORK 3-3）。
 * ここは「どの行を旅に出すか」だけを決める。道のりを組むのは `src/city/journey.ts`。
 */
export interface Trip {
  line: string;
  /** 何本目の旅か。同じコマンドを続けて打っても別の旅として数える */
  serial: number;
}

/**
 * 次に旅へ出す行を決める。
 *
 * 通ったコマンドだけが旅に出る。失敗した行と、助けを求めた行（hint や answer）は出さない。
 * 街が育つきっかけと同じ線引きにしてあるので、育ったのに荷車が走らない、ということが起きない。
 */
export function nextTrip(before: Trip | null, line: string, exitCode: number): Trip | null {
  if (!growsFromCommand(line, exitCode)) return before;
  return { line: line.trim(), serial: (before?.serial ?? 0) + 1 };
}
