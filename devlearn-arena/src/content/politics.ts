import { z } from 'zod';
import councilData from '../../content/politics/council.json';
import explainData from '../../content/politics/explain.json';
import namesData from '../../content/politics/names.json';
import { FACILITY_DEFS } from '@/city/facilities';
import { MOD_KEYS, type CouncilMember, type GroupId, type IssueId, type Measure, type MemberLineKey, type ModKey, type ObjectionReason, type PoliticsRules } from '@/sim/types';
import { termsIn } from './rich';
import { domainId } from './schema';

/**
 * 市政のデータ（content/politics/。docs/content-spec.md 7 章）を読み込み、検証する。
 * 模擬（src/sim）はこのデータを引数で受け取る（模擬の層は内容の置き場所を知らない）。
 */

/** 地区の名前の部品（7.8）。前と後ろを組み合わせて 144 地区に重ならない名前を作る */
export const nameSchema = z.object({
  prefixes: z.array(z.string().min(1)).min(2),
  suffixes: z.array(z.string().min(1)).min(2),
}).strict().refine((n) => new Set(n.prefixes).size === n.prefixes.length && new Set(n.suffixes).size === n.suffixes.length, '部品が重なる')
  .refine((n) => n.prefixes.length * n.suffixes.length >= 144, '組み合わせが 144 に足りない');
export type NameParts = z.infer<typeof nameSchema>;

export const NAME_PARTS: NameParts = nameSchema.parse(namesData);

/** 説明と判断の 1 行の型の文（7.6）。全ての要因と原因の種類に文がある */
const FACTOR_IDS = ['afford', 'jobs', 'commute', 'noise', 'green', 'police', 'school', 'clinic', 'fire', 'power', 'tax', 'trust'] as const;
const CAUSE_KINDS = ['facility', 'zone', 'building', 'road', 'decision', 'demand'] as const;
export const MEMBER_KEYS = ['gain', 'concern', 'unanswered', 'explained', 'wrong', 'pushed', 'approval', 'persuaded', 'stance'] as const satisfies readonly MemberLineKey[];
export const ISSUES = ['afford', 'environment', 'jobs', 'finance', 'safety', 'traffic', 'tech'] as const satisfies readonly IssueId[];
const text = z.string().min(1);
const recordOf = <K extends string>(keys: readonly K[]) => z.object(Object.fromEntries(keys.map((k) => [k, text])) as Record<K, typeof text>).strict();

export const explainSchema = z.object({
  approval: z.object({ up: text, down: text, flat: text }).strict(),
  layer: text,
  causes: recordOf(CAUSE_KINDS),
  factors: recordOf(FACTOR_IDS),
  member: recordOf(MEMBER_KEYS),
  /** 得の言い表し（議員の 1 行の {gain}。docs/decisions.md C-10） */
  gains: recordOf(ISSUES),
}).strict();
export type ExplainTemplates = z.infer<typeof explainSchema>;

export const EXPLAIN: ExplainTemplates = explainSchema.parse(explainData);

/* ---------- 反対の理由（7.1） ---------- */

const GROUPS = ['neighbors', 'merchants', 'environment', 'taxpayers', 'workers'] as const satisfies readonly GroupId[];
const stage = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
const modsSchema = z.object(Object.fromEntries(MOD_KEYS.map((k) => [k, z.number().optional()])) as Record<ModKey, z.ZodOptional<z.ZodNumber>>).strict();

const measureSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('noise'), night: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('power') }).strict(),
  z.object({ kind: z.literal('jobs-density') }).strict(),
  z.object({ kind: z.literal('sunlight') }).strict(),
  z.object({ kind: z.literal('traffic') }).strict(),
  z.object({ kind: z.literal('rent') }).strict(),
  z.object({ kind: z.literal('trait'), trait: z.enum(MOD_KEYS) }).strict(),
  z.object({ kind: z.literal('service-load'), service: z.enum(['police', 'fire', 'school', 'clinic']) }).strict(),
  z.object({ kind: z.literal('cost') }).strict(),
]);

export const reasonSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: text,
  targets: z.array(z.string().regex(/^(upgrade:|rezone:|civic:|power:|reward:)?[a-z-]+$/)).min(1),
  group: z.enum(GROUPS),
  issue: z.enum(ISSUES),
  measure: measureSchema,
  radius: z.number().int().min(1).max(16).optional(),
  misconception: z.number().min(0).max(0.8),
  claim: text,
  concessions: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    label: text,
    mods: modsSchema,
    cost: z.object({ ratio: z.number().optional(), fixed: z.number().optional() }).strict().optional(),
    loss: text.optional(),
    requires: z.object({ domain: domainId, stage }).strict().optional(),
  }).strict()).min(1),
  explanations: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    domain: domainId,
    stage,
    text,
    quality: z.enum(['sound', 'partial', 'wrong']),
    why: text,
    lesson: z.string().optional(),
  }).strict()),
  lessons: z.array(z.string()).min(1),
}).strict();

const objectionFiles = import.meta.glob<unknown>('../../content/politics/objections/*.json', { eager: true, import: 'default' });

/** 全ての反対の理由（ファイルの名前の順） */
export const REASONS: readonly ObjectionReason[] = Object.keys(objectionFiles).sort()
  .flatMap((path) => z.object({ reasons: z.array(reasonSchema) }).strict().parse(objectionFiles[path]).reasons);

/* ---------- 議員（7.2） ---------- */

export const councilSchema = z.object({
  members: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: text,
    profile: text,
    main: z.enum(ISSUES),
    second: z.enum(ISSUES),
    stance: z.number().int().min(-3).max(3),
    icon: z.string().regex(/^figure-[a-z]+$/),
    lines: z.object(Object.fromEntries(MEMBER_KEYS.map((k) => [k, text.optional()])) as Record<MemberLineKey, z.ZodOptional<typeof text>>).strict().optional(),
  }).strict()),
}).strict();

export const COUNCIL: readonly CouncilMember[] = councilSchema.parse(councilData).members;

/**
 * 議員の検証（docs/content-spec.md 6 章）: ちょうど 7 人・7 つの論点のそれぞれが、ちょうど 1 人の主な論点・
 * 次の論点は主な論点と違う・口ぶりの文を議員どうしで使い回さない・差し込み名は 7.6 の物だけ
 */
export function validateCouncil(members: readonly CouncilMember[]): string[] {
  const out: string[] = [];
  if (members.length !== 7) out.push(`議員が ${String(members.length)} 人（ちょうど 7 人）`);
  for (const issue of ISSUES) {
    const n = members.filter((m) => m.main === issue).length;
    if (n !== 1) out.push(`論点 ${issue} を主に見る議員が ${String(n)} 人（ちょうど 1 人）`);
  }
  const ids = new Set<string>();
  const seen = new Map<string, string>();
  for (const m of members) {
    if (ids.has(m.id)) out.push(`${m.id}: 議員の ID が重なる`);
    ids.add(m.id);
    if (m.second === m.main) out.push(`${m.id}: 次の論点が主な論点と同じ`);
    for (const [k, line] of Object.entries(m.lines ?? {})) {
      const other = seen.get(line);
      if (other) out.push(`${m.id}: ${k} の文が ${other} と同じ`);
      seen.set(line, m.id);
      for (const name of line.match(/\{[a-z]+\}/g) ?? []) if (!['{issue}', '{reason}', '{gain}', '{rate}', '{dir}'].includes(name)) out.push(`${m.id}: ${k} に知らない差し込み名 ${name}`);
    }
  }
  return out;
}

/** 模擬に渡す市政のデータ（理由と議員と、施設の電力・性質） */
export const POLITICS_RULES: PoliticsRules = {
  reasons: REASONS,
  council: COUNCIL,
  facilities: Object.fromEntries(Object.values(FACILITY_DEFS).filter((d) => d.powerMW !== undefined || d.traits).map((d) => [d.type, {
    ...(d.powerMW !== undefined ? { powerMW: d.powerMW } : {}),
    ...(d.traits ? { traits: d.traits } : {}),
  }])),
};

/** 反対の理由が立つ申請の種類（今ある物: IT 施設 15・そのアップグレード・用途地域の変更の 4 つの区画。公共サービス・発電所・褒賞は G10・G11 で足す） */
export function objectionTargets(): string[] {
  const it = Object.values(FACILITY_DEFS).filter((d) => d.group === 'facility').map((d) => d.type);
  return [...it, ...it.map((t) => `upgrade:${t}`), ...['residential', 'commercial', 'office', 'industrial'].map((k) => `rezone:${k}`)];
}

/** 理由の強さ（measure）の元の値を、その譲歩の性質が下げるか（docs/content-spec.md 7.1.1 の対応） */
export function lowersMeasure(measure: Measure, c: Pick<ObjectionReason['concessions'][number], 'mods' | 'cost'>): boolean {
  const m = c.mods;
  const down = (k: ModKey): boolean => (k === 'height' ? (m.height ?? 0) < 0 : (m[k] ?? 1) < 1);
  switch (measure.kind) {
    case 'noise': return down('noise') || down('nightNoise') || down('height');
    case 'power': return down('power');
    case 'jobs-density': return (m.jobs ?? 1) > 1;
    case 'sunlight': return down('height');
    case 'traffic': return down('traffic');
    case 'rent': return down('units') || down('height');
    case 'trait': return down(measure.trait);
    case 'service-load': return down('units') || down('height');
    case 'cost': return (c.cost?.ratio ?? 0) < 0 && (down('height') || down('units'));
  }
}

/**
 * 市政のデータの検証（docs/content-spec.md 6 章の市政の項目のうち、反対の理由と譲歩と説明の物）。
 * 問題の文の一覧を返す（空なら合格）
 */
export function validateReasons(reasons: readonly ObjectionReason[], ctx: { lessons: ReadonlySet<string>; terms: ReadonlySet<string> }): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const concessionIds = new Set<string>();
  for (const r of reasons) {
    if (ids.has(r.id)) out.push(`${r.id}: 理由の ID が重なる`);
    ids.add(r.id);
    const local = r.group === 'neighbors' || r.group === 'merchants' || r.group === 'workers';
    if (local && r.radius === undefined) out.push(`${r.id}: 近くの集団の理由に半径が無い`);
    if (!local && r.radius !== undefined) out.push(`${r.id}: 都市全体の集団の理由に半径がある`);
    const plain = r.concessions.filter((c) => !c.requires);
    if (plain.length === 0) out.push(`${r.id}: requires の無い譲歩が無い（スキルが無くても通せる道が要る）`);
    else if (!plain.some((c) => lowersMeasure(r.measure, c))) out.push(`${r.id}: requires の無い譲歩のどれも、強さの元の値（${r.measure.kind}）を下げない`);
    for (const c of r.concessions) {
      if (concessionIds.has(c.id)) out.push(`${r.id}: 譲歩の ID が重なる（${c.id}）`);
      concessionIds.add(c.id);
    }
    for (const e of r.explanations) if (e.quality !== 'sound' && !e.lesson) out.push(`${r.id}: ${e.id} は ${e.quality} なのに lesson が無い`);
    for (const l of [...r.lessons, ...r.explanations.flatMap((e) => (e.lesson ? [e.lesson] : []))]) if (!ctx.lessons.has(l)) out.push(`${r.id}: レッスン ${l} が無い`);
    for (const t of [r.claim, ...r.explanations.flatMap((e) => [e.text, e.why])].flatMap(termsIn)) if (!ctx.terms.has(t)) out.push(`${r.id}: 用語 ${t} が用語集に無い`);
    for (const t of [r.title, ...r.concessions.map((c) => c.label)]) if (termsIn(t).length > 0) out.push(`${r.id}: 題と譲歩の文に用語の印は書かない（${t}）`);
  }
  for (const target of objectionTargets()) {
    const n = reasons.filter((r) => r.targets.includes(target)).length;
    if (n < 2) out.push(`${target}: 反対の理由が ${String(n)} つ（2 つ以上要る）`);
  }
  return out;
}
