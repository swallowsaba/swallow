import { STAGE_NAMES, type Stage } from '@/game/stage';
import {
  aroundCells, cellKey, cellKindAt, entranceCells, facilityCells, frontOf, occupancyOf, roadCellsOf, type Occupancy,
} from './cells';
import { FACILITY_DEFS } from './facilities';
import { riverSpans, roadOfPlan, splitBridges, type RoadPlan } from './roads';
import { BRIDGE, isRevealed, ROAD_RULES, ZONE_RULES } from './rules';
import type { Terrain } from './terrain';
import type { City, Facility, FacilityType, Point, Road, Zone, ZoneKind } from './types';

/**
 * 配置の判定（docs/city-design.md 8 章）。置ける所は緑の枠、置けない所は赤の枠と理由。
 * 理由: 道路に面していない・重なる・霧の中・資金が足りない、と、地形と発展段階によるもの。
 * 全て純粋な関数。都市の状態は書き換えず、新しい状態を返す。
 */

export type ReasonCode =
  | 'fog' | 'sea' | 'hill' | 'overlap' | 'road-overlap' | 'no-road' | 'entrance' | 'funds' | 'stage'
  | 'bridge-stage' | 'bridge-long' | 'short';

export interface Reason {
  code: ReasonCode;
  text: string;
}

const TEXT: Record<Exclude<ReasonCode, 'stage'>, string> = {
  fog: '霧の中',
  sea: '海の上',
  hill: '丘の段差の上',
  overlap: '建物や区画と重なる',
  'road-overlap': '道路と重なる',
  'no-road': '道路に面していない',
  entrance: '入口が道路に面していない（R で回す）',
  funds: '資金が足りない',
  'bridge-stage': '橋は「町」になると架けられる',
  'bridge-long': '川に沿っていて橋を架けられない',
  short: '短すぎる（2 マス以上）',
};

function reason(code: Exclude<ReasonCode, 'stage'>): Reason {
  return { code, text: TEXT[code] };
}
function stageReason(stage: Stage): Reason {
  return { code: 'stage', text: `「${STAGE_NAMES[stage]}」になると作れる` };
}

export interface CellMark {
  x: number;
  y: number;
  ok: boolean;
}

export interface PlanCheck {
  ok: boolean;
  /** 費用（開発資金） */
  cost: number;
  /** 置けない理由（重複なし） */
  reasons: Reason[];
  /** 枠を描くマス */
  cells: CellMark[];
}

class Reasons {
  private readonly list: Reason[] = [];
  add(r: Reason): void {
    if (!this.list.some((x) => x.code === r.code)) this.list.push(r);
  }
  get items(): Reason[] {
    return this.list;
  }
}

/** マスに建物・区画・施設を置けるか（道路は別に判定する）。置けなければ理由 */
function groundProblem(city: City, terrain: Terrain, occ: Occupancy, x: number, y: number): Reason | null {
  if (!isRevealed(city.revealed, x, y)) return reason('fog');
  const kind = cellKindAt(terrain, x, y);
  if (kind === 'sea' || kind === 'river') return reason('sea');
  if (kind === 'hill') return reason('hill');
  const k = cellKey(x, y);
  if (occ.roads.has(k)) return reason('road-overlap');
  if (occ.facilities.has(k)) return reason('overlap');
  return null;
}

/* ---------- 道路 ---------- */

export interface RoadCheck extends PlanCheck {
  /** 置く道路（川を渡る所は橋に分けたもの。ID は空） */
  roads: Road[];
}

export function checkRoad(city: City, terrain: Terrain, plan: RoadPlan): RoadCheck {
  const reasons = new Reasons();
  const road = roadOfPlan(plan);
  const rule = ROAD_RULES[plan.kind];
  if (city.stage < rule.minStage) reasons.add(stageReason(rule.minStage));
  const occ = occupancyOf(city);
  const cells = roadCellsOf(road);
  const marks: CellMark[] = [];
  let cost = 0;
  if (plan.kind !== 'roundabout' && cells.length < 2) reasons.add(reason('short'));

  // 他の道路と長く重なる（交差より多く同じマスを使う）
  const crowded = new Set<string>();
  const extra = road.kind === 'avenue' ? 1 : 0;
  const shared = new Map<string, string[]>();
  for (const c of cells) {
    const k = cellKey(c.x, c.y);
    for (const id of occ.roadIds.get(k) ?? []) shared.set(id, [...(shared.get(id) ?? []), k]);
  }
  for (const [id, ks] of shared) {
    const other = city.roads.find((r) => r.id === id);
    const limit = 2 + extra + (other?.kind === 'avenue' || other?.kind === 'roundabout' ? 1 : 0);
    if (ks.length > limit || plan.kind === 'roundabout') for (const k of ks) crowded.add(k);
  }

  const spans = plan.kind === 'roundabout' ? [] : riverSpans(road.path, terrain);
  if (spans.some((s) => s.s1 - s.s0 > BRIDGE.maxCells)) reasons.add(reason('bridge-long'));

  for (const c of cells) {
    const k = cellKey(c.x, c.y);
    let problem: Reason | null = null;
    const kind = cellKindAt(terrain, c.x, c.y);
    if (!isRevealed(city.revealed, c.x, c.y)) problem = reason('fog');
    else if (kind === 'sea') problem = reason('sea');
    else if (kind === 'hill') problem = reason('hill');
    else if (kind === 'river' && plan.kind === 'roundabout') problem = reason('sea');
    else if (kind === 'river' && city.stage < BRIDGE.minStage) problem = reason('bridge-stage');
    else if (occ.facilities.has(k) || occ.zones.has(k)) problem = reason('overlap');
    else if (crowded.has(k)) problem = reason('road-overlap');
    if (problem) reasons.add(problem);
    marks.push({ x: c.x, y: c.y, ok: problem === null });
    if (!occ.roads.has(k)) cost += rule.costPerCell * (kind === 'river' ? BRIDGE.costFactor : 1);
  }
  if (cells.length > 0 && cells.every((c) => occ.roads.has(cellKey(c.x, c.y)))) reasons.add(reason('road-overlap'));
  if (cost > city.funds) reasons.add(reason('funds'));
  const roads = splitBridges(road, terrain);
  return { ok: reasons.items.length === 0, cost, reasons: reasons.items, cells: marks, roads };
}

/* ---------- 区画 ---------- */

export interface ZoneCheck extends PlanCheck {
  /** 塗れるマス */
  paint: Point[];
}

/** 2 つのマスを角とする長方形を、区画として塗れるか。同じ種類の区画のマスは飛ばす */
export function checkZone(city: City, terrain: Terrain, kind: ZoneKind, a: Point, b: Point): ZoneCheck {
  const reasons = new Reasons();
  const rule = ZONE_RULES[kind];
  if (city.stage < rule.minStage) reasons.add(stageReason(rule.minStage));
  const occ = occupancyOf(city);
  const marks: CellMark[] = [];
  const paint: Point[] = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y += 1) {
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x += 1) {
      if (occ.zones.get(cellKey(x, y))?.kind === kind) continue;
      let problem = groundProblem(city, terrain, occ, x, y);
      if (problem?.code === 'road-overlap') continue; // 道路のマスは塗らない（枠も出さない）
      if (!problem && frontOf({ x, y }, occ.roads) === null) problem = reason('no-road');
      if (problem) reasons.add(problem);
      marks.push({ x, y, ok: problem === null });
      if (!problem) paint.push({ x, y });
    }
  }
  const cost = paint.length * rule.costPerCell;
  if (cost > city.funds) reasons.add(reason('funds'));
  const blocking = reasons.items.filter((r) => r.code === 'stage' || r.code === 'funds');
  const ok = paint.length > 0 && blocking.length === 0;
  // 一部でも塗れるなら、塗れないマスの理由は赤の枠と一緒に出す（塗れるマスだけ塗る）
  return { ok, cost, reasons: reasons.items, cells: marks, paint };
}

/* ---------- 施設と公園 ---------- */

export function checkFacility(city: City, terrain: Terrain, type: FacilityType, origin: Point, rotation: Facility['rotation']): PlanCheck {
  const reasons = new Reasons();
  const def = FACILITY_DEFS[type];
  if (city.stage < def.minStage) reasons.add(stageReason(def.minStage));
  const occ = occupancyOf(city);
  const shape = { type, origin, rotation };
  const marks: CellMark[] = [];
  for (const c of facilityCells(shape)) {
    let problem = groundProblem(city, terrain, occ, c.x, c.y);
    if (!problem && occ.zones.has(cellKey(c.x, c.y))) problem = reason('overlap');
    if (problem) reasons.add(problem);
    marks.push({ x: c.x, y: c.y, ok: problem === null });
  }
  const needsEntrance = def.group === 'facility';
  const front = needsEntrance ? entranceCells(shape) : aroundCells(shape);
  if (!front.some((c) => occ.roads.has(cellKey(c.x, c.y)))) {
    reasons.add(needsEntrance && aroundCells(shape).some((c) => occ.roads.has(cellKey(c.x, c.y))) ? reason('entrance') : reason('no-road'));
  }
  if (def.cost > city.funds) reasons.add(reason('funds'));
  return { ok: reasons.items.length === 0, cost: def.cost, reasons: reasons.items, cells: marks };
}

/* ---------- 置く ---------- */

/** 次の ID（接頭辞 + 番号。今ある ID と重ならない） */
export function nextId(prefix: string, ids: Iterable<string>): string {
  let max = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1)}`;
}

/**
 * 判定に通った道路を置く。費用は開発資金から引く（docs/game-design.md 2 章）。
 */
export function placeRoad(city: City, check: RoadCheck): City {
  if (!check.ok) return city;
  const roads = [...city.roads];
  for (const r of check.roads) roads.push({ ...r, id: nextId('r', roads.map((x) => x.id)) });
  return { ...city, roads, funds: city.funds - check.cost };
}

/** 判定に通った区画を塗り、費用を開発資金から引く。別の種類の区画だったマスは塗り替え、その建物は取り壊す */
export function placeZone(city: City, kind: ZoneKind, check: ZoneCheck): City {
  if (!check.ok) return city;
  const painted = new Set(check.paint.map((c) => cellKey(c.x, c.y)));
  const zones: Zone[] = [];
  for (const z of city.zones) {
    const cells = z.cells.filter((c) => !painted.has(cellKey(c.x, c.y)));
    if (cells.length > 0) zones.push(cells.length === z.cells.length ? z : { ...z, cells });
  }
  const id = nextId('z', city.zones.map((z) => z.id));
  zones.push({ id, kind, cells: check.paint.map((c) => ({ ...c })) });
  const buildings = city.buildings.filter((b) => !painted.has(cellKey(b.cell.x, b.cell.y)));
  return { ...city, zones, buildings, funds: city.funds - check.cost };
}

/**
 * 判定に通った施設・公園を置き、費用を開発資金から引く。建設から始まる（基礎 → 骨組み → 完成）。
 * 記念碑は、どの記念碑か（landmark）を持つ
 */
export function placeFacility(city: City, type: FacilityType, origin: Point, rotation: Facility['rotation'], check: PlanCheck, landmark?: string): City {
  if (!check.ok) return city;
  const def = FACILITY_DEFS[type];
  const facility: Facility = {
    id: nextId('f', city.facilities.map((f) => f.id)),
    type,
    ...(def.domain ? { domain: def.domain } : {}),
    ...(type === 'monument' && landmark ? { landmark } : {}),
    origin: { ...origin },
    rotation,
    level: 1,
    state: 'constructing',
    builtDay: city.day,
  };
  return { ...city, facilities: [...city.facilities, facility], funds: city.funds - check.cost };
}

/* ---------- 取り壊し ---------- */

export type DemolishTarget =
  | { kind: 'facility'; id: string; name: string; cells: Point[] }
  | { kind: 'zone'; cell: Point; name: string; cells: Point[] }
  | { kind: 'road'; id: string; name: string; cells: Point[] };

const ROAD_NAMES: Record<Road['kind'], string> = { lane: '細い道', street: '一般道', avenue: '大通り', bridge: '橋', roundabout: 'ロータリー' };

/** 区画の建物の名前（docs/city-design.md 3 章の「建つもの」） */
export function buildingName(kind: ZoneKind, level: number): string {
  const names: Record<ZoneKind, string[]> = {
    residential: ['戸建て', '低層集合住宅', '中層住宅', '高層住宅', '超高層住宅'],
    commercial: ['小さな店', '商店街の店', '商業ビル', '大きな商業ビル', '超高層の商業ビル'],
    office: ['小さな事務所', 'オフィスビル', '中層オフィス', '高層オフィス', '超高層オフィス'],
  };
  return names[kind][Math.max(0, Math.min(4, level - 1))] as string;
}

/** マスにある、取り壊せる物（施設 → 区画 → 道路の順に探す） */
export function demolishTargetAt(city: City, cell: Point): DemolishTarget | null {
  const occ = occupancyOf(city);
  const k = cellKey(cell.x, cell.y);
  const f = occ.facilities.get(k);
  if (f) return { kind: 'facility', id: f.id, name: FACILITY_DEFS[f.type].name, cells: facilityCells(f) };
  const z = occ.zones.get(k);
  if (z) {
    const b = occ.buildings.get(k);
    const name = b ? buildingName(z.kind, b.level) : `${ZONE_RULES[z.kind].name}の区画`;
    return { kind: 'zone', cell: { ...cell }, name, cells: [{ ...cell }] };
  }
  const ids = occ.roadIds.get(k);
  const road = ids ? city.roads.find((r) => r.id === ids[0]) : undefined;
  if (road) return { kind: 'road', id: road.id, name: ROAD_NAMES[road.kind], cells: roadCellsOf(road) };
  return null;
}

/** 取り壊す。施設を壊しても学習の記録は消えない（都市の状態だけを変える） */
export function demolish(city: City, target: DemolishTarget): City {
  switch (target.kind) {
    case 'facility':
      return { ...city, facilities: city.facilities.filter((f) => f.id !== target.id) };
    case 'road': {
      // 道路に面さなくなった区画の建物は取り壊す（道路に面していないと機能しない。docs/city-design.md 2 章）
      const roads = city.roads.filter((r) => r.id !== target.id);
      const cells = occupancyOf({ ...city, roads }).roads;
      return { ...city, roads, buildings: city.buildings.filter((b) => frontOf(b.cell, cells) !== null) };
    }
    case 'zone': {
      const k = cellKey(target.cell.x, target.cell.y);
      const zones: Zone[] = [];
      for (const z of city.zones) {
        const cells = z.cells.filter((c) => cellKey(c.x, c.y) !== k);
        if (cells.length > 0) zones.push(cells.length === z.cells.length ? z : { ...z, cells });
      }
      return { ...city, zones, buildings: city.buildings.filter((b) => cellKey(b.cell.x, b.cell.y) !== k) };
    }
  }
}
