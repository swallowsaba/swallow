import { START_CAPITAL } from './election';
import type { Difficulty, World } from './types';

/**
 * 始め方（docs/game-design.md 27 章）: 反対の組織化の度合いを、新しく始める時に選ぶ。
 * 係数は src/sim/opposition.ts の ORGANIZATION、申し立ての境は src/sim/appeal.ts の APPEAL_BORDER、初めの政治資本は START_CAPITAL。
 * 初めの人口・区画・施設・資金は、どの始め方でも同じ
 */

/** 始め方の 3 つ（始め方の選択の窓の並び。docs/ui-design.md 10.12） */
export const START_MODES: readonly { id: Difficulty; name: string }[] = [
  { id: 'gentle', name: '穏やかな町' },
  { id: 'normal', name: 'ふつう' },
  { id: 'tough', name: '手ごわい町' },
];

/** 始め方を選べるか: 1 期目で、まだ申請を出しておらず、政治資本も動かしていない（始めた後に手ごわさを変えない） */
export function canChooseStart(world: Pick<World, 'politics' | 'applications'>): boolean {
  const p = world.politics;
  return p.term.no === 1 && p.pastTerms.length === 0 && p.capitalLog.length === 0 && world.applications.length === 0;
}

/** 始め方を決める（組織化の係数と申し立ての境は difficulty から読む。政治資本は、その始め方の初めの値にする） */
export function chooseStart(world: World, difficulty: Difficulty): World {
  if (!canChooseStart(world) || world.politics.difficulty === difficulty) return world;
  return { ...world, politics: { ...world.politics, difficulty, capital: START_CAPITAL[difficulty] } };
}
