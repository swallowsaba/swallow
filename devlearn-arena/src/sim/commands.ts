import { checkFacility, checkRoad, checkZone, demolish, placeFacility, placeRoad, placeZone, type DemolishTarget } from '@/city/place';
import type { RoadPlan } from '@/city/roads';
import type { Terrain } from '@/city/terrain';
import type { Facility, FacilityType, Point, ZoneKind } from '@/city/types';
import { cellKey, facilityCells, roadCellsOf } from '@/city/cells';
import { checkUpgrade, type SkillValueMap } from '@/city/upgrade';
import { file, needsApplication, occupiedSites, permitProblems, rezoneOf, withdraw } from './permits';
import type { Application, World } from './types';

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
  | { kind: 'funds'; amount: number }
  /** 申請を取り下げる（着工の前。費用は全て戻る。docs/game-design.md 15.2） */
  | { kind: 'withdraw'; applicationId: string };

export interface Command {
  /** 出した順の番号（画面が付ける。模擬が当てた所までを返す） */
  seq: number;
  /** 命令を出した日（都市の日付の整数） */
  day: number;
  op: Op;
}

/**
 * 命令を 1 つ当てる。当てられなければ、世界をそのまま返す。
 * IT 施設・アップグレード・人の住む所の隣の用途地域の変更は、置いたらすぐ建てずに申請にする（docs/game-design.md 15.1）。
 * 申請中・工事中の敷地には、ほかの物を置けない
 */
export function applyOp(world: World, op: Op, terrain: Terrain): World {
  const city = world.city;
  const day = Math.floor(city.day);
  switch (op.kind) {
    case 'road': {
      const check = checkRoad(city, terrain, op.plan);
      if (!check.ok) return world;
      const sites = occupiedSites(world);
      if (check.roads.some((r) => roadCellsOf(r).some((c) => sites.has(cellKey(c.x, c.y))))) return world;
      return { ...world, city: placeRoad(city, check) };
    }
    case 'zone': {
      const check = checkZone(city, terrain, op.zone, op.a, op.b);
      if (!check.ok) return world;
      const sites = occupiedSites(world);
      const paint = check.paint.filter((c) => !sites.has(cellKey(c.x, c.y)));
      if (paint.length === 0) return world;
      const cost = check.cost * (paint.length / check.paint.length);
      const rezone = rezoneOf(world, op.zone, paint);
      if (!rezone.needed) return { ...world, city: placeZone(city, op.zone, { ...check, paint, cost }) };
      const draft: Pick<Application, 'kind' | 'target'> = { kind: 'rezone', target: { zone: { kind: op.zone, cells: paint, ...(rezone.from ? { from: rezone.from } : {}) } } };
      return permitProblems(world, draft, day).length > 0 ? world : file(world, draft, cost, day);
    }
    case 'facility': {
      const check = checkFacility(city, terrain, op.type, op.origin, op.rotation);
      if (!check.ok) return world;
      if (needsApplication(op.type)) {
        const draft: Pick<Application, 'kind' | 'target'> = { kind: 'facility', target: { type: op.type, origin: { ...op.origin }, rotation: op.rotation } };
        return permitProblems(world, draft, day).length > 0 ? world : file(world, draft, check.cost, day);
      }
      const sites = occupiedSites(world);
      if (facilityCells({ type: op.type, origin: op.origin, rotation: op.rotation }).some((c) => sites.has(cellKey(c.x, c.y)))) return world;
      return { ...world, city: placeFacility(city, op.type, op.origin, op.rotation, check, op.landmark) };
    }
    case 'demolish': {
      // 施設を壊すと、その施設のアップグレードの申請は取り下げになる（費用は戻る）
      let w = world;
      if (op.target.kind === 'facility') {
        const id = op.target.id;
        for (const a of world.applications) if (a.kind === 'upgrade' && a.target.facilityId === id) w = withdraw(w, a.id, day);
      }
      return { ...w, city: demolish(w.city, op.target) };
    }
    case 'upgrade': {
      const check = checkUpgrade(city, op.facilityId, op.skills);
      if (!check?.ok) return world;
      const draft: Pick<Application, 'kind' | 'target'> = { kind: 'upgrade', target: { facilityId: op.facilityId, toLevel: check.level as 2 | 3 | 4 | 5 } };
      return permitProblems(world, draft, day).length > 0 ? world : file(world, draft, check.cost, day);
    }
    case 'withdraw':
      return withdraw(world, op.applicationId, day);
    case 'funds':
      return { ...world, city: { ...city, funds: city.funds + op.amount } };
  }
}
