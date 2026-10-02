import { INITIAL_FUNDS, revealedFor } from './rules';
import type { City } from './types';

/**
 * 新しい都市（村の始まり）。霧の晴れた中央の 24×24 に、1 本の一般道だけがある。
 * ここから学習者が道路を引き、区画を塗り、施設を置いて都市を形づくる（docs/decisions.md D-03）。
 */
export function newCity(seed = 20261002, name = 'みなと市'): City {
  return {
    seed,
    name,
    day: 0,
    funds: INITIAL_FUNDS,
    stage: 1,
    population: 0,
    techPower: 0,
    revealed: revealedFor(1),
    roads: [{ id: 'r1', kind: 'street', path: [{ x: 37.5, y: 47.5 }, { x: 58.5, y: 47.5 }] }],
    zones: [],
    buildings: [],
    facilities: [],
  };
}
