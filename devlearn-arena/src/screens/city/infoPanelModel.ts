import { frontOf, occupancyOf } from '@/city/cells';
import { FACILITY_DEFS, serviceCoverageOf, type CoverageKind } from '@/city/facilities';
import { domainsOfFacility, facilityCondition, nextLevelOf, parkReach } from '@/city/facilityInfo';
import { amenityAt } from '@/city/growth';
import { buildingName } from '@/city/place';
import type { Selection } from '@/city/render/CityRenderer';
import { constructionStage, PARK_RADIUS, zoneCapacity, ZONE_RULES } from '@/city/rules';
import { checkUpgrade } from '@/city/upgrade';
import type { City, DomainId } from '@/city/types';
import { LEVEL_NAMES } from '@/content/catalog';
import { emptyProgress } from '@/game/progress';
import { SKILL_STAGE_NAMES, skillStageOf, type SkillDetail } from '@/game/skill';
import { STAGE_NAMES } from '@/game/stage';
import type { Progress } from '@/game/types';
import { lessonsForDomains, type LessonStatus } from '@/learning/library';
import { skillBecause } from '../skills';
import { domain as domainColors } from '@/ui/tokens';
import { isOpen, STAGE_LABEL, waitingText } from '@/sim/permits';
import type { Application } from '@/sim/types';
import { missionCountForFacility, missionsForFacility, missionStatus, type MissionStatus } from '@/learning/missions';

/**
 * 情報パネルに出す中身（docs/ui-design.md 5 章）。規則は src/city の関数が決め、ここは文に直すだけ。
 * 「ここで学ぶ」は、施設の分野のレッスンを推奨学習順・未修了優先で 3 つ（src/learning/library.ts）。
 * ミッションは、施設の分野を含むものを、施設の Lv の数まで（docs/game-design.md 5 章・docs/decisions.md D-14。src/learning/missions.ts）。
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
  lessons: { id: string; title: string; level: string; status: LessonStatus }[];
  /** 学習ライブラリで全部見る時に絞る分野 */
  libraryDomain: DomainId | null;
  missions: { id: string; title: string; status: MissionStatus }[];
  /** 施設の分野を含むミッションの全部の数（Lv が上がると、この数まで並ぶ） */
  missionTotal: number;
  /** 次のレベル（docs/game-design.md 5 章）。ok なら「上げる」を押せる。blocked は上げられない理由。pending はアップグレードの申請が進んでいる時の 1 行 */
  upgrade: { level: number; title: string; adds: string; cost: number; needs: string; ok: boolean; blocked: string[]; pending?: string } | null;
  effect: string | null;
  /** 電力を多く使う施設（データセンター・クラスタ施設・クラウドセンター）の使う量（docs/city-design.md 9.4） */
  power?: string | null;
  /** 申請中・工事中なら、その申請（「申請の詳細を見る」。docs/ui-design.md 5 章） */
  permitId?: string;
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

/** 分野ごとのスキル（src/game/skill.ts）。無い分野は 0 として扱う */
export type Skills = Partial<Record<DomainId, SkillDetail>>;

/** 公共サービスが支える暮らし（docs/game-design.md 24.2） */
const SERVICE_LIFE: Record<CoverageKind, string> = { police: '治安', fire: '防災', school: '教育', clinic: '医療' };
const CAPACITY_OF: Partial<Record<CoverageKind, string>> = { school: '子育ての世帯', clinic: '高齢の世帯' };
/** 情報パネルに使う量を出す施設（使う量が 3 MW / Lv 以上） */
const HEAVY_POWER_MW = 3;

/** off: 今の週に停電している施設の ID（docs/game-design.md 24.1。学習には効かない） */
export function panelModel(city: City, sel: Selection, skills: Skills = {}, progress: Progress = emptyProgress(), applications: readonly Application[] = [], off: ReadonlySet<string> = new Set()): PanelModel | null {
  if (sel.kind === 'application') return applicationModel(city, sel.id, skills, progress, applications);
  if (sel.kind === 'facility') {
    const f = city.facilities.find((x) => x.id === sel.id);
    if (!f) return null;
    const def = FACILITY_DEFS[f.type];
    const cond = facilityCondition(f, city);
    const day = Math.floor(city.day);
    const left = f.completeDay !== undefined ? Math.max(0, f.completeDay - day) : null;
    const condition = cond.kind === 'active' && off.has(f.id)
      ? { text: def.group === 'facility' ? '停電している（輪番の停電。ここで学ぶことはできる）' : '停電している（輪番の停電）', tone: 'bad' as const }
      : cond.kind === 'active'
      ? { text: '稼働中', tone: 'ok' as const }
      : cond.kind === 'constructing'
        ? { text: `建設中（${cond.stage === 'foundation' ? '基礎' : '骨組み'}）${left !== null ? `・完成まで ${String(left)} 日` : ''}`, tone: 'warn' as const }
        : { text: '止まっている: 道路に面していない', tone: 'bad' as const };
    const permit = applications.find((a) => isOpen(a) && a.target.facilityId === f.id);
    if (def.group === 'civic' || def.group === 'power') {
      const cov = serviceCoverageOf(def);
      const upkeep = `財政から毎週 ${String(def.upkeep ?? 0)}`;
      const who = cov ? (CAPACITY_OF[cov.kind] && cov.capacity ? `${CAPACITY_OF[cov.kind] ?? ''}（${cov.capacity.toLocaleString('ja-JP')} 世帯まで）` : '住民') : '';
      return {
        kind: 'facility', id: f.id, name: def.name, typeLabel: def.group === 'power' ? '発電所' : '公共サービス', level: f.level, levelNote: '', condition,
        domains: [], lessons: [], libraryDomain: null, missions: [], missionTotal: 0, upgrade: null,
        effect: cov
          ? `道路で ${String(cov.distance)} マスまでの${who}の${SERVICE_LIFE[cov.kind]}を支える。${upkeep}`
          : `出力 ${String(-(def.powerMW ?? 0))} MW。面している道路網の建物に電気を送る。${upkeep}`,
        ...(permit ? { permitId: permit.id } : {}),
      };
    }
    if (def.group !== 'facility') {
      return {
        kind: 'facility', id: f.id, name: def.name, typeLabel: '公園の類', level: f.level, levelNote: '', condition,
        domains: [], lessons: [], libraryDomain: null, missions: [], missionTotal: 0, upgrade: null,
        effect: `周り ${String(PARK_RADIUS)} マスの区画の育ちを良くする（今 ${String(parkReach(f, city))} 軒）`,
      };
    }
    const domains = domainsOfFacility(f.type).map((d): DomainRow => {
      const skill = skills[d.id];
      const value = skill?.value ?? 0;
      return {
        id: d.id, name: d.name, color: domainColors[d.id], value, stageName: SKILL_STAGE_NAMES[skillStageOf(value)],
        because: skill ? skillBecause(skill) : 'まだ学習の記録が無い（修了したレッスン 0 本）',
      };
    });
    const main = domains[0];
    const next = nextLevelOf(f);
    const check = checkUpgrade(city, f.id, Object.fromEntries(domains.map((d) => [d.id, d.value])));
    const upgrading = permit?.kind === 'upgrade' ? permit : undefined;
    const looks = def.looks ?? [];
    const adds = next ? looks[Math.min(next.level - 1, looks.length - 1)] ?? '' : '';
    const needs = next && check
      ? `${domains.map((d) => d.name).join('か')}のスキルが「${SKILL_STAGE_NAMES[next.skillStage]}」以上（今は「${SKILL_STAGE_NAMES[check.currentSkillStage]}」）`
        + (next.cityStage > 1 ? `・都市が「${STAGE_NAMES[next.cityStage]}」以上` : '')
        + 'と、開発資金'
      : '';
    return {
      kind: 'facility',
      id: f.id,
      name: def.name,
      typeLabel: `${domains.map((d) => d.name).join('・')}の施設`,
      level: f.level,
      levelNote: next ? `Lv${String(next.level)} へ: ${needs}` : '最高のレベル',
      condition,
      domains,
      lessons: lessonsForDomains(domains.map((d) => d.id), progress).map((l) => ({ id: l.id, title: l.title, level: LEVEL_NAMES[l.level], status: l.status })),
      libraryDomain: main?.id ?? null,
      missions: missionsForFacility(f.type, f.level).map((m) => ({ id: m.id, title: m.title, status: missionStatus(progress, m.id) })),
      missionTotal: missionCountForFacility(f.type),
      upgrade: next ? {
        level: next.level,
        title: `Lv${String(next.level)}`,
        adds: next.level - 1 < looks.length ? `${adds}が加わる` : '建物が大きく・細かくなる',
        cost: next.cost,
        needs,
        ok: (check?.ok ?? false) && !upgrading,
        blocked: upgrading ? [] : check?.reasons.map((r) => r.text) ?? [],
        ...(upgrading ? { pending: `Lv${String(upgrading.target.toLevel ?? next.level)} へのアップグレードを申請中: ${STAGE_LABEL[upgrading.stage]} ${waitingText(upgrading, day)}` } : {}),
      } : null,
      effect: null,
      power: (def.powerMW ?? 0) >= HEAVY_POWER_MW ? `使う電力 ${String((def.powerMW ?? 0) * f.level * (f.mods?.power ?? 1))} MW（Lv × ${String(def.powerMW)} MW）` : null,
      ...(permit ? { permitId: permit.id } : {}),
    };
  }
  const b = city.buildings.find((x) => x.id === sel.id);
  const zone = b ? city.zones.find((z) => z.id === b.zoneId) : undefined;
  if (!b || !zone) return null;
  const occ = occupancyOf(city);
  const stage = constructionStage(b.builtDay, city.day);
  const faces = frontOf(b.cell, occ.roads) !== null;
  const amount = zoneCapacity(zone.kind, b.level, zone.mods);
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

/**
 * 申請中の施設（まだ都市に無い）の情報パネル。名前と申請の段階と、その分野の「ここで学ぶ」とミッション。
 * 申請中でも学習は始められる（docs/ui-design.md 5 章・docs/game-design.md 20 章）
 */
function applicationModel(city: City, id: string, skills: Skills, progress: Progress, applications: readonly Application[]): FacilityPanelModel | null {
  const app = applications.find((a) => a.id === id);
  const type = app?.target.type;
  if (!app || !type) return null;
  const def = FACILITY_DEFS[type];
  const day = Math.floor(city.day);
  const domains = domainsOfFacility(type).map((d): DomainRow => {
    const skill = skills[d.id];
    const value = skill?.value ?? 0;
    return {
      id: d.id, name: d.name, color: domainColors[d.id], value, stageName: SKILL_STAGE_NAMES[skillStageOf(value)],
      because: skill ? skillBecause(skill) : 'まだ学習の記録が無い（修了したレッスン 0 本）',
    };
  });
  return {
    kind: 'facility',
    id: app.id,
    name: def.name,
    typeLabel: `${domains.map((d) => d.name).join('・')}の施設（申請中）`,
    level: 1,
    levelNote: '審議を経て着工し、完成すると動き出す',
    condition: { text: `申請中: ${STAGE_LABEL[app.stage]} ${waitingText(app, day)}`, tone: 'warn' },
    domains,
    lessons: lessonsForDomains(domains.map((d) => d.id), progress).map((l) => ({ id: l.id, title: l.title, level: LEVEL_NAMES[l.level], status: l.status })),
    libraryDomain: domains[0]?.id ?? null,
    missions: missionsForFacility(type, 1).map((m) => ({ id: m.id, title: m.title, status: missionStatus(progress, m.id) })),
    missionTotal: missionCountForFacility(type),
    upgrade: null,
    effect: null,
    permitId: app.id,
  };
}
