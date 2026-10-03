import { SKILL_STAGE_NAMES, skillStageOf, type SkillStage } from '@/game/skill';
import { STAGE_NAMES } from '@/game/stage';
import { FACILITY_DEFS } from './facilities';
import { domainsOfFacility, nextLevelOf, type NextLevel } from './facilityInfo';
import type { City, DomainId } from './types';

/**
 * 施設のアップグレード（docs/game-design.md 2・5・6 章）。純粋な関数。
 * レベル N に上げるには「その分野のスキル段階が N 以上」かつ「資金（建てた費用 × N ÷ 2）」。
 * 大型施設（3×3）の Lv3〜Lv5 は、さらに発展段階（地方都市・中核都市・技術都市）が要る（docs/decisions.md D-12）。
 * 2 つの分野を持つ施設（コンテナ施設）は、どちらか高い方の段階で判定する。
 */

export type UpgradeReasonCode = 'constructing' | 'skill' | 'stage' | 'funds';

export interface UpgradeReason {
  code: UpgradeReasonCode;
  text: string;
}

export interface UpgradeCheck extends NextLevel {
  ok: boolean;
  facilityId: string;
  /** 判定に使った分野のスキル段階（施設の分野のうち高い方） */
  currentSkillStage: SkillStage;
  /** 上げられない理由（無ければ空） */
  reasons: UpgradeReason[];
}

/** 分野ごとのスキルの値（0〜100） */
export type SkillValueMap = Partial<Record<DomainId, number>>;

/** 施設の分野のスキル段階のうち、高い方 */
export function facilitySkillStage(type: City['facilities'][number]['type'], skills: SkillValueMap): SkillStage {
  return Math.max(0, ...domainsOfFacility(type).map((d) => skillStageOf(skills[d.id] ?? 0))) as SkillStage;
}

/** 次のレベルに上げられるか。分野の施設でない・Lv5 なら null */
export function checkUpgrade(city: City, facilityId: string, skills: SkillValueMap): UpgradeCheck | null {
  const f = city.facilities.find((x) => x.id === facilityId);
  if (!f || FACILITY_DEFS[f.type].group !== 'facility') return null;
  const next = nextLevelOf(f);
  if (!next) return null;
  const current = facilitySkillStage(f.type, skills);
  const reasons: UpgradeReason[] = [];
  if (f.state === 'constructing') reasons.push({ code: 'constructing', text: '建設が終わると上げられる' });
  if (current < next.skillStage) {
    const names = domainsOfFacility(f.type).map((d) => d.name).join('か');
    reasons.push({ code: 'skill', text: `${names}のスキルが「${SKILL_STAGE_NAMES[next.skillStage]}」以上になると上げられる（今は「${SKILL_STAGE_NAMES[current]}」）` });
  }
  if (city.stage < next.cityStage) reasons.push({ code: 'stage', text: `大型施設の Lv${String(next.level)} は、都市が「${STAGE_NAMES[next.cityStage]}」になると上げられる` });
  if (city.funds < next.cost) reasons.push({ code: 'funds', text: `資金が足りない（あと ${String(next.cost - city.funds)}）` });
  return { ...next, ok: reasons.length === 0, facilityId, currentSkillStage: current, reasons };
}

/** 判定に通ったアップグレードを行い、費用を開発資金から引く。通っていなければ都市をそのまま返す */
export function upgradeFacility(city: City, check: UpgradeCheck): City {
  if (!check.ok) return city;
  return {
    ...city,
    funds: city.funds - check.cost,
    facilities: city.facilities.map((f) => (f.id === check.facilityId ? { ...f, level: check.level as 1 | 2 | 3 | 4 | 5 } : f)),
  };
}
