import { SKILL_STAGE_NAMES, skillStageOf } from '@/game/skill';
import { FACILITY_DEFS } from './facilities';
import { domainsOfFacility, DOMAINS, nextLevelOf } from './facilityInfo';
import type { City, DomainId, Point } from './types';
import { facilitySkillStage } from './upgrade';

/**
 * 学習から都市へ戻った時の変化（docs/game-design.md 7 章・docs/city-design.md 5 章）。純粋な計算。
 * 学習に出る前と戻った後の、都市とスキルの値を比べ、何が変わったかと、その場所を返す。
 * 画面はいちばん大事な変化の場所へカメラを寄せ、光の輪と 1 行の知らせで示す。
 *
 * 施設のアップグレードは資金で買う（docs/game-design.md 2・5 章）。学習の成果は「上げられるようになった」として現れる。
 */

export type SkillValues = Partial<Record<DomainId, number>>;

export interface Snapshot {
  city: City;
  /** 分野ごとのスキルの値（0〜100） */
  skills: SkillValues;
}

export type Change =
  | { kind: 'upgradable'; facilityId: string; at: Point; size: Point; level: number; text: string }
  | { kind: 'stage'; text: string }
  | { kind: 'built'; at: Point; count: number; text: string }
  | { kind: 'grown'; at: Point; count: number; text: string }
  | { kind: 'no-facility'; domain: DomainId; text: string };

/** 英字で終わる名前の後には空白を置く（「Linux / CLI の施設」「IT 基礎の施設」） */
const joined = (name: string): string => (/[A-Za-z0-9]$/.test(name) ? `${name} ` : name);

const stageOfValue = (v: number | undefined): number => skillStageOf(v ?? 0);

function centroid(points: readonly Point[]): Point {
  const n = Math.max(1, points.length);
  return { x: points.reduce((s, p) => s + p.x + 0.5, 0) / n, y: points.reduce((s, p) => s + p.y + 0.5, 0) / n };
}

/** 変化を、大事な順に並べる（施設を上げられる → 発展段階 → 新しい建物 → 育った建物 → 施設の無い分野） */
export function changesBetween(before: Snapshot, after: Snapshot): Change[] {
  const out: Change[] = [];
  const raised = DOMAINS.filter((d) => stageOfValue(after.skills[d.id]) > stageOfValue(before.skills[d.id]));

  for (const f of after.city.facilities) {
    const def = FACILITY_DEFS[f.type];
    if (def.group !== 'facility') continue;
    const next = nextLevelOf(f);
    if (!next) continue;
    const domains = domainsOfFacility(f.type);
    if (facilitySkillStage(f.type, before.skills) >= next.skillStage || facilitySkillStage(f.type, after.skills) < next.skillStage) continue;
    // 大型施設の Lv3〜Lv5 は発展段階も要る。届いていなければ「上げられる」とは言わない
    if (after.city.stage < next.cityStage) continue;
    const top = [...domains].sort((a, b) => stageOfValue(after.skills[b.id]) - stageOfValue(after.skills[a.id]))[0];
    out.push({
      kind: 'upgradable',
      facilityId: f.id,
      at: { x: f.origin.x + def.w / 2, y: f.origin.y + def.d / 2 },
      size: { x: def.w, y: def.d },
      level: next.level,
      text: `${def.name}を Lv${String(next.level)} に上げられるようになった（${top?.name ?? ''} ${SKILL_STAGE_NAMES[skillStageOf(after.skills[top?.id ?? 'found'] ?? 0)]}）`,
    });
  }

  if (after.city.stage > before.city.stage) out.push({ kind: 'stage', text: '都市が発展した。霧が晴れて、作れる物が増えた' });

  const old = new Map(before.city.buildings.map((b) => [b.id, b]));
  const fresh = after.city.buildings.filter((b) => !old.has(b.id));
  if (fresh.length > 0) out.push({ kind: 'built', at: centroid(fresh.map((b) => b.cell)), count: fresh.length, text: `区画に新しい建物が ${String(fresh.length)} 軒建った` });
  const grown = after.city.buildings.filter((b) => (old.get(b.id)?.level ?? b.level) < b.level);
  if (grown.length > 0) out.push({ kind: 'grown', at: centroid(grown.map((b) => b.cell)), count: grown.length, text: `区画の建物が ${String(grown.length)} 軒育った` });

  for (const d of raised) {
    if (after.city.facilities.some((f) => domainsOfFacility(f.type).some((x) => x.id === d.id))) continue;
    out.push({ kind: 'no-facility', domain: d.id, text: `${joined(d.name)}の施設（${FACILITY_DEFS[d.facility].name}）を建てると、学んだ成果がそこに形になる` });
  }
  return out;
}

/** カメラを寄せる場所（場所のある変化のうち、いちばん大事な物）。無ければ null */
export function focusOf(changes: readonly Change[]): { at: Point; size: Point; facilityId?: string } | null {
  for (const c of changes) {
    if (c.kind === 'upgradable') return { at: c.at, size: c.size, facilityId: c.facilityId };
    if (c.kind === 'built' || c.kind === 'grown') return { at: c.at, size: { x: 3, y: 3 } };
  }
  return null;
}
