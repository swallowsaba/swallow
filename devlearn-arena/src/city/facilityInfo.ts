import type { SkillStage } from '@/game/skill';
import type { Stage } from '@/game/stage';
import domainsData from '../../content/domains.json';
import { cellKey, facilityFacesRoad, occupancyOf } from './cells';
import { FACILITY_DEFS, isLargeFacility } from './facilities';
import { constructionStage, PARK_RADIUS, upgradeCost, type ConstructionStage } from './rules';
import type { City, DomainId, Facility, FacilityType } from './types';

/**
 * 施設の情報（docs/ui-design.md 5 章の情報パネルの中身）。純粋な計算。
 * 名前・種類・レベル・次のレベルの条件・状態・対応する分野。
 */

export type FacilityCondition =
  | { kind: 'active' }
  | { kind: 'constructing'; stage: Exclude<ConstructionStage, 'done'> }
  | { kind: 'no-road' };

export function facilityCondition(f: Facility, city: City): FacilityCondition {
  if (f.state === 'constructing') {
    const stage = constructionStage(f.builtDay, city.day);
    return { kind: 'constructing', stage: stage === 'done' ? 'frame' : stage };
  }
  const roads = occupancyOf(city).roads;
  if (!facilityFacesRoad(f, roads, FACILITY_DEFS[f.type].group === 'facility')) return { kind: 'no-road' };
  return { kind: 'active' };
}

export interface NextLevel {
  level: number;
  /** その分野のスキル段階がこれ以上 */
  skillStage: SkillStage;
  /** 都市の発展段階がこれ以上（大型施設の Lv3〜Lv5 だけ。ほかは 1） */
  cityStage: Stage;
  cost: number;
}

/** 次のレベルの条件（docs/game-design.md 5・6 章）。Lv5 なら null */
export function nextLevelOf(f: Facility): NextLevel | null {
  if (f.level >= 5) return null;
  const level = f.level + 1;
  const cityStage = (isLargeFacility(f.type) && level >= 3 ? level : 1) as Stage;
  return { level, skillStage: level as SkillStage, cityStage, cost: upgradeCost(FACILITY_DEFS[f.type].cost, level) };
}

export interface DomainInfo {
  id: DomainId;
  name: string;
  facility: FacilityType;
  description: string;
  prerequisites: DomainId[];
  related: DomainId[];
  next: DomainId[];
}

export const DOMAINS: DomainInfo[] = domainsData.domains as DomainInfo[];

/** 施設に対応する分野（コンテナ施設はコンテナと Docker の 2 つ） */
export function domainsOfFacility(type: FacilityType): DomainInfo[] {
  return DOMAINS.filter((d) => d.facility === type);
}

/** 公園の類が育ちを良くしている区画の建物の数（周り PARK_RADIUS マス） */
export function parkReach(f: Facility, city: City): number {
  const def = FACILITY_DEFS[f.type];
  const cx = f.origin.x + def.w / 2;
  const cy = f.origin.y + def.d / 2;
  const seen = new Set<string>();
  for (const b of city.buildings) {
    if (Math.hypot(b.cell.x + 0.5 - cx, b.cell.y + 0.5 - cy) <= PARK_RADIUS + def.w / 2) seen.add(cellKey(b.cell.x, b.cell.y));
  }
  return seen.size;
}
