import { DOMAINS } from '@/city/facilityInfo';
import type { DomainId } from '@/city/types';
import { POLITICS_RULES, REASONS } from '@/content/politics';
import { DIFFICULTY_NAMES, lessonMeta } from '@/game/lessons';
import { SKILL_STAGE_NAMES, type SkillStage } from '@/game/skill';
import { handOptions, issuesOf, type HandOptions, type SkillValues } from '@/sim/hearing';
import { applicationName } from '@/sim/permits';
import type { Application, Concession, ModKey, ObjectionReason, ObjectionState, World } from '@/sim/types';
import { groupName, placeOf, roundParts } from './permitView';

/**
 * 公聴会の窓（docs/ui-design.md 10.3）に出す中身。規則は src/sim/hearing.ts にあり、ここは文に直すだけ。
 * 左に論点（内訳で 5% 以上の理由）、右に選んだ論点の手（譲歩する・説明する・押し切る）
 */

const MOD_NAMES: Record<ModKey, string> = {
  height: '高さ', noise: '騒音', nightNoise: '夜の騒音', traffic: '交通の流れ', tech: '技術力への効き', jobs: '雇う人数',
  power: '使う電力', coolingWater: '冷却水の量', green: '敷地の緑地', units: '戸数',
};

/** 倍率の言い方（0.6 → 「4 割減」、0 → 「なくす」、1.6 → 「6 割増」） */
function rate(v: number): string {
  if (v <= 0) return 'なくす';
  const d = Math.round((1 - v) * 10);
  if (d > 0) return `${String(d)} 割減`;
  if (d < 0) return `${String(-d)} 割増`;
  return '変わらない';
}

/** 譲歩の効き（どの値がどれだけ変わるか。docs/ui-design.md 10.3） */
export function modsText(mods: Concession['mods']): string[] {
  return (Object.entries(mods) as [ModKey, number][]).map(([k, v]) => {
    if (k === 'height') return `${MOD_NAMES.height} ${v < 0 ? `${String(-v)} 段低く` : `${String(v)} 段高く`}`;
    if (k === 'green') return `${MOD_NAMES.green}を ${String(Math.round(v * 10))} 割足す`;
    return `${MOD_NAMES[k]} ${rate(v)}`;
  });
}

const domainName = (id: DomainId): string => DOMAINS.find((d) => d.id === id)?.name ?? id;

/** 手の結果の 1 行（論点の列に出す） */
export function handText(o: ObjectionState, reason: ObjectionReason): string {
  const h = o.hand;
  if (!h) return '';
  if (h.kind === 'concede') return `譲歩: ${reason.concessions.find((c) => c.id === h.concessionId)?.label ?? ''}`;
  if (h.kind === 'explain') return '説明した';
  return `押し切った（政治資本 ${String(h.capital)}）`;
}

export interface IssueRow {
  reasonId: string;
  title: string;
  /** 今の割合（%。整数。論点でない理由を含めた合計が反対率と一致する丸め方） */
  share: number;
  group: string;
  claim: string;
  done: string;
}

export interface HearingModel {
  id: string;
  name: string;
  place: string;
  opposition: number;
  capital: number;
  issues: IssueRow[];
  /** 手を出していない論点の数（「公聴会を終える」に添える） */
  left: number;
}

export function hearingModel(world: World, id: string): HearingModel | null {
  const app = world.applications.find((a) => a.id === id);
  if (!app) return null;
  const shares = roundParts(app.objections.map((o) => o.share));
  const share = new Map(app.objections.map((o, i) => [o.reasonId, shares[i] as number]));
  const issues = issuesOf(app).flatMap((o): IssueRow[] => {
    const r = REASONS.find((x) => x.id === o.reasonId);
    if (!r) return [];
    return [{ reasonId: o.reasonId, title: r.title, share: share.get(o.reasonId) ?? 0, group: groupName(o, world), claim: r.claim, done: handText(o, r) }];
  }).sort((a, b) => b.share - a.share);
  return {
    id,
    name: applicationName(app, world.city),
    place: placeOf(app, world),
    opposition: Math.round(app.opposition),
    capital: world.politics.capital,
    issues,
    left: issues.filter((i) => !i.done).length,
  };
}

export interface HandsModel {
  reasonId: string;
  title: string;
  concessions: { id: string; label: string; effects: string[]; cost: number; ok: boolean; why?: string; tech?: string; loss?: string }[];
  explanations: { id: string; text: string }[];
  /** 伏せた候補（「データベース 中級で出せる説明が 1 つある」） */
  hidden: string[];
  push: { cost: number; ok: boolean; groups: string };
  /** 出した手（出した後は手を出せない） */
  used: boolean;
  /** 出した手の候補（譲歩・説明の ID か 'push'） */
  chosen: string | null;
}

export function handsModel(world: World, app: Application, reasonId: string, skills: SkillValues): HandsModel | null {
  const o = app.objections.find((x) => x.reasonId === reasonId);
  const r = REASONS.find((x) => x.id === reasonId);
  const opt: HandOptions | null = handOptions(world, app, reasonId, skills, POLITICS_RULES);
  if (!o || !r || !opt) return null;
  return {
    reasonId,
    title: r.title,
    concessions: opt.concessions.map((c) => ({
      id: c.concession.id,
      label: c.concession.label,
      effects: modsText(c.concession.mods),
      cost: c.cost,
      ok: c.ok,
      ...(c.why === 'funds' ? { why: '資金が足りない' } : {}),
      ...(c.concession.requires ? { tech: `${domainName(c.concession.requires.domain)} ${SKILL_STAGE_NAMES[c.concession.requires.stage as SkillStage]}の技術の代案` } : {}),
      ...(c.concession.loss ? { loss: c.concession.loss } : {}),
    })),
    explanations: opt.explanations.map((e) => ({ id: e.id, text: e.text })),
    hidden: opt.hidden.map((h) => `${domainName(h.domain)} ${SKILL_STAGE_NAMES[h.stage as SkillStage]}で出せる説明が ${String(h.count)} つある`),
    push: { cost: opt.push.cost, ok: opt.push.ok, groups: groupName(o, world) },
    used: o.hand !== undefined,
    chosen: o.hand ? (o.hand.kind === 'concede' ? o.hand.concessionId : o.hand.kind === 'explain' ? o.hand.explanationId : 'push') : null,
  };
}

/** 手を出した後の、住民と議員の受け取り方の 1 行（説明は `why`。docs/ui-design.md 10.3） */
export function reactionText(before: Application, after: Application, reasonId: string): string {
  const r = REASONS.find((x) => x.id === reasonId);
  const o0 = before.objections.find((x) => x.reasonId === reasonId);
  const o1 = after.objections.find((x) => x.reasonId === reasonId);
  const h = o1?.hand;
  if (!r || !o0 || !o1 || !h) return '';
  const pct = (v: number): string => `${String(Math.round(v))}%`;
  if (h.kind === 'explain') return r.explanations.find((e) => e.id === h.explanationId)?.why ?? '';
  if (h.kind === 'concede') return `${r.title}の反対が ${pct(o0.share)} → ${pct(o1.share)}。反対率は ${pct(before.opposition)} → ${pct(after.opposition)}`;
  return `${r.title}を押し切った。反対率は変わらないが、議員はこの論点を軽く見る。反対した人たちの市政への信頼が下がった`;
}

/**
 * 説明の後に示す、学べるレッスン（17.2「誤りなら、なぜ誤りかと、学べるレッスンを示す」）。
 * データの `lesson` を持つ説明（誤りと一部）だけ。確かな説明には添えない
 */
export function reactionLesson(after: Application, reasonId: string): string | null {
  const h = after.objections.find((x) => x.reasonId === reasonId)?.hand;
  if (h?.kind !== 'explain') return null;
  const id = REASONS.find((x) => x.id === reasonId)?.explanations.find((e) => e.id === h.explanationId)?.lesson;
  const meta = id ? lessonMeta(id) : null;
  return meta ? `${meta.title}（${DIFFICULTY_NAMES[meta.difficulty]}）` : null;
}

/** 窓の題（「データセンター（東町）の公聴会」） */
export function hearingTitle(m: Pick<HearingModel, 'name' | 'place'>): string {
  return `${m.name}${m.place ? `（${m.place}）` : ''}の公聴会`;
}
