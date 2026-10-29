import { z } from 'zod';
import councilData from '../../content/politics/council.json';
import explainData from '../../content/politics/explain.json';
import namesData from '../../content/politics/names.json';
import newsData from '../../content/politics/news.json';
import petitionsData from '../../content/politics/petitions.json';
import pledgesData from '../../content/politics/pledges.json';
import { FACILITY_DEFS } from '@/city/facilities';
import { DOMAINS } from '@/city/facilityInfo';
import type { DomainId } from '@/city/types';
import { parseCondition } from '@/sim/conditions';
import { COUNTED_WORDS } from '@/sim/election';
import { LAYER_COUNT } from '@/sim/layers';
import { needsApplication } from '@/sim/permits';
import { NEWS_SLOTS, slotsOf } from '@/sim/news';
import { PETITION_WORDS } from '@/sim/petitions';
import { MOD_KEYS, type CouncilMember, type NewsKind, type NewsRules, type Petition, type GroupId, type IssueId, type Measure, type MemberLineKey, type ModKey, type ObjectionReason, type Pledge, type PoliticsRules } from '@/sim/types';
import { termsIn } from './rich';
import { DOMAIN_IDS, domainId } from './schema';

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
const FACTOR_IDS = ['afford', 'jobs', 'commute', 'noise', 'green', 'police', 'school', 'clinic', 'fire', 'power', 'tax', 'trust', 'event'] as const;
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

/* ---------- 公約（7.4） ---------- */

export const pledgeSchema = z.object({
  pledges: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: text,
    goal: text,
    layers: z.array(z.number().int()).min(1),
  }).strict()),
}).strict();

export const PLEDGES: readonly Pledge[] = pledgeSchema.parse(pledgesData).pledges;

/**
 * 公約の検証（docs/content-spec.md 6 章）: goal が 7.7 の式として読める（学習の語は式に無い）・
 * 今の模擬が数えている語だけ・層の番号が 0〜11 で重ならない・ID が重ならない・選べるよう 4 つ以上
 */
export function validatePledges(pledges: readonly Pledge[]): string[] {
  const out: string[] = [];
  const counted = new Set<string>(COUNTED_WORDS);
  const ids = new Set<string>();
  if (pledges.length < 4) out.push(`公約の候補が ${String(pledges.length)} つ（4 つ以上要る）`);
  for (const p of pledges) {
    if (ids.has(p.id)) out.push(`${p.id}: 公約の ID が重なる`);
    ids.add(p.id);
    const clauses = parseCondition(p.goal);
    if (!clauses) out.push(`${p.id}: goal が式として読めない（${p.goal}）`);
    for (const c of clauses ?? []) {
      for (const w of [c.word, ...('start' in c ? [c.start] : [])]) if (!counted.has(w)) out.push(`${p.id}: ${w} は今の模擬が数えていない語`);
    }
    if (new Set(p.layers).size !== p.layers.length || p.layers.some((l) => l < 0 || l >= LAYER_COUNT)) out.push(`${p.id}: 層の番号が 0〜11 で重ならない形でない`);
  }
  return out;
}

/* ---------- 請願（7.3） ---------- */

const facilityType = z.enum(Object.keys(FACILITY_DEFS) as [keyof typeof FACILITY_DEFS, ...(keyof typeof FACILITY_DEFS)[]]);
const share = z.number().gt(0).lt(1);
const weeks = z.number().int().min(1).max(52);

export const petitionSchema = z.object({
  petitions: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: text,
    text,
    group: z.enum(GROUPS),
    layers: z.array(z.number().int()).min(1).optional(),
    when: text,
    priority: z.number().int().min(1).max(9),
    accept: z.object({
      effect: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('rent-subsidy'), ratio: share, weeks }).strict(),
        z.object({ kind: z.literal('build'), type: facilityType }).strict(),
        z.object({ kind: z.literal('power-cap'), mw: z.number().gt(0) }).strict(),
        z.object({ kind: z.literal('noise-limit'), factor: share, weeks }).strict(),
        z.object({ kind: z.literal('bus'), traffic: share, weeks }).strict(),
      ]),
      cost: z.object({ treasury: z.number().min(0).optional(), weekly: z.number().min(0).optional(), weeks: weeks.optional() }).strict().optional(),
      why: text,
    }).strict(),
    reject: z.object({ why: text }).strict(),
  }).strict()),
}).strict();

export const PETITIONS: readonly Petition[] = petitionSchema.parse(petitionsData).petitions;

/**
 * 請願の検証（docs/content-spec.md 6 章）: when が 7.7 の式として読め、今の模擬が数えている語だけ（start の語は公約だけ）・
 * 層の番号が 0〜11 で重ならない・続く中身と毎週の費用は週の数を持つ・建てる種類は公共サービス（申請を出す）か申請の要らない物・
 * 文（要望・受理・拒否）を請願どうしで使い回さない・ID が重ならない
 */
export function validatePetitions(petitions: readonly Petition[]): string[] {
  const out: string[] = [];
  const words = new Set<string>(PETITION_WORDS);
  const ids = new Set<string>();
  const seen = new Map<string, string>();
  for (const p of petitions) {
    if (ids.has(p.id)) out.push(`${p.id}: 請願の ID が重なる`);
    ids.add(p.id);
    const clauses = parseCondition(p.when);
    if (!clauses) out.push(`${p.id}: when が式として読めない（${p.when}）`);
    for (const c of clauses ?? []) {
      if ('start' in c) out.push(`${p.id}: start の語は公約だけ（${c.start}）`);
      const w = c.word.replace(/^any:/, '');
      if (!words.has(w)) out.push(`${p.id}: ${w} は今の模擬が数えていない語`);
    }
    if (p.layers && (new Set(p.layers).size !== p.layers.length || p.layers.some((l) => l < 0 || l >= LAYER_COUNT))) out.push(`${p.id}: 層の番号が 0〜11 で重ならない形でない`);
    const e = p.accept.effect;
    if (e.kind === 'build' && needsApplication(e.type) && FACILITY_DEFS[e.type].group !== 'civic') out.push(`${p.id}: ${e.type} は公共サービスでない申請の要る種類（建てる請願は、公共サービスか申請の要らない種類だけ）`);
    if (e.kind === 'build' && clauses && !clauses.some((c) => c.word.startsWith('any:'))) out.push(`${p.id}: 建てる請願は、届く地区を決める any: の語が要る`);
    if ((e.kind === 'rent-subsidy' || e.kind === 'noise-limit' || e.kind === 'bus') && clauses && !clauses.some((c) => c.word.startsWith('any:'))) out.push(`${p.id}: 地区に効く中身は、届く地区を決める any: の語が要る`);
    if ((p.accept.cost?.weekly ?? 0) > 0 && p.accept.cost?.weeks === undefined && !('weeks' in e)) out.push(`${p.id}: 毎週の費用に週の数が無い`);
    for (const t of [p.text, p.accept.why, p.reject.why]) {
      const other = seen.get(t);
      if (other) out.push(`${p.id}: 文が ${other} と同じ（${t.slice(0, 20)}…）`);
      seen.set(t, p.id);
    }
  }
  return out;
}

/* ---------- 新聞の型の文（7.5） ---------- */

const NEWS_KINDS = ['application', 'approved', 'rejected', 'appeal', 'completed', 'election', 'term-end', 'closure', 'outage', 'tax', 'petition', 'mission', 'reward', 'scandal', 'start'] as const satisfies readonly NewsKind[];

export const newsSchema = z.object({
  title: text,
  templates: z.array(z.object({
    kind: z.enum(NEWS_KINDS),
    variant: z.string().min(1).optional(),
    headline: text,
    body: text,
  }).strict()),
}).strict();

export const NEWS: NewsRules = newsSchema.parse(newsData);

/**
 * 新聞の型の文の検証（docs/content-spec.md 6 章・7.5）: 記事になる種類と場合分けのそれぞれに型の文がある・
 * 書いた差し込み名が、その種類で入る物・見出しと本文を使い回さない・本文は 2〜3 文
 */
export function validateNews(news: NewsRules): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of news.templates) {
    const key = t.variant ? `${t.kind}:${t.variant}` : t.kind;
    const slots = slotsOf(t.kind, t.variant);
    if (!slots) {
      out.push(`${key}: 今の模擬が記事にしない種類（停電は G10・褒賞は G11 で足す）`);
      continue;
    }
    for (const name of `${t.headline}${t.body}`.match(/\{[a-z]+\}/g) ?? []) {
      if (!(slots as readonly string[]).includes(name.slice(1, -1))) out.push(`${key}: ${name} はこの種類に入らない差し込み名`);
    }
    for (const s of [t.headline, t.body]) {
      if (seen.has(s)) out.push(`${key}: 文を使い回している（${s.slice(0, 20)}…）`);
      seen.add(s);
    }
    const sentences = t.body.split('。').filter((x) => x.trim() !== '').length;
    if (sentences < 2 || sentences > 3) out.push(`${key}: 本文が ${String(sentences)} 文（2〜3 文）`);
  }
  for (const key of Object.keys(NEWS_SLOTS)) {
    const [kind, variant] = key.split(':');
    if (!news.templates.some((t) => t.kind === kind && t.variant === variant)) out.push(`${key}: 型の文が無い`);
  }
  return out;
}

/** 模擬に渡す市政のデータ（理由と議員と、施設の電力・性質と、公約と請願と新聞） */
export const POLITICS_RULES: PoliticsRules = {
  reasons: REASONS,
  council: COUNCIL,
  pledges: PLEDGES,
  petitions: PETITIONS,
  news: NEWS,
  facilities: Object.fromEntries(Object.values(FACILITY_DEFS).filter((d) => d.powerMW !== undefined || d.traits).map((d) => [d.type, {
    ...(d.powerMW !== undefined ? { powerMW: d.powerMW } : {}),
    ...(d.traits ? { traits: d.traits } : {}),
  }])),
};

/** 反対の理由が立つ申請の種類（IT 施設 15・そのアップグレード・用途地域の変更の 4 つの区画・公共サービスと発電所・褒賞の建物） */
export function objectionTargets(): string[] {
  const it = Object.values(FACILITY_DEFS).filter((d) => d.group === 'facility').map((d) => d.type);
  // 公共サービスと発電所（Lv が無いのでアップグレードは無い。docs/city-design.md 9.2）
  const civic = Object.values(FACILITY_DEFS).filter((d) => d.group === 'civic' || d.group === 'power').map((d) => `civic:${d.type}`);
  // 褒賞の建物（docs/game-design.md 25 章。Lv が無いのでアップグレードは無い）
  const reward = Object.values(FACILITY_DEFS).filter((d) => d.group === 'award').map((d) => `reward:${d.type}`);
  return [...it, ...it.map((t) => `upgrade:${t}`), ...['residential', 'commercial', 'office', 'industrial'].map((k) => `rezone:${k}`), ...civic, ...reward];
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
  return [...out, ...validateLearning(reasons)];
}

/**
 * 分野の推奨前提と関連（docs/curriculum.md 3.2 の辺）。IT 施設の理由の説明と技術の代案は、
 * その施設の分野か、ここに挙げた分野で書く。trouble は全分野と関連し、lab は複数分野の組み合わせ（どの分野でもよい）
 */
export const DOMAIN_LINKS: Readonly<Record<DomainId, readonly DomainId[]>> = {
  found: ['linux', 'net'],
  linux: ['found', 'net', 'git', 'ctr'],
  net: ['found', 'linux', 'web', 'cloud'],
  web: ['net', 'sec', 'db', 'cicd'],
  sec: ['web', 'found', 'linux', 'cicd', 'mon'],
  git: ['linux', 'cicd', 'devops'],
  cicd: ['git', 'sec', 'devops', 'docker'],
  ctr: ['linux', 'found', 'docker', 'k8s', 'cloud'],
  docker: ['ctr', 'k8s', 'cicd'],
  k8s: ['ctr', 'docker', 'net', 'cloud', 'mon', 'devops'],
  db: ['web', 'cloud', 'trouble'],
  cloud: ['net', 'ctr', 'k8s', 'devops'],
  mon: ['linux', 'k8s', 'trouble', 'devops'],
  devops: ['cicd', 'mon', 'cloud', 'k8s'],
  trouble: DOMAIN_IDS.filter((d) => d !== 'trouble'),
  lab: DOMAIN_IDS.filter((d) => d !== 'lab'),
};

/** 技術の代案の段階（docs/learning-design.md 12.2: 段階 4〜5 は技術の代案の譲歩） */
const TECH_STAGE = 4;

/**
 * 学ぶと答えが増えることの検証（docs/content-spec.md 6 章・docs/game-design.md 20 章）。IT 施設の理由ごとに:
 * 説明と技術の代案の分野が、その施設の分野か推奨前提・関連の分野・`sound` の説明が段階 1〜2 に 1 つ以上と段階 3 に 1 つ以上・
 * 技術の代案（`requires` の段階 4 以上）が 1 つ以上
 */
export function validateLearning(reasons: readonly ObjectionReason[]): string[] {
  const out: string[] = [];
  for (const r of reasons) {
    const home = DOMAINS.filter((d) => r.targets.includes(d.facility)).map((d) => d.id);
    if (home.length === 0) continue;
    const allowed = new Set<DomainId>([...home, ...home.flatMap((d) => DOMAIN_LINKS[d])]);
    for (const e of r.explanations) if (!allowed.has(e.domain)) out.push(`${r.id}: 説明 ${e.id} の分野 ${e.domain} が施設の分野にも関連の分野にも無い`);
    const sound = r.explanations.filter((e) => e.quality === 'sound');
    if (!sound.some((e) => e.stage <= 2)) out.push(`${r.id}: 段階 1〜2 の sound の説明が無い`);
    if (!sound.some((e) => e.stage === 3)) out.push(`${r.id}: 段階 3 の sound の説明が無い`);
    const tech = r.concessions.filter((c) => c.requires);
    if (!tech.some((c) => (c.requires?.stage ?? 0) >= TECH_STAGE)) out.push(`${r.id}: 技術の代案（requires の段階 ${String(TECH_STAGE)} 以上の譲歩）が無い`);
    for (const c of tech) if (c.requires && !allowed.has(c.requires.domain)) out.push(`${r.id}: 技術の代案 ${c.id} の分野 ${c.requires.domain} が施設の分野にも関連の分野にも無い`);
  }
  return out;
}
