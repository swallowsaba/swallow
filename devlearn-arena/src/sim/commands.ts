import { checkFacility, checkRoad, checkZone, demolish, placeFacility, placeRoad, placeZone, type DemolishTarget } from '@/city/place';
import type { RoadPlan } from '@/city/roads';
import type { Terrain } from '@/city/terrain';
import type { Facility, FacilityType, Point, ZoneKind } from '@/city/types';
import { checkUpgrade, upgradeFacility, type SkillValueMap } from '@/city/upgrade';
import type { World } from './types';

/**
 * 日付付きの命令（docs/architecture.md 9.1）。画面の操作は、全てこの形で模擬へ送る。
 * 命令は日の区切りで、受け取った順に当てる。同じ命令の列からは同じ世界になる（docs/game-design.md 26 章）。
 * 置く物の判定は、当てる時にもう一度行う（判定に通らなければ何もしない）。
 */
export type Op =
  | { kind: 'road'; plan: RoadPlan }
  | { kind: 'zone'; zone: ZoneKind; a: Point; b: Point }
  | { kind: 'facility'; type: FacilityType; origin: Point; rotation: Facility['rotation']; landmark?: string }
  | { kind: 'demolish'; target: DemolishTarget }
  /** 施設を上げる。スキルの値は、命令を出した時の値を載せる（同じ命令からは同じ結果になる） */
  | { kind: 'upgrade'; facilityId: string; skills: SkillValueMap }
  /** 学習とミッションで得た開発資金（docs/game-design.md 2 章） */
  | { kind: 'funds'; amount: number };

export interface Command {
  /** 出した順の番号（画面が付ける。模擬が当てた所までを返す） */
  seq: number;
  /** 命令を出した日（都市の日付の整数） */
  day: number;
  op: Op;
}

/** 命令を 1 つ当てる。当てられなければ、世界をそのまま返す */
export function applyOp(world: World, op: Op, terrain: Terrain): World {
  const city = world.city;
  switch (op.kind) {
    case 'road': {
      const check = checkRoad(city, terrain, op.plan);
      return check.ok ? { ...world, city: placeRoad(city, check) } : world;
    }
    case 'zone': {
      const check = checkZone(city, terrain, op.zone, op.a, op.b);
      return check.ok ? { ...world, city: placeZone(city, op.zone, check) } : world;
    }
    case 'facility': {
      const check = checkFacility(city, terrain, op.type, op.origin, op.rotation);
      return check.ok ? { ...world, city: placeFacility(city, op.type, op.origin, op.rotation, check, op.landmark) } : world;
    }
    case 'demolish':
      return { ...world, city: demolish(city, op.target) };
    case 'upgrade': {
      const check = checkUpgrade(city, op.facilityId, op.skills);
      return check?.ok ? { ...world, city: upgradeFacility(city, check) } : world;
    }
    case 'funds':
      return { ...world, city: { ...city, funds: city.funds + op.amount } };
  }
}
