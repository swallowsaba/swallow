import { z } from 'zod';
import data from '../../content/facilities.json';
import type { DomainId, FacilityType } from './types';

/**
 * 施設の定義（docs/city-design.md 4 章）。中身は content/facilities.json のデータ（docs/content-spec.md 1 章）。
 * 対応する分野は学習の入口を示すだけで、学習を制限しない（docs/decisions.md D-02）。
 */
export interface FacilityDef {
  type: FacilityType;
  name: string;
  domain?: DomainId;
  /** facility = 分野の施設 / park = 公園の類（建設メニューの「公園」）/ reward = ミッションの報酬（建設メニューに出さない） */
  group: 'facility' | 'park' | 'reward';
  /** 建設メニューの棚（分野の施設だけ。1 つの棚に 5 つまで並べる） */
  shelf?: FacilityShelf;
  /** 回す前の敷地の大きさ（マス） */
  w: number;
  d: number;
  /** 建てる費用（開発資金） */
  cost: number;
  /** 建てられるようになる発展段階（docs/game-design.md 6 章の「公園の種類」） */
  minStage: 1 | 2 | 3 | 4 | 5;
  /** Lv が上がると加わる見た目（docs/city-design.md 4 章。[0] が Lv1 の姿） */
  looks?: string[];
}

export type FacilityShelf = 'base' | 'dev' | 'ops';
export const SHELF_NAMES: Record<FacilityShelf, string> = { base: '学びと基盤', dev: 'Web と開発', ops: 'クラウドと運用' };

export const FACILITY_TYPES = [
  'academy', 'server', 'network', 'web', 'security', 'devoffice', 'deploy', 'container',
  'cluster', 'datacenter', 'cloud', 'monitor', 'devops', 'incident', 'research',
  'park', 'treerow', 'plaza', 'fountain', 'monument',
] as const satisfies readonly FacilityType[];

const DOMAINS = [
  'found', 'linux', 'net', 'web', 'sec', 'git', 'cicd', 'ctr', 'docker', 'k8s', 'db', 'cloud', 'mon', 'devops', 'trouble', 'lab',
] as const satisfies readonly DomainId[];

const schema = z.object({
  facilities: z.array(z.object({
    type: z.enum(FACILITY_TYPES),
    name: z.string().min(1),
    domain: z.enum(DOMAINS).optional(),
    group: z.enum(['facility', 'park', 'reward']),
    shelf: z.enum(['base', 'dev', 'ops']).optional(),
    w: z.number().int().min(1).max(3),
    d: z.number().int().min(1).max(3),
    cost: z.number().int().min(0),
    minStage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    looks: z.array(z.string().min(1)).min(2).optional(),
  })),
});

/** データを検証して、種類ごとの表にする。足りない種類や重複があれば誤り */
export function parseFacilities(raw: unknown): Record<FacilityType, FacilityDef> {
  const list = schema.parse(raw).facilities;
  const out = {} as Record<FacilityType, FacilityDef>;
  for (const f of list) {
    if (out[f.type]) throw new Error(`施設の定義が重複: ${f.type}`);
    out[f.type] = f;
  }
  for (const t of FACILITY_TYPES) if (!out[t]) throw new Error(`施設の定義が無い: ${t}`);
  for (const f of list) if ((f.group === 'facility') !== (f.shelf !== undefined)) throw new Error(`施設の棚は分野の施設だけに付ける: ${f.type}`);
  for (const f of list) if ((f.group === 'facility') !== (f.looks !== undefined)) throw new Error(`Lv ごとの見た目は分野の施設だけに付ける: ${f.type}`);
  return out;
}

export const FACILITY_DEFS: Record<FacilityType, FacilityDef> = parseFacilities(data);

/** 建設メニューに並べる順（データの順） */
export const FACILITY_ORDER: FacilityType[] = data.facilities.map((f) => f.type as FacilityType);

/** 回した後の敷地の大きさ */
export function footprintOf(type: FacilityType, rotation: 0 | 90 | 180 | 270): { w: number; d: number } {
  const def = FACILITY_DEFS[type];
  return rotation % 180 === 0 ? { w: def.w, d: def.d } : { w: def.d, d: def.w };
}

/**
 * 大型施設（docs/game-design.md 5 章・docs/decisions.md D-12）: 敷地が 3×3 の分野の施設。
 * Lv3 以上に上げるには、発展段階の条件がある（地方都市で Lv3・中核都市で Lv4・技術都市で Lv5）
 */
export function isLargeFacility(type: FacilityType): boolean {
  const def = FACILITY_DEFS[type];
  return def.group === 'facility' && def.w === 3 && def.d === 3;
}

/**
 * 記念碑（ミッションの報酬。docs/game-design.md 8 章・docs/city-design.md 4 章）。
 * どの記念碑かの定義は content/facilities.json の landmarks、見た目は src/city/assets/props/monument-<ID>.svg
 */
export interface LandmarkDef {
  id: string;
  name: string;
  /** 何の記念か（1 文） */
  about: string;
}

const landmarkSchema = z.object({
  landmarks: z.array(z.object({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), name: z.string().min(1), about: z.string().min(1) }).strict()),
});

export function parseLandmarks(raw: unknown): LandmarkDef[] {
  const list = landmarkSchema.parse(raw).landmarks;
  if (new Set(list.map((l) => l.id)).size !== list.length) throw new Error('記念碑の ID が重なる');
  return list;
}

export const LANDMARKS: readonly LandmarkDef[] = parseLandmarks(data);

export function landmarkOf(id: string): LandmarkDef | undefined {
  return LANDMARKS.find((l) => l.id === id);
}
