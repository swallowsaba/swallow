import { FACILITY_DEFS } from '@/city/facilities';
import type { Facility } from '@/city/types';
import { reach } from './network';
import { PARK_REACH } from './rules';
import { CELLS, frontsOf, indexOf, inMap, SIZE, type Space } from './space';

/**
 * 施設が届く範囲（docs/ui-design.md 11.1・11.5）: 公共サービスと公園の類は、道路で行き届く距離の手前までの道路に面した陸のマス、
 * 発電所は、面している道路網の全ての道路に面した陸のマス（電気は道路に沿って届く。docs/game-design.md 24 章）。
 * 置く前の予告（置く場所の枠に、増える範囲を縁で示す）と、行き届きのヒートマップで施設を押した時に使う。
 * 道路に面していなければ空。範囲の無い施設（IT 施設）は null
 */
export function reachAreaOf(space: Pick<Space, 'roadKind'>, f: Pick<Facility, 'type' | 'origin' | 'rotation'>): number[] | null {
  const def = FACILITY_DEFS[f.type];
  const distance = def.group === 'power' ? CELLS : (def.coverage?.distance ?? PARK_REACH[f.type]);
  if (distance === undefined) return null;
  const fronts = frontsOf(f as Facility, space.roadKind);
  const roads = reach(space as Space, fronts, distance);
  const out = new Set<number>();
  for (const [i, d] of roads) {
    // 行き届きは距離 0 で 1、行き届く距離で 0（届く距離ちょうどの道路に面したマスは 0 なので数えない）
    if (d >= distance) continue;
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inMap(nx, ny)) continue;
      const j = indexOf(nx, ny);
      if ((space.roadKind[j] ?? -1) < 0) out.add(j);
    }
  }
  return [...out].sort((a, b) => a - b);
}
