import { CAPACITY } from '@/city/rules';
import type { City, ZoneKind } from '@/city/types';
import type { PoliticsRules, World } from './types';

/**
 * 電力の使う量と余り（docs/game-design.md 24.1）。
 * 住宅 0.5 / 1,000 人・店 1 / 1,000 人の仕事・事務所 1.5 / 1,000 人・工場 3 / 1,000 人・施設は定義の MW × Lv（譲歩の power を掛ける）。
 * 来る電気は、外からの電気の上限（発電所は G10 で足す）。申請中・工事中の施設は数えない（15.2）
 */

/** 区画の建物の、1,000 人あたりの使う量（MW） */
export const ZONE_POWER_PER_1000: Record<ZoneKind, number> = { residential: 0.5, commercial: 1, office: 1.5, industrial: 3 };

/** 区画の建物 1 つの使う量（建物の大きさの人数・仕事から） */
export function zonePowerOf(kind: ZoneKind, level: number): number {
  return ((CAPACITY[kind][level - 1] ?? 0) / 1000) * ZONE_POWER_PER_1000[kind];
}

/** 都市の使う量（MW） */
export function powerUse(city: Pick<City, 'zones' | 'buildings' | 'facilities'>, rules: PoliticsRules): number {
  const kindOf = new Map(city.zones.map((z) => [z.id, z.kind]));
  let mw = 0;
  for (const b of city.buildings) {
    const kind = kindOf.get(b.zoneId);
    if (kind) mw += zonePowerOf(kind, b.level);
  }
  for (const f of city.facilities) {
    if (f.state !== 'active') continue;
    mw += (rules.facilities[f.type]?.powerMW ?? 0) * f.level * (f.mods?.power ?? 1);
  }
  return mw;
}

/** 来る電気（MW） */
export function powerSupply(world: Pick<World, 'sim'>): number {
  return world.sim.power.externalCapMW;
}
