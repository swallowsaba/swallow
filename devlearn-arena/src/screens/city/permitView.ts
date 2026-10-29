import type { Terrain } from '@/city/terrain';
import { FACILITY_DEFS, footprintOf } from '@/city/facilities';
import { crowdCount, crowdSpots, placardTone } from '@/city/crowd';
import type { SiteView } from '@/city/render/CityRenderer';
import { ZONE_RULES } from '@/city/rules';
import type { Point } from '@/city/types';
import {
  applicationName, daysLeft, daysToComplete, isConsent, isOpen, isReviewing, needsMayor, nextCouncilDay, PROGRESS_STAGES, siteCells, STAGE_DAYS, STAGE_LABEL, waitingText,
} from '@/sim/permits';
import { REASONS } from '@/content/politics';
import type { HeatKind } from '@/sim/heat';
import { layerName } from '@/sim/layers';
import { gainsOf } from '@/sim/council';
import { dateOf } from '@/sim/rules';
import { districtOf } from '@/sim/space';
import type { Application, ApplicationStage, ObjectionReason, ObjectionState, World } from '@/sim/types';
import { groupName } from '@/sim/news';

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
    // 反対する人の影（反対の受付・公聴会・異議申し立ての間。着工で消える）
    const protest = a.stage === 'objection' || a.stage === 'hearing' || a.stage === 'appeal';
    const crowd = (site: { origin: Point; w: number; d: number; rotation: 0 | 90 | 180 | 270 }): Pick<SiteView, 'crowd'> => {
      const n = protest ? crowdCount(a.opposition) : 0;
      return n > 0 ? { crowd: { spots: crowdSpots(site, n), tone: placardTone(a.opposition) } } : {};
    };
    if (a.kind === 'facility' && a.target.type && a.target.origin) {
      const def = FACILITY_DEFS[a.target.type];
      const site = { origin: a.target.origin, w: def.w, d: def.d, rotation: a.target.rotation ?? 0 };
      out.push({ ...base, kind: 'facility', ...site, ...crowd(site) });
    } else if (a.kind === 'upgrade') {
      const f = world.city.facilities.find((x) => x.id === a.target.facilityId);
      if (!f) continue;
      const s = footprintOf(f.type, f.rotation);
      const def = FACILITY_DEFS[f.type];
      out.push({ ...base, kind: 'upgrade', origin: f.origin, w: s.w, d: s.d, rotation: f.rotation, ...crowd({ origin: f.origin, w: def.w, d: def.d, rotation: f.rotation }) });
    } else {
      const f = siteFocus(a, world);
      if (!f) continue;
      const site = { origin: { x: f.at.x - f.size.x / 2, y: f.at.y - f.size.y / 2 }, w: f.size.x, d: f.size.y, rotation: 0 as const };
      out.push({ ...base, kind: 'rezone', ...site, ...crowd(site) });
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
  /** 反対率の内訳（理由ごと。割合の合計は反対率と一致する） */
  objections: ObjectionRow[];
  /** 通った時の得（議員が見る値。docs/game-design.md 18.1） */
  gains: { label: string; value: string }[];
  /** 議会の採決の画面（議会の段は見込み、採決した後は結果。同意の案件は出さない） */
  council: 'outlook' | 'result' | null;
  canWithdraw: boolean;
  /** 取り下げた時に戻る額 */
  refund: number;
}

/** terrain: 公共サービスと発電所の得（行き届きの見込み）を数えるために渡す */
export function permitDetail(world: World, id: string, terrain?: Terrain): PermitDetail | null {
  const a = world.applications.find((x) => x.id === id);
  if (!a) return null;
  const day = Math.floor(world.city.day);
  const gains: PermitDetail['gains'] = [];
  if (a.target.zone) gains.push({ label: '区画', value: `${ZONE_RULES[a.target.zone.kind].name} ${String(a.target.zone.cells.length)} マス` });
  // 議員が見る得（申請が完成した形を入れて数える）。審議中だけ（完成した後は都市に入っている）
  if (isReviewing(a)) {
    const g = gainsOf(world, a, terrain).raw;
    const n = (v: number): string => (Math.round(v * 10) / 10).toLocaleString('ja-JP');
    if (g.jobs > 0) gains.push({ label: '雇用', value: `+${n(g.jobs)} 人分の仕事` });
    if (g.afford > 0) gains.push({ label: '戸数', value: `+${n(g.afford)} 戸` });
    if (g.tech > 0) gains.push({ label: a.target.type === 'school' ? '教育' : '技術力', value: `+${n(g.tech)}` });
    if (g.finance > 0) gains.push({ label: '税収', value: `週に +${n(g.finance)}` });
    if (g.environment > 0) gains.push({ label: '緑地', value: `${n(g.environment)} マス` });
    if (g.safety > 0) gains.push({ label: '暮らしの備え', value: `+${n(g.safety)}（行き届き・電力）` });
  }
  return {
    ...rowOf(a, world, day),
    filedDate: dateText(a.filedDay),
    toComplete: daysToComplete(a, day),
    reserved: a.reserved,
    wallet: a.wallet === 'funds' ? '開発資金' : '財政',
    exception: a.exception,
    objections: objectionRows(a, world),
    gains,
    council: a.stage === 'council' && !isConsent(a) ? 'outlook' : a.vote && !a.vote.consent ? 'result' : null,
    canWithdraw: isReviewing(a),
    refund: a.reserved,
  };
}

/* ---------- 反対率の内訳（docs/ui-design.md 10.2 の 2・3） ---------- */

/** 反対率の内訳の 1 行 */
export interface ObjectionRow {
  reasonId: string;
  /** 理由の名前（論点） */
  title: string;
  /** 割合（%。整数。全ての行の合計が、詳細の反対率と一致する） */
  share: number;
  /** 反対する集団（「北浜地区の住民」「環境の会」） */
  group: string;
  /** 一番多い層（「若者・低い収入」） */
  layer: string;
  /** 強さの元になった模擬の値（「半径 3 の住まいで、夜の騒音が 2.3 増える見込み」） */
  basis: string;
  /** その値を見るヒートマップ（ある物だけ） */
  heat?: HeatKind;
}

/** 反対する集団の呼び名（近くの集団は地区の名前で呼ぶ。新聞の記事と同じ呼び名。docs/game-design.md 16.1） */
export { groupName };

/** 性質の名前（施設の性質の理由の元の値を言う時） */
const TRAIT_NAMES: Partial<Record<string, string>> = { coolingWater: '冷却水の量' };

const num = (v: number): string => v.toLocaleString('ja-JP', { maximumFractionDigits: 2 });

/** 強さの元になった模擬の値の 1 文（docs/ui-design.md 10.2 の 3） */
export function basisText(reason: Pick<ObjectionReason, 'measure' | 'radius'>, o: Pick<ObjectionState, 'basis'>, app: Pick<Application, 'wallet'>): string {
  const { value, ref } = o.basis;
  const r = String(reason.radius ?? ref ?? 0);
  const m = reason.measure;
  switch (m.kind) {
    case 'noise':
      return `半径 ${r} の住まいで、${m.night ? '夜の' : ''}騒音が ${num(value)} 増える見込み（30 増えると、懸念が一番強くなる）`;
    case 'power':
      return `使う電力 ${num(value)} MW に対し、今の電力の余りは ${num(ref ?? 0)} MW`;
    case 'jobs-density':
      return `敷地 1 マスあたりの仕事は ${num(value)} 人分。都市の平均は 1 マスあたり ${num(ref ?? 0)} 人分`;
    case 'sunlight':
      return `建物の高さは ${num(value)} 段。隣の一番低い住宅は ${num(ref ?? 0)} 段`;
    case 'traffic':
      return `通勤の流れが ${num(value)} 人分増える。面した道路の余りは ${num(ref ?? 0)} 人分`;
    case 'rent':
      return `半径 ${r} の住まいで、家賃が ${num(value)}% 上がる見込み（10% 上がると、懸念が一番強くなる）`;
    case 'trait':
      return `${TRAIT_NAMES[m.trait] ?? m.trait} ${num(value)}（施設の Lv に比べて増える）`;
    case 'service-load':
      return '公共サービスの定員の余りが減る';
    case 'cost':
      return `費用 ${num(value)} は、${app.wallet === 'funds' ? '開発資金' : '財政'}の残り ${num(ref ?? 0)} の ${num(ref ? Math.round((value / ref) * 1000) / 10 : 100)}%`;
  }
}

/** 理由の元の値を見るヒートマップ */
function heatOf(reason: Pick<ObjectionReason, 'measure'>): HeatKind | undefined {
  switch (reason.measure.kind) {
    case 'noise': return 'noise';
    case 'rent': return 'rent';
    case 'jobs-density': return 'jobs';
    default: return undefined;
  }
}

/**
 * 整数に丸めた内訳の合計を、丸めた合計に揃える（端数の大きい順に 1 ずつ足す。最大剰余）。
 * 同じ端数なら前の行を先にする
 */
export function roundParts(values: readonly number[]): number[] {
  const total = Math.round(values.reduce((a, v) => a + v, 0));
  const floors = values.map((v) => Math.floor(v));
  let rest = total - floors.reduce((a, v) => a + v, 0);
  const order = values.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floors];
  for (const { i } of order) {
    if (rest <= 0) break;
    out[i] = (out[i] as number) + 1;
    rest -= 1;
  }
  return out;
}

export function objectionRows(app: Application, world: Pick<World, 'sim'>): ObjectionRow[] {
  const shares = roundParts(app.objections.map((o) => o.share));
  return app.objections.flatMap((o, i): ObjectionRow[] => {
    const reason = REASONS.find((r) => r.id === o.reasonId);
    if (!reason) return [];
    const heat = heatOf(reason);
    return [{
      reasonId: o.reasonId,
      title: reason.title,
      share: shares[i] as number,
      group: groupName(o, world),
      layer: o.topLayer !== undefined ? layerName(o.topLayer) : '',
      basis: basisText(reason, o, app),
      ...(heat ? { heat } : {}),
    }];
  }).sort((a, b) => b.share - a.share);
}
