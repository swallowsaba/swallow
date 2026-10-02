import { frontOf, occupancyOf } from '@/city/cells';
import { FACILITY_DEFS } from '@/city/facilities';
import { domainsOfFacility, facilityCondition, nextLevelOf, parkReach } from '@/city/facilityInfo';
import { amenityAt } from '@/city/growth';
import { buildingName } from '@/city/place';
import type { Selection } from '@/city/render/CityRenderer';
import { CAPACITY, constructionStage, PARK_RADIUS, ZONE_RULES } from '@/city/rules';
import type { City, DomainId } from '@/city/types';
import { SKILL_STAGE_NAMES, skillStageOf } from '@/game/skill';
import { domain as domainColors } from '@/ui/tokens';
import preview from '../../../content/preview.json';

/**
 * 情報パネルに出す中身（docs/ui-design.md 5 章）。規則は src/city の関数が決め、ここは文に直すだけ。
 * 「ここで学ぶ」は、学習ライブラリができるまで content/preview.json の見本のレッスン名を出す。
 */

export type Tone = 'ok' | 'warn' | 'bad';

export interface DomainRow {
  id: DomainId;
  name: string;
  color: string;
  value: number;
  stageName: string;
  /** 何をしたからこの値か */
  because: string;
}

export interface FacilityPanelModel {
  kind: 'facility';
  id: string;
  name: string;
  typeLabel: string;
  level: number;
  levelNote: string;
  condition: { text: string; tone: Tone };
  domains: DomainRow[];
  lessons: { id: string; title: string; level: string }[];
  missions: string[];
  upgrade: { title: string; adds: string; cost: number; needs: string } | null;
  effect: string | null;
}

export interface BuildingPanelModel {
  kind: 'building';
  id: string;
  name: string;
  typeLabel: string;
  level: number;
  levelNote: string;
  condition: { text: string; tone: Tone };
  people: string;
  growth: string;
}

export type PanelModel = FacilityPanelModel | BuildingPanelModel;

const LEVEL_NAMES: Record<string, string> = { beginner: '初級', intermediate: '中級', advanced: '上級' };
const lessons = preview.lessons as Record<DomainId, { id: string; title: string; level: string }[]>;
const missions = preview.missions as { title: string; domains: DomainId[] }[];

/** 分野ごとのスキルの値。学習の記録が無いうちは 0 */
export type Skills = Partial<Record<DomainId, number>>;

export function panelModel(city: City, sel: Selection, skills: Skills = {}): PanelModel | null {
  if (sel.kind === 'facility') {
    const f = city.facilities.find((x) => x.id === sel.id);
    if (!f) return null;
    const def = FACILITY_DEFS[f.type];
    const cond = facilityCondition(f, city);
    const condition = cond.kind === 'active'
      ? { text: '稼働中', tone: 'ok' as const }
      : cond.kind === 'constructing'
        ? { text: `建設中（${cond.stage === 'foundation' ? '基礎' : '骨組み'}）`, tone: 'warn' as const }
        : { text: '止まっている: 道路に面していない', tone: 'bad' as const };
    if (def.group !== 'facility') {
      return {
        kind: 'facility', id: f.id, name: def.name, typeLabel: '公園の類', level: f.level, levelNote: '', condition,
        domains: [], lessons: [], missions: [], upgrade: null,
        effect: `周り ${String(PARK_RADIUS)} マスの区画の育ちを良くする（今 ${String(parkReach(f, city))} 軒）`,
      };
    }
    const domains = domainsOfFacility(f.type).map((d): DomainRow => {
      const value = skills[d.id] ?? 0;
      return {
        id: d.id, name: d.name, color: domainColors[d.id], value, stageName: SKILL_STAGE_NAMES[skillStageOf(value)],
        because: value > 0 ? '' : 'まだ学習の記録が無い（修了したレッスン 0 本）',
      };
    });
    const main = domains[0];
    const next = nextLevelOf(f);
    const looks = def.looks ?? [];
    const adds = next ? looks[Math.min(next.level - 1, looks.length - 1)] ?? '' : '';
    const needs = next && main
      ? `${main.name}のスキルが「${SKILL_STAGE_NAMES[next.skillStage]}」以上（今は「${main.stageName}」）と、開発資金`
      : '';
    const own = new Set(domains.map((d) => d.id));
    return {
      kind: 'facility',
      id: f.id,
      name: def.name,
      typeLabel: `${domains.map((d) => d.name).join('・')}の施設`,
      level: f.level,
      levelNote: next ? `Lv${String(next.level)} へ: ${needs}` : '最高のレベル',
      condition,
      domains,
      lessons: domains.flatMap((d) => lessons[d.id] ?? []).slice(0, 3).map((l) => ({ ...l, level: LEVEL_NAMES[l.level] ?? l.level })),
      missions: missions.filter((m) => m.domains.some((d) => own.has(d))).map((m) => m.title).slice(0, 3),
      upgrade: next ? { title: `Lv${String(next.level)}`, adds: next.level - 1 < looks.length ? `${adds}が加わる` : '建物が大きく・細かくなる', cost: next.cost, needs } : null,
      effect: null,
    };
  }
  const b = city.buildings.find((x) => x.id === sel.id);
  const zone = b ? city.zones.find((z) => z.id === b.zoneId) : undefined;
  if (!b || !zone) return null;
  const occ = occupancyOf(city);
  const stage = constructionStage(b.builtDay, city.day);
  const faces = frontOf(b.cell, occ.roads) !== null;
  const amount = CAPACITY[zone.kind][b.level - 1] ?? 0;
  const amenity = amenityAt(city, b.cell.x, b.cell.y, occ.roads);
  return {
    kind: 'building',
    id: b.id,
    name: buildingName(zone.kind, b.level),
    typeLabel: `${ZONE_RULES[zone.kind].name}の区画の建物`,
    level: b.level,
    levelNote: b.level >= 2 && city.stage <= 2 ? '「地方都市」になると、さらに高く育つ' : `育つには、近くに公園か施設が ${String(b.level)} つ以上`,
    condition: !faces
      ? { text: '止まっている: 道路に面していない', tone: 'bad' }
      : stage === 'done'
        ? { text: '完成', tone: 'ok' }
        : { text: `建設中（${stage === 'foundation' ? '基礎' : '骨組み'}）`, tone: 'warn' },
    people: zone.kind === 'residential' ? `住む人 ${String(amount)} 人` : `仕事 ${String(amount)} 人分`,
    growth: `近くの公園と施設: ${String(amenity)}`,
  };
}
