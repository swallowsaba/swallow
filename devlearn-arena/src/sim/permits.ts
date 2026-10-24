import { cellKey, facilityCells, occupancyOf } from '@/city/cells';
import { FACILITY_DEFS, footprintOf } from '@/city/facilities';
import { nextId, type ReasonCode } from '@/city/place';
import { mergeMods, ZONE_RULES } from '@/city/rules';
import type { City, Facility, FacilityType, Point, Zone, ZoneKind } from '@/city/types';
import type { Terrain } from '@/city/terrain';
import { oppositionOf, risingShare } from './opposition';
import { NO_RULES, type Application, type ApplicationStage, type PoliticsRules, type World } from './types';

/**
 * 許認可（docs/game-design.md 15 章）。置いた物は申請になり、段階を順に進んで、着工・完成する。
 *
 *   置く → 申請 → 用途地域の審査（7 日）→ 反対の受付（14 日）→ 公聴会（最大 14 日）→ 議会の採決（次の議会の日）
 *        → 異議申し立て（28 日）→ 着工 → 完成
 *
 * 費用は申請を出した時に取り分け、否決・取り下げで全て戻す。申請中の物は模擬に数えない（施設は着工の時に足し、完成の日に動き出す）。
 * 全て純粋な関数。
 */

/** 段階の日数（15.2） */
export const STAGE_DAYS = { zoning: 7, objection: 14, hearing: 14, appeal: 28 } as const;
/** 議会は 14 日ごとに開く（14 日目・28 日目…） */
export const COUNCIL_EVERY = 14;
/** 同時に審議できる申請の数 */
export const MAX_PENDING = 6;
/** 否決の後、同じ場所に同じ物を再び出せるまでの日数 */
export const RETRY_DAYS = 28;
/** 同意の案件（公聴会を省き、採決なしに可決）になる反対率の上限（%） */
export const CONSENT_LIMIT = 20;
/** 用途地域の変更が申請になる、人の住む住宅の建物からの距離（マス） */
export const REZONE_NEAR = 3;
/** 終わった申請を残す日数（1 任期。許認可の一覧の「終わった申請」） */
export const KEEP_FINISHED_DAYS = 208 * 7;

/** 審議中の段階（着工の前。取り下げられる・6 件に数える） */
export const REVIEW_STAGES: readonly ApplicationStage[] = ['filed', 'zoning', 'objection', 'hearing', 'council', 'appeal'];
/** 許認可の一覧の 8 段（申請・用途地域の審査・反対の受付・公聴会・議会の採決・異議申し立て・着工・完成） */
export const PROGRESS_STAGES: readonly ApplicationStage[] = ['filed', 'zoning', 'objection', 'hearing', 'council', 'appeal', 'construction', 'done'];

/** 段階の名前（許認可の一覧・看板・詳細） */
export const STAGE_LABEL: Record<ApplicationStage, string> = {
  filed: '申請',
  zoning: '用途地域の審査',
  objection: '反対の受付',
  hearing: '公聴会',
  council: '議会の採決',
  appeal: '異議申し立て',
  construction: '工事',
  done: '完成',
  rejected: '否決',
  withdrawn: '取り下げ',
};

export const isReviewing = (a: Pick<Application, 'stage'>): boolean => REVIEW_STAGES.includes(a.stage);
export const isOpen = (a: Pick<Application, 'stage'>): boolean => isReviewing(a) || a.stage === 'construction';

/** 施設を置くと申請になるか（IT 施設 15 種。公園の類と記念碑は今までどおり即時。15.1） */
export function needsApplication(type: FacilityType): boolean {
  return FACILITY_DEFS[type].group === 'facility';
}

/** 着工から完成までの日数（15.2）。施設は大きさ、アップグレードは 21、用途地域の変更は 0 */
export function buildDaysOf(app: Pick<Application, 'kind' | 'target'>): number {
  if (app.kind === 'upgrade') return 21;
  if (app.kind === 'rezone') return 0;
  const type = app.target.type;
  if (!type) return 0;
  const s = footprintOf(type, app.target.rotation ?? 0);
  const big = Math.max(s.w, s.d);
  const small = Math.min(s.w, s.d);
  if (big <= 2 && small <= 1) return 14;
  if (big === 2) return 28;
  if (big === 3 && small === 2) return 35;
  return 42;
}

/** 次の議会の日（day より後の、14 で割り切れる日） */
export function nextCouncilDay(day: number): number {
  return (Math.floor(day / COUNCIL_EVERY) + 1) * COUNCIL_EVERY;
}

/** 申請の敷地のマス（施設は敷地、アップグレードはその施設の敷地、用途地域の変更は塗るマス） */
export function siteCells(app: Pick<Application, 'kind' | 'target'>, city: Pick<City, 'facilities'>): Point[] {
  if (app.kind === 'rezone') return app.target.zone?.cells ?? [];
  if (app.kind === 'upgrade') {
    const f = city.facilities.find((x) => x.id === app.target.facilityId);
    return f ? facilityCells(f) : [];
  }
  if (!app.target.type || !app.target.origin) return [];
  return facilityCells({ type: app.target.type, origin: app.target.origin, rotation: app.target.rotation ?? 0 });
}

/** 申請の名前（施設の名前・「Lv3 への アップグレード」・「工業区画への変更」） */
export function applicationName(app: Pick<Application, 'kind' | 'target'>, city: Pick<City, 'facilities'>): string {
  if (app.kind === 'rezone') return `${ZONE_RULES[app.target.zone?.kind ?? 'industrial'].name}区画への変更`;
  if (app.kind === 'upgrade') {
    const f = city.facilities.find((x) => x.id === app.target.facilityId);
    return `${f ? FACILITY_DEFS[f.type].name : '施設'}の Lv${String(app.target.toLevel ?? 2)} へのアップグレード`;
  }
  return app.target.type ? FACILITY_DEFS[app.target.type].name : '施設';
}

/** 申請を出せない理由（置く物の判定とは別。docs/city-design.md 8 章の「審議中の申請が多すぎる」など） */
export type PermitProblem = 'too-many' | 'site' | 'rejected-recently';
/** 理由の文は配置の理由と同じ所（src/city/place.ts）に置く */
export const PERMIT_REASON = { 'too-many': 'permit-many', site: 'permit-site', 'rejected-recently': 'permit-retry' } as const satisfies Record<PermitProblem, ReasonCode>;

/** 審議中・工事中の敷地のマス（他の物を置けない） */
export function occupiedSites(world: Pick<World, 'applications' | 'city'>): Set<string> {
  const out = new Set<string>();
  for (const a of world.applications) {
    if (!isOpen(a) || a.kind === 'upgrade') continue;
    for (const c of siteCells(a, world.city)) out.add(cellKey(c.x, c.y));
  }
  return out;
}

/** 申請を出せるか（6 件まで・敷地が重ならない・否決から 28 日）。出せなければ理由 */
export function permitProblems(world: Pick<World, 'applications' | 'city'>, draft: Pick<Application, 'kind' | 'target'>, day: number): PermitProblem[] {
  const out: PermitProblem[] = [];
  if (world.applications.filter(isReviewing).length >= MAX_PENDING) out.push('too-many');
  const sites = occupiedSites(world);
  const cells = siteCells(draft, world.city);
  if (draft.kind === 'upgrade') {
    if (world.applications.some((a) => isOpen(a) && a.kind === 'upgrade' && a.target.facilityId === draft.target.facilityId)) out.push('site');
  } else if (cells.some((c) => sites.has(cellKey(c.x, c.y)))) {
    out.push('site');
  }
  const key = sameKey(draft, world.city);
  if (world.applications.some((a) => a.stage === 'rejected' && day - a.stageDay < RETRY_DAYS && sameKey(a, world.city) === key)) out.push('rejected-recently');
  return out;
}

/** 「同じ場所に同じ物」を見分ける鍵 */
function sameKey(a: Pick<Application, 'kind' | 'target'>, city: Pick<City, 'facilities'>): string {
  const cells = siteCells(a, city).map((c) => cellKey(c.x, c.y)).sort().join(';');
  return `${a.kind}|${a.target.type ?? ''}|${a.target.zone?.kind ?? ''}|${a.target.toLevel ?? ''}|${cells}`;
}

/**
 * 用途地域の変更が申請になるか（15.1）: 1 回のドラッグで塗る区画が
 * (1) 人が住む住宅の建物から 3 マス以内に、工業・商業・オフィスの区画を塗る時
 * (2) 既にある区画の種類を変える時
 * 申請になる時は、変える前の種類（あれば）を返す
 */
export function rezoneOf(world: Pick<World, 'city' | 'sim'>, kind: ZoneKind, paint: readonly Point[]): { needed: boolean; from?: ZoneKind } {
  const occ = occupancyOf(world.city);
  let from: ZoneKind | undefined;
  for (const c of paint) {
    const z = occ.zones.get(cellKey(c.x, c.y));
    if (z && z.kind !== kind) {
      from = z.kind;
      break;
    }
  }
  if (from) return { needed: true, from };
  if (kind === 'residential') return { needed: false };
  const zoneKind = new Map(world.city.zones.map((z) => [z.id, z.kind]));
  const homes = world.city.buildings.filter((b) => zoneKind.get(b.zoneId) === 'residential' && (world.sim.households[b.id] ?? []).some((v) => v > 0));
  const near = paint.some((c) => homes.some((h) => Math.max(Math.abs(h.cell.x - c.x), Math.abs(h.cell.y - c.y)) <= REZONE_NEAR));
  return { needed: near };
}

/** 用途の例外（15.2）: 住宅区画の中か、住宅の建物に接する敷地。公聴会を省けない */
export function exceptionOf(app: Pick<Application, 'kind' | 'target'>, city: City): boolean {
  const cells = siteCells(app, city);
  if (app.kind === 'rezone' && app.target.zone?.from === 'residential') return true;
  const occ = occupancyOf(city);
  const zoneKind = new Map(city.zones.map((z) => [z.id, z.kind]));
  const homes = new Set(city.buildings.filter((b) => zoneKind.get(b.zoneId) === 'residential').map((b) => cellKey(b.cell.x, b.cell.y)));
  for (const c of cells) {
    if (occ.zones.get(cellKey(c.x, c.y))?.kind === 'residential') return true;
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) if (homes.has(cellKey(c.x + dx, c.y + dy))) return true;
  }
  return false;
}

/** 申請を出す。費用を取り分け（開発資金から引き）、敷地に囲いと看板が立つ（用途地域の審査から始める。アップグレードは反対の受付から） */
export function file(world: World, draft: Pick<Application, 'kind' | 'target'>, cost: number, day: number, terrain?: Terrain, rules: PoliticsRules = NO_RULES): World {
  const id = nextId('a', world.applications.map((a) => a.id));
  const stage: ApplicationStage = draft.kind === 'upgrade' ? 'objection' : 'zoning';
  let app: Application = {
    id, kind: draft.kind, target: draft.target, stage, stageDay: day, filedDay: day, wallet: 'funds', reserved: cost,
    exception: false, objections: [], opposition: 0, mods: {},
  };
  const reserved: World = { ...world, city: { ...world.city, funds: world.city.funds - cost } };
  // アップグレードは、出した日から反対の受付（費用を取り分けた後の都市で、反対を計算する）
  if (stage === 'objection' && terrain) app = { ...app, objections: oppositionOf(reserved, terrain, app, rules).objections.map((o) => ({ ...o, share: 0 })) };
  return { ...reserved, applications: [...world.applications, app] };
}

/** 取り下げる（着工の前ならいつでも）。費用は全て戻る */
export function withdraw(world: World, id: string, day: number): World {
  const app = world.applications.find((a) => a.id === id);
  if (!app || !isReviewing(app)) return world;
  return {
    ...world,
    city: { ...world.city, funds: world.city.funds + (app.wallet === 'funds' ? app.reserved : 0) },
    applications: world.applications.map((a) => (a.id === id ? { ...a, stage: 'withdrawn' as const, stageDay: day } : a)),
  };
}

/** 着工する: 施設を工事中で足す（アップグレードは施設をそのまま。用途地域の変更は区画を塗って終わる） */
function startConstruction(city: City, app: Application, day: number): { city: City; app: Application } {
  const days = buildDaysOf(app);
  if (app.kind === 'rezone' && app.target.zone) {
    const painted = new Set(app.target.zone.cells.map((c) => cellKey(c.x, c.y)));
    const zones: Zone[] = [];
    for (const z of city.zones) {
      const cells = z.cells.filter((c) => !painted.has(cellKey(c.x, c.y)));
      if (cells.length > 0) zones.push(cells.length === z.cells.length ? z : { ...z, cells });
    }
    zones.push({
      id: nextId('z', city.zones.map((z) => z.id)), kind: app.target.zone.kind, cells: app.target.zone.cells.map((c) => ({ ...c })),
      ...(Object.keys(app.mods).length > 0 ? { mods: { ...app.mods } } : {}),
    });
    const buildings = city.buildings.filter((b) => !painted.has(cellKey(b.cell.x, b.cell.y)));
    return { city: { ...city, zones, buildings }, app: { ...app, stage: 'done', stageDay: day } };
  }
  if (app.kind === 'upgrade') return { city, app: { ...app, stage: 'construction', stageDay: day } };
  const type = app.target.type as FacilityType;
  const def = FACILITY_DEFS[type];
  const facility: Facility = {
    id: nextId('f', city.facilities.map((f) => f.id)),
    type,
    ...(def.domain ? { domain: def.domain } : {}),
    origin: { ...(app.target.origin as Point) },
    rotation: app.target.rotation ?? 0,
    level: 1,
    state: 'constructing',
    builtDay: day,
    completeDay: day + days,
    ...(Object.keys(app.mods).length > 0 ? { mods: { ...app.mods } } : {}),
  };
  return {
    city: { ...city, facilities: [...city.facilities, facility] },
    app: { ...app, stage: 'construction', stageDay: day, target: { ...app.target, facilityId: facility.id } },
  };
}

/**
 * 1 日分の審議を進める（毎日の計算。13.1）。day はその日。
 * - 用途地域の審査（7 日）→ 用途の例外を決め、反対の受付へ
 * - 反対の受付（14 日）→ 反対率が 20% 未満で例外でなければ同意の案件（公聴会を省く）、それ以外は公聴会
 * - 公聴会（14 日。開かずに過ぎると市長抜きで開かれ、答えなかったことになる）→ 議会の採決
 * - 議会の採決（次の議会の日）→ 可決すれば着工。G3 では反対率を 0 として全て可決する（採決と申し立ては G6）
 * - 工事（大きさで決まる日数）→ 完成
 */
export function stepApplications(world: World, day: number, terrain?: Terrain, rules: PoliticsRules = NO_RULES): World {
  let city = world.city;
  let changed = false;
  // 反対は、反対の受付に入った日の都市で計算する（16 章。その日の前の段階が全て進んだ後の都市ではなく、前の日の終わりの都市）
  const assess = (a: Application): Application => {
    if (!terrain) return a;
    const r = oppositionOf({ ...world, city }, terrain, a, rules);
    return { ...a, objections: r.objections.map((o) => ({ ...o, share: 0 })), opposition: 0 };
  };
  const apps = world.applications.map((a0) => {
    let a = a0;
    // 同じ日に段階を続けて進められるように回す（日数 0 の段階・用途地域の変更の着工）
    for (let guard = 0; guard < 4; guard += 1) {
      const elapsed = day - a.stageDay;
      let next: Application | null = null;
      switch (a.stage) {
        case 'filed':
          next = { ...a, stage: 'zoning', stageDay: day };
          break;
        case 'zoning':
          if (elapsed >= STAGE_DAYS.zoning) next = assess({ ...a, stage: 'objection', stageDay: day, exception: exceptionOf(a, city) });
          break;
        case 'objection': {
          // 反対率は 0 から計算の値まで、日ごとに直線で上がる（15.2）
          const rising = risingShare(a, elapsed / STAGE_DAYS.objection);
          if (elapsed >= STAGE_DAYS.objection) {
            const consent = rising.opposition < CONSENT_LIMIT && !a.exception;
            next = { ...a, ...rising, stage: consent ? 'council' : 'hearing', stageDay: day };
          } else if (rising.opposition !== a.opposition) {
            a = { ...a, ...rising };
            changed = true;
          }
          break;
        }
        case 'hearing':
          // 公聴会の手は G5 で作る。それまでは、反対率が 20% 以上の申請は公聴会の段で待ち、取り下げだけができる（docs/development-plan.md G4）
          if (onHold(a)) break;
          if (elapsed >= STAGE_DAYS.hearing) next = { ...a, stage: 'council', stageDay: day, hearing: a.hearing ?? { heldDay: day, attended: false } };
          break;
        case 'council':
          if (day >= nextCouncilDay(a.stageDay)) {
            const voted: Application = { ...a, vote: { day, consent: a.opposition < CONSENT_LIMIT && !a.exception, members: [], passed: true } };
            const started = startConstruction(city, voted, day);
            city = started.city;
            next = started.app;
          }
          break;
        case 'construction':
          if (elapsed >= buildDaysOf(a)) {
            if (a.kind === 'upgrade') {
              const lv = a.target.toLevel ?? 2;
              // 譲歩の性質は、施設が前から持つ性質に重ねて写す（17.1）
              const mods = Object.keys(a.mods).length > 0 ? a.mods : null;
              city = { ...city, facilities: city.facilities.map((f) => (f.id === a.target.facilityId ? { ...f, level: lv, ...(mods ? { mods: mergeMods(f.mods, mods) } : {}) } : f)) };
            } else {
              city = { ...city, facilities: city.facilities.map((f) => (f.id === a.target.facilityId ? { ...f, state: 'active' as const } : f)) };
            }
            next = { ...a, stage: 'done', stageDay: day };
          }
          break;
        default:
          break;
      }
      if (!next) break;
      a = next;
      changed = true;
    }
    return a;
  });
  // 終わった申請は 1 任期分だけ残す
  const kept = apps.filter((a) => isOpen(a) || day - a.stageDay <= KEEP_FINISHED_DAYS);
  if (!changed && kept.length === apps.length) return world;
  return { ...world, city, applications: kept };
}

/** 段階の残りの日数（議会は次の議会の日まで。公聴会は最大の日数まで） */
export function daysLeft(app: Application, day: number): number {
  const elapsed = day - app.stageDay;
  switch (app.stage) {
    case 'filed':
      return 0;
    case 'zoning':
      return Math.max(0, STAGE_DAYS.zoning - elapsed);
    case 'objection':
      return Math.max(0, STAGE_DAYS.objection - elapsed);
    case 'hearing':
      return Math.max(0, STAGE_DAYS.hearing - elapsed);
    case 'council':
      return Math.max(0, nextCouncilDay(app.stageDay) - day);
    case 'appeal':
      return Math.max(0, STAGE_DAYS.appeal - elapsed);
    case 'construction':
      return Math.max(0, buildDaysOf(app) - elapsed);
    default:
      return 0;
  }
}

/** 市長の手が要る申請か（公聴会・異議申し立て。許認可の一覧で先に並べ、上の帯の数の印に数える） */
export const needsMayor = (a: Pick<Application, 'stage'>): boolean => a.stage === 'hearing' || a.stage === 'appeal';

/**
 * 公聴会の段で待っている申請（反対率が 20% 以上。公聴会の手を作るまでは、ここで待ち、取り下げだけができる。docs/development-plan.md G4）
 */
export const onHold = (a: Pick<Application, 'stage' | 'opposition'>): boolean => a.stage === 'hearing' && a.opposition >= CONSENT_LIMIT;

/**
 * 待っている事の 1 行。段階の名前の後に添える（docs/ui-design.md 10.1:「公聴会を開ける」「議会の日まで 3 日」）。
 * 例「反対の受付 あと 6 日」「公聴会 開ける。あと 9 日で市長抜きで開かれる」
 */
export function waitingText(app: Application, day: number): string {
  const left = daysLeft(app, day);
  switch (app.stage) {
    case 'hearing':
      if (onHold(app)) return '公聴会を待っている。取り下げはできる';
      return `開ける。あと ${String(left)} 日で市長抜きで開かれる`;
    case 'council':
      return `議会の日まで ${String(left)} 日`;
    case 'construction':
      return `完成まで ${String(left)} 日`;
    case 'done':
    case 'rejected':
    case 'withdrawn':
      return '';
    default:
      return `あと ${String(left)} 日`;
  }
}

/** 完成までの見込みの日数（今の段階の残り + その後の段階。反対の受付の後は、例外でなければ同意の案件として数える） */
export function daysToComplete(app: Application, day: number): number {
  if (!isOpen(app)) return 0;
  let d = day + daysLeft(app, day);
  let s: ApplicationStage = app.stage;
  const after = (x: ApplicationStage): ApplicationStage => {
    switch (x) {
      case 'filed': return 'zoning';
      case 'zoning': return 'objection';
      case 'objection': return app.exception ? 'hearing' : 'council';
      case 'hearing': return 'council';
      case 'council':
      case 'appeal': return 'construction';
      default: return 'done';
    }
  };
  for (let guard = 0; guard < 8; guard += 1) {
    s = after(s);
    if (s === 'done') break;
    if (s === 'objection') d += STAGE_DAYS.objection;
    else if (s === 'hearing') d += STAGE_DAYS.hearing;
    else if (s === 'council') d = nextCouncilDay(d);
    else if (s === 'construction') d += buildDaysOf(app);
  }
  return d - day;
}
