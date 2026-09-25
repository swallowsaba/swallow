import type { WorldState } from '@/city/journey';
import { growsFromCommand } from './growth';

/**
 * いま街を旅している 1 行。
 *
 * 打ったコマンドが街のどこに効いたのかは、光の粒が停留所を巡ることで見える（REWORK 2）。
 * ここは「どの行を旅に出すか」と「見比べる 2 つの状態」だけを決める。
 * 道のりを組むのは `src/city/journey.ts`。
 */
export interface Trip {
  line: string;
  /** 何本目の旅か。同じコマンドを続けて打っても別の旅として数える */
  serial: number;
  /** 打つ前の模型 */
  before: WorldState;
  /** 打った後の模型 */
  after: WorldState;
}

/**
 * 次に旅へ出す行を決める。
 *
 * 通ったコマンドだけが旅に出る。失敗した行と、助けを求めた行（hint や answer）は出さない。
 * 街が育つきっかけと同じ線引きにしてあるので、育ったのに粒が走らない、ということが起きない。
 */
export function nextTrip(
  previous: Trip | null,
  line: string,
  exitCode: number,
  world: { before: WorldState; after: WorldState },
): Trip | null {
  if (!growsFromCommand(line, exitCode)) return previous;
  return {
    line: line.trim(),
    serial: (previous?.serial ?? 0) + 1,
    before: world.before,
    after: world.after,
  };
}
