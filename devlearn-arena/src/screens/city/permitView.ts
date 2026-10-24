import { FACILITY_DEFS, footprintOf } from '@/city/facilities';
import type { SiteView } from '@/city/render/CityRenderer';
import { FACILITY_JOBS_PER_LEVEL, ZONE_RULES } from '@/city/rules';
import type { Point } from '@/city/types';
import {
  applicationName, daysLeft, daysToComplete, isOpen, isReviewing, needsMayor, nextCouncilDay, PROGRESS_STAGES, siteCells, STAGE_DAYS, STAGE_LABEL, waitingText,
} from '@/sim/permits';
import { dateOf } from '@/sim/rules';
import { districtOf } from '@/sim/space';
import type { Application, ApplicationStage, World } from '@/sim/types';

/**
 * 許認可の一覧・申請の詳細・都市の上の看板に出す中身（docs/ui-design.md 10.1・10.2、docs/city-design.md 9.1）。
 * 規則は src/sim/permits.ts にあり、ここは文に直すだけ。
 */

/** 「2 年目 14 週」 */
export function dateText(day: number): string {
  const d = dateOf(day);
  return `${String(d.year)} 年目 ${String(d.week)} 週`;
}

/** 敷地の中心（カメラを寄せる所）と大きさ */
export function siteFocus(app: Application, world: Pick<World, 'city'>): { at: Point; size: Point } | null {
  const cells = siteCells(app, world.city);
  if (cells.length === 0) return null;
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const x1 = Math.max(...xs) + 1;
  const y1 = Math.max(...ys) + 1;
  return { at: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, size: { x: x1 - x0, y: y1 - y0 } };
}

/** 場所（地区の名前） */
export function placeOf(app: Application, world: Pick<World, 'city' | 'sim'>): string {
  const f = siteFocus(app, world);
  if (!f) return '';
  return world.sim.districtNames[districtOf(Math.floor(f.at.x), Math.floor(f.at.y))] ?? '';
}

/** 看板の 2 行目（段階・反対率・残りの日数。docs/ui-design.md 3 章） */
export function signLine(app: Application, day: number): string {
  const left = daysLeft(app, day);
  switch (app.stage) {
    case 'filed':
    case 'zoning':
      return `審議中・用途地域の審査 あと ${String(left)} 日`;
    case 'objection':
    case 'hearing':
      return `${STAGE_LABEL[app.stage]} あと ${String(left)} 日・反対 ${String(Math.round(app.opposition))}%`;
    case 'council':
      return `議会の採決 ${dateText(nextCouncilDay(app.stageDay))}`;
    case 'appeal':
      return `異議申し立て あと ${String(left)} 日`;
    case 'construction':
      return `工事中 完成まで ${String(left)} 日`;
    default:
      return STAGE_LABEL[app.stage];
  }
}

/** 都市の上の看板と囲い（審議中と工事中の申請） */
export function sitesOf(world: World): SiteView[] {
  const day = Math.floor(world.city.day);
  const out: SiteView[] = [];
  for (const a of world.applications) {
    if (!isOpen(a)) continue;
    const cells = siteCells(a, world.city);
    if (cells.length === 0) continue;
    const base = { id: a.id, cells, title: applicationName(a, world.city), line: signLine(a, day), building: a.stage === 'construction' };
    if (a.kind === 'facility' && a.target.type && a.target.origin) {
      const def = FACILITY_DEFS[a.target.type];
      out.push({ ...base, kind: 'facility', origin: a.target.origin, w: def.w, d: def.d, rotation: a.target.rotation ?? 0 });
    } else if (a.kind === 'upgrade') {
      const f = world.city.facilities.find((x) => x.id === a.target.facilityId);
      if (!f) continue;
      const s = footprintOf(f.type, f.rotation);
      out.push({ ...base, kind: 'upgrade', origin: f.origin, w: s.w, d: s.d, rotation: f.rotation });
    } else {
      const f = siteFocus(a, world);
      if (!f) continue;
      out.push({ ...base, kind: 'rezone', origin: { x: f.at.x - f.size.x / 2, y: f.at.y - f.size.y / 2 }, w: f.size.x, d: f.size.y, rotation: 0 });
    }
  }
  return out;
}

/** 8 段の進みの印の 1 つ（済んだ・今・これから・省いた） */
export interface StageMark {
  stage: ApplicationStage;
  label: string;
  state: 'done' | 'now' | 'todo' | 'skipped';
  /** 入った日（済んだ段と今の段） */
  day?: number;
}

/** 段階の進み（8 段）。日付は分かっている所だけ。公聴会と異議申し立ては、通らずに進んだら「省いた」 */
export function stageMarks(app: Application): StageMark[] {
  const at = PROGRESS_STAGES.indexOf(app.stage);
  const finished = app.stage === 'done';
  // 分かっている日: 申請の日・用途地域の審査は申請の日・反対の受付は 7 日後（アップグレードは申請の日）・公聴会・議会・着工
  const known: Partial<Record<ApplicationStage, number>> = { filed: app.filedDay };
  if (app.kind !== 'upgrade') known.zoning = app.filedDay;
  known.objection = app.kind === 'upgrade' ? app.filedDay : app.filedDay + STAGE_DAYS.zoning;
  if (app.hearing) known.hearing = app.hearing.heldDay;
  if (app.vote) {
    known.council = app.vote.day;
    known.construction = app.vote.day;
  }
  known[app.stage] = app.stageDay;
  return PROGRESS_STAGES.map((stage, i): StageMark => {
    const label = STAGE_LABEL[stage];
    const passed = finished || (at >= 0 && i < at);
    const skipped = passed && ((stage === 'zoning' && app.kind === 'upgrade') || (stage === 'hearing' && !app.hearing && app.vote !== undefined) || (stage === 'appeal' && !app.appeal));
    const state = skipped ? 'skipped' : passed ? 'done' : i === at ? 'now' : 'todo';
    const d = known[stage];
    return { stage, label, state, ...(d !== undefined && state !== 'todo' && state !== 'skipped' ? { day: d } : {}) };
  }).map((m) => (m.stage === 'done' && finished ? { ...m, state: 'now' as const, day: app.stageDay } : m));
}

/** 許認可の一覧の 1 行（docs/ui-design.md 10.1） */
export interface PermitRow {
  id: string;
  name: string;
  place: string;
  stage: ApplicationStage;
  stageLabel: string;
  marks: StageMark[];
  opposition: number;
  daysLeft: number;
  waiting: string;
  /** 市長の手が要る（公聴会・申し立て） */
  mayor: boolean;
}

function rowOf(a: Application, world: World, day: number): PermitRow {
  return {
    id: a.id,
    name: applicationName(a, world.city),
    place: placeOf(a, world),
    stage: a.stage,
    stageLabel: STAGE_LABEL[a.stage],
    marks: stageMarks(a),
    opposition: Math.round(a.opposition),
    daysLeft: daysLeft(a, day),
    waiting: waitingText(a, day),
    mayor: needsMayor(a),
  };
}

/** 一覧: 進んでいる申請（市長の手が要る物を先、次に残りの日数の短い順）と、終わった申請（新しい順） */
export function permitRows(world: World): { open: PermitRow[]; finished: PermitRow[] } {
  const day = Math.floor(world.city.day);
  const open = world.applications.filter(isOpen).map((a) => rowOf(a, world, day))
    .sort((a, b) => Number(b.mayor) - Number(a.mayor) || a.daysLeft - b.daysLeft || a.id.localeCompare(b.id, 'en', { numeric: true }));
  const finished = world.applications.filter((a) => !isOpen(a))
    .sort((a, b) => b.stageDay - a.stageDay || b.id.localeCompare(a.id, 'en', { numeric: true }))
    .map((a) => rowOf(a, world, day));
  return { open, finished };
}

/** 公聴会を待つ申請の数（上の帯の「市政」の数の印） */
export function mayorCount(world: Pick<World, 'applications'>): number {
  return world.applications.filter(needsMayor).length;
}

/** 申請 1 件の詳細（docs/ui-design.md 10.2） */
export interface PermitDetail extends PermitRow {
  filedDate: string;
  /** 完成までの見込みの日数（反対の受付の後は、例外でなければ同意の案件として数える） */
  toComplete: number;
  reserved: number;
  wallet: string;
  /** 用途の例外（公聴会を省けない） */
  exception: boolean;
  /** 通った時の得（議員が見る値のうち、今分かる物） */
  gains: { label: string; value: string }[];
  canWithdraw: boolean;
  /** 取り下げた時に戻る額 */
  refund: number;
}

export function permitDetail(world: World, id: string): PermitDetail | null {
  const a = world.applications.find((x) => x.id === id);
  if (!a) return null;
  const day = Math.floor(world.city.day);
  const gains: PermitDetail['gains'] = [];
  if (a.kind === 'facility' && a.target.type) {
    gains.push({ label: '雇用', value: `+${String(FACILITY_JOBS_PER_LEVEL)} 人分の仕事` }, { label: '技術力', value: '+1' });
  } else if (a.kind === 'upgrade') {
    gains.push({ label: '雇用', value: `+${String(FACILITY_JOBS_PER_LEVEL)} 人分の仕事` }, { label: '技術力', value: '+1' });
  } else if (a.target.zone) {
    gains.push({ label: '区画', value: `${ZONE_RULES[a.target.zone.kind].name} ${String(a.target.zone.cells.length)} マス` });
  }
  return {
    ...rowOf(a, world, day),
    filedDate: dateText(a.filedDay),
    toComplete: daysToComplete(a, day),
    reserved: a.reserved,
    wallet: a.wallet === 'funds' ? '開発資金' : '財政',
    exception: a.exception,
    gains,
    canWithdraw: isReviewing(a),
    refund: a.reserved,
  };
}
