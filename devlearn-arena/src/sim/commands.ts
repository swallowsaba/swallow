import { checkFacility, checkRoad, checkZone, demolish, placeFacility, placeRoad, placeZone, type DemolishTarget } from '@/city/place';
import type { RoadPlan } from '@/city/roads';
import type { Terrain } from '@/city/terrain';
import type { DomainId, Facility, FacilityType, Point, ZoneKind } from '@/city/types';
import { cellKey, facilityCells, roadCellsOf } from '@/city/cells';
import { checkUpgrade, type SkillValueMap } from '@/city/upgrade';
import { file, needsApplication, occupiedSites, permitProblems, rezoneOf, withdraw, type PermitProblem } from './permits';
import { appealConcede, appealSuppress } from './appeal';
import { persuade } from './council';
import { choosePledges, creditMission, noteLearning, rerun } from './election';
import { setTaxRate } from './budget';
import { withNews } from './news';
import { handlePetition, type PetitionChoice } from './petitions';
import { closeHearing, playHand, type Hand } from './hearing';
import { NO_RULES, type Application, type PoliticsRules, type World } from './types';

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
  | { kind: 'withdraw'; applicationId: string }
  /** 公聴会の論点に手を出す（受付の間は先回りの譲歩だけ。docs/game-design.md 17 章）。スキルの値は出した時の値を載せる */
  | { kind: 'hand'; applicationId: string; reasonId: string; hand: Hand; skills: SkillValueMap }
  /** 公聴会を終える（議会の採決の段へ） */
  | { kind: 'closeHearing'; applicationId: string }
  /** 議員を説得する（採決の前。政治資本 3。docs/game-design.md 18.2） */
  | { kind: 'persuade'; applicationId: string; memberId: string }
  /** 異議申し立てに、追加の譲歩で答える（docs/game-design.md 19 章） */
  | { kind: 'appealConcede'; applicationId: string; reasonId: string; concessionId: string; skills: SkillValueMap }
  /** 政治資本 4 で、異議申し立てを抑える */
  | { kind: 'appealSuppress'; applicationId: string }
  /** 任期の初めに、公約を 2 つ選ぶ（docs/game-design.md 21.4） */
  | { kind: 'pledges'; ids: string[] }
  /** ミッションを達成した（政治資本 +3。同じミッションは 1 度だけ。21.5） */
  | { kind: 'mission'; missionId: string }
  /** 落選の後、同じ都市で再び立つ（21.2） */
  | { kind: 'rerun' }
  /** 学習の進み（修了したレッスンの数と分野ごとの段階）。任期の終わりの一覧に使うだけで、市政の条件には使わない */
  | { kind: 'learning'; lessonsDone: number; stages: Partial<Record<DomainId, number>> }
  /** 税率を決める（5〜20%。次の週から効く。docs/game-design.md 22.2） */
  | { kind: 'taxRate'; rate: number }
  /** 請願を扱う（受理・拒否・保留。docs/game-design.md 22.1） */
  | { kind: 'petition'; inboxId: string; choice: PetitionChoice };

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
export function applyOp(world: World, op: Op, terrain: Terrain, rules: PoliticsRules = NO_RULES): World {
  // 命令で起きた出来事（申請を出した・請願の扱い・説得の後の不祥事など）を新聞の記事にする（docs/game-design.md 22.3）
  return withNews(world, applyOpCore(world, op, terrain, rules), rules);
}

function applyOpCore(world: World, op: Op, terrain: Terrain, rules: PoliticsRules): World {
  const city = world.city;
  const day = Math.floor(city.day);
  // 落選して道を選ぶまでは、都市を変える命令を当てない（学習の資金・進み・ミッションと、再び立つは当てる）
  if (world.politics.defeated && !AFTER_DEFEAT.has(op.kind)) return world;
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
      return permitProblems(world, draft, day).length > 0 ? world : file(world, draft, cost, day, terrain, rules);
    }
    case 'facility': {
      const check = checkFacility(city, terrain, op.type, op.origin, op.rotation, world.budget.treasury);
      if (!check.ok) return world;
      if (needsApplication(op.type)) {
        const draft: Pick<Application, 'kind' | 'target'> = { kind: 'facility', target: { type: op.type, origin: { ...op.origin }, rotation: op.rotation } };
        return permitProblems(world, draft, day).length > 0 ? world : file(world, draft, check.cost, day, terrain, rules);
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
      return permitProblems(world, draft, day).length > 0 ? world : file(world, draft, check.cost, day, terrain, rules);
    }
    case 'withdraw':
      return withdraw(world, op.applicationId, day);
    case 'hand':
      return playHand(world, terrain, rules, op.applicationId, op.reasonId, op.hand, op.skills, day).world;
    case 'closeHearing':
      return closeHearing(world, op.applicationId, day);
    case 'persuade':
      return persuade(world, rules, op.applicationId, op.memberId, day).world;
    case 'appealConcede':
      return appealConcede(world, terrain, rules, op.applicationId, op.reasonId, op.concessionId, op.skills, day).world;
    case 'appealSuppress':
      return appealSuppress(world, op.applicationId, day).world;
    case 'funds':
      return { ...world, city: { ...city, funds: city.funds + op.amount } };
    case 'pledges':
      return choosePledges(world, op.ids, rules).world;
    case 'mission':
      return creditMission(world, op.missionId, day);
    case 'rerun':
      return rerun(world, day);
    case 'learning':
      return noteLearning(world, op.lessonsDone, op.stages);
    case 'taxRate':
      return setTaxRate(world, op.rate);
    case 'petition':
      return handlePetition(world, terrain, rules, op.inboxId, op.choice);
  }
}

const AFTER_DEFEAT = new Set<Op['kind']>(['funds', 'mission', 'learning', 'rerun']);

/**
 * 置く命令が申請になるか、申請を出せない理由（配置の小窓に出す。applyOp と同じ判定）。
 * 置く物の判定（道路に面する・重ならない・霧・資金）は呼ぶ側が先に済ませる
 */
export function permitPreview(world: World, op: Op, terrain: Terrain): { application: boolean; problems: PermitProblem[] } {
  const day = Math.floor(world.city.day);
  const sites = occupiedSites(world);
  switch (op.kind) {
    case 'facility': {
      const cells = facilityCells({ type: op.type, origin: op.origin, rotation: op.rotation });
      if (!needsApplication(op.type)) return { application: false, problems: cells.some((c) => sites.has(cellKey(c.x, c.y))) ? ['site'] : [] };
      return { application: true, problems: permitProblems(world, { kind: 'facility', target: { type: op.type, origin: op.origin, rotation: op.rotation } }, day) };
    }
    case 'zone': {
      const check = checkZone(world.city, terrain, op.zone, op.a, op.b);
      const paint = check.paint.filter((c) => !sites.has(cellKey(c.x, c.y)));
      if (paint.length === 0) return { application: false, problems: check.paint.length > 0 ? ['site'] : [] };
      const rezone = rezoneOf(world, op.zone, paint);
      if (!rezone.needed) return { application: false, problems: [] };
      return { application: true, problems: permitProblems(world, { kind: 'rezone', target: { zone: { kind: op.zone, cells: paint } } }, day) };
    }
    case 'upgrade': {
      const level = checkUpgrade(world.city, op.facilityId, op.skills)?.level ?? 2;
      return { application: true, problems: permitProblems(world, { kind: 'upgrade', target: { facilityId: op.facilityId, toLevel: level as 2 | 3 | 4 | 5 } }, day) };
    }
    default:
      return { application: false, problems: [] };
  }
}
