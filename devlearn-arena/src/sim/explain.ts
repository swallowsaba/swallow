import { FACILITY_DEFS } from '@/city/facilities';
import { ROAD_RULES, ZONE_RULES } from '@/city/rules';
import type { City, Point } from '@/city/types';
import { FACTORS, layerName, LAYERS, type FactorId } from './layers';
import { districtOf, DISTRICT_COUNT } from './space';
import type { Cause, CauseKind, WeeklyBreakdown } from './types';

/**
 * 平易な言葉の説明（docs/game-design.md 14 章・docs/ui-design.md 11.3）。
 * 直近 4 週の支持率の変化を、13.8 の内訳（要因 × 原因・層）に分け、変化の向きに効いた一番大きい原因を 1 行目に、
 * 一番動いた層を 2 行目に、型の文（content/politics/explain.json。docs/content-spec.md 7.6）に入れる。数字は四捨五入した整数。
 * 純粋な関数。型の文は引数で受け取る（模擬の層は内容の置き場所を知らない）。
 */

export interface ExplainText {
  approval: { up: string; down: string; flat: string };
  layer: string;
  causes: Record<CauseKind, string>;
  factors: Record<FactorId, string>;
}

/** 説明の主な理由（押すと、その場所へカメラが寄り、その要因のヒートマップに切り替わる） */
export interface ExplainReason {
  factor: FactorId;
  kind: CauseKind;
  id: string;
  at?: Point;
  /** 4 週の間に、この原因が支持率を動かした点（向きは変化と同じ） */
  points: number;
}

export interface Explanation {
  lines: string[];
  /** 支持率の変化（四捨五入する前） */
  delta: number;
  weeks: number;
  reason: ExplainReason | null;
  /** 2 行目の層（無ければ null） */
  layer: { layer: number; delta: number } | null;
}

export interface ExplainContext {
  city: Pick<City, 'zones' | 'buildings' | 'facilities' | 'roads'>;
  districtNames: readonly string[];
  taxRate: number;
}

/** 説明に使う、何週前と比べるか */
export const EXPLAIN_WEEKS = 4;

const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);

/** 区画の建物の原因は、その区画にまとめる（「工業区画の建物 5 棟」でなく「工業区画」と言うため） */
function grouped(c: Cause, zoneOfBuilding: Map<string, string>): { kind: CauseKind; id: string } {
  if (c.source.kind === 'building') {
    const zone = zoneOfBuilding.get(c.source.id);
    if (zone) return { kind: 'zone', id: zone };
  }
  return { kind: c.source.kind, id: c.source.id };
}

/** 原因の名前（地区の名前は別に足す） */
function causeName(kind: CauseKind, id: string, ctx: ExplainContext): string {
  switch (kind) {
    case 'facility': {
      const f = ctx.city.facilities.find((x) => x.id === id);
      return f ? FACILITY_DEFS[f.type].name : '施設';
    }
    case 'zone': {
      const z = ctx.city.zones.find((x) => x.id === id);
      return z ? `${ZONE_RULES[z.kind].name}区画` : '区画';
    }
    case 'building':
      return '建物';
    case 'road': {
      const r = ctx.city.roads.find((x) => x.id === id);
      return r ? (r.kind === 'bridge' ? '橋' : ROAD_RULES[r.kind].name) : '道路';
    }
    case 'decision':
      return id === 'tax' ? `税率 ${String(ctx.taxRate)}%` : '市政への信頼';
    case 'demand':
      return DEMAND_NAMES[id] ?? id;
  }
}

const DEMAND_NAMES: Record<string, string> = {
  jobs: '働き口の数',
  commute: '通勤の道のり',
  rent: '住まいの需給',
  'jobs-near': '仕事への近さ',
};

/** 原因の言い表し（「北浜町の工業区画」） */
export function causeText(kind: CauseKind, id: string, at: Point | undefined, ctx: ExplainContext, t: ExplainText): string {
  const name = causeName(kind, id, ctx);
  const d = at ? districtOf(Math.floor(at.x), Math.floor(at.y)) : -1;
  const district = d >= 0 && d < DISTRICT_COUNT ? ctx.districtNames[d] : undefined;
  const template = district ? t.causes[kind] : t.causes[kind].replace('{district}の', '').replace('{district}', '');
  return fill(template, { name, district: district ?? '' });
}

/** 比べる 2 つの週（直近と、その 4 週前。記録が 4 週に足りなければ、いちばん古い週） */
function pair(breakdown: readonly WeeklyBreakdown[]): [WeeklyBreakdown, WeeklyBreakdown] | null {
  const last = breakdown.at(-1);
  if (!last || breakdown.length < 2) return null;
  const prev = breakdown.find((b) => b.week === last.week - EXPLAIN_WEEKS) ?? breakdown[0];
  return !prev || prev === last ? null : [last, prev];
}

/** 説明を組み立てる。記録が 2 週に足りなければ null */
export function explainApproval(breakdown: readonly WeeklyBreakdown[], ctx: ExplainContext, t: ExplainText): Explanation | null {
  const p = pair(breakdown);
  if (!p) return null;
  const [last, prev] = p;
  const weeks = last.week - prev.week;
  const delta = last.approval - prev.approval;
  const shown = Math.round(Math.abs(delta));
  if (shown < 1) {
    return { lines: [fill(t.approval.flat, { weeks: String(weeks) })], delta, weeks, reason: null, layer: null };
  }
  const dir = Math.sign(delta);

  // 原因ごとの変化（区画の建物は区画にまとめる）。その週の上位 20 に無い原因は 0 と数える
  const zoneOfBuilding = new Map(ctx.city.buildings.map((b) => [b.id, b.zoneId]));
  const change = new Map<string, ExplainReason>();
  const add = (c: Cause, sign: number): void => {
    const g = grouped(c, zoneOfBuilding);
    const key = `${c.factor}|${g.kind}|${g.id}`;
    const cur = change.get(key);
    if (cur) {
      cur.points += sign * c.points;
      // 場所は、直近の週で点の大きい所
      if (sign > 0 && !cur.at && c.source.at) cur.at = c.source.at;
    } else {
      change.set(key, { factor: c.factor, kind: g.kind, id: g.id, ...(c.source.at ? { at: c.source.at } : {}), points: sign * c.points });
    }
  };
  for (const c of last.causes) add(c, 1);
  for (const c of prev.causes) add(c, -1);
  let reason: ExplainReason | null = null;
  for (const r of [...change.values()].sort((a, b) => (a.factor + a.kind + a.id < b.factor + b.kind + b.id ? -1 : 1))) {
    if (r.points * dir <= 0) continue;
    if (!reason || r.points * dir > reason.points * dir) reason = r;
  }
  // 原因に分けられない時（上位 20 から外れた原因の変化だけの時）は、一番動いた要因と、その週のその要因の一番大きい原因
  if (!reason) {
    const byFactor = FACTORS.map((f, i) => ({ f, v: ((last.factors[i] ?? []).reduce((s, x) => s + x, 0) - (prev.factors[i] ?? []).reduce((s, x) => s + x, 0)) * dir }));
    const top = byFactor.sort((a, b) => b.v - a.v)[0];
    const c = top ? last.causes.find((x) => x.factor === top.f) : undefined;
    if (top && c) {
      const g = grouped(c, zoneOfBuilding);
      reason = { factor: top.f, kind: g.kind, id: g.id, ...(c.source.at ? { at: c.source.at } : {}), points: top.v * dir };
    }
  }
  const template = dir > 0 ? t.approval.up : t.approval.down;
  const first = fill(template, {
    weeks: String(weeks),
    delta: String(shown),
    cause: reason ? causeText(reason.kind, reason.id, reason.at, ctx, t) : '',
    factor: reason ? t.factors[reason.factor] : '',
  });
  const lines = [first];

  // 2 行目: 一番動いた層（変化と同じ向きに）
  let layer: Explanation['layer'] = null;
  if (last.layers && prev.layers) {
    for (const l of LAYERS) {
      const a = last.layers[l] as number;
      const b = prev.layers[l] as number;
      if (a < 0 || b < 0) continue;
      const d = a - b;
      if (d * dir <= 0) continue;
      if (!layer || d * dir > layer.delta * dir) layer = { layer: l, delta: d };
    }
    if (layer && Math.round(Math.abs(layer.delta)) >= 1) {
      lines.push(fill(t.layer, { layer: layerName(layer.layer), delta: String(Math.round(Math.abs(layer.delta))), dir: dir > 0 ? '上がった' : '下がった' }));
    } else {
      layer = null;
    }
  }
  return { lines, delta, weeks, reason, layer };
}
