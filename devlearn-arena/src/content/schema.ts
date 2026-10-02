import { z } from 'zod';

/**
 * コンテンツのデータの形（docs/content-spec.md）。content/ の JSON を読み込む時に、この形で検証する。
 * 検証に失敗したコンテンツは、テスト（src/content/validate.test.ts）とビルドで落ちる。
 * 余計な項目（例えば学習を止める「ロック」）を持ち込ませないため、全ての物を strict にする。
 */

const lessonId = z.string().regex(/^[a-z0-9]+\.[bia]\.\d+$/, 'レッスン ID は <分野>.<難易度>.<番号>');
const termId = z.string().regex(/^[a-z0-9-]+$/, '用語の ID は小文字の英数字とハイフン');

/** 本文。用語は {{term:ID}} で書く */
export const rich = z.string().min(1);

export const DOMAIN_IDS = ['found', 'linux', 'net', 'web', 'sec', 'git', 'cicd', 'ctr', 'docker', 'k8s', 'db', 'cloud', 'mon', 'devops', 'trouble', 'lab'] as const;
export const domainId = z.enum(DOMAIN_IDS);
export const level = z.enum(['beginner', 'intermediate', 'advanced']);
export const practiceMode = z.enum(['terminal', 'simulation', 'sql', 'editor']);

/* ---------- 分野（content/domains.json） ---------- */

export const domainSchema = z.object({
  id: domainId,
  name: z.string().min(1),
  facility: z.string().min(1),
  description: z.string().min(1),
  prerequisites: z.array(domainId),
  related: z.array(domainId),
  next: z.array(domainId),
}).strict();

/* ---------- 全レッスンの目録（content/catalog.json） ---------- */

export const catalogEntrySchema = z.object({
  id: lessonId,
  domain: domainId,
  level,
  theme: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  practice: z.array(practiceMode).min(1),
  prerequisites: z.array(lessonId),
  prerequisiteNote: z.string().optional(),
  related: z.array(lessonId),
  next: z.array(lessonId),
  uses: z.array(z.string()).optional(),
}).strict();

export const catalogSchema = z.object({
  note: z.string(),
  /** 推奨学習順の分野の並び（docs/curriculum.md 2 章） */
  domainOrder: z.array(domainId),
  /** 分野ごとのテーマ（docs/curriculum.md 4 章の「テーマ:」。無い分野は表の行から） */
  themes: z.record(domainId, z.array(z.string())),
  /** 推奨学習順に並べた全レッスン */
  lessons: z.array(catalogEntrySchema),
}).strict();

/* ---------- レッスン（content/lessons/<分野>/<ID>.json） ---------- */

const choice = z.object({ id: z.string().min(1), text: rich, correct: z.boolean(), whyNot: rich.optional() }).strict();

export const explainSchema = z.object({
  what: rich,
  why: rich,
  use: rich,
  when: rich,
  figures: z.array(z.string().min(1)).min(1),
  situation: rich.optional(),
}).strict();

const explainKey = z.enum(['what', 'why', 'use', 'when', 'situation']);
/** 理解の段で間違えた時に示す、解説の箇所（docs/content-spec.md 2.2「間違えたら、関係する解説の箇所を示す」）。無ければ解説の全体 */
const see = { see: explainKey.optional() };

export const understandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('figure-pick'), figure: z.string().min(1), prompt: rich, answer: z.array(z.string().min(1)).min(1), ...see }).strict(),
  z.object({ kind: z.literal('order'), prompt: rich, items: z.array(rich).min(2), ...see }).strict(),
  z.object({ kind: z.literal('situation'), prompt: rich, choices: z.array(choice).min(2), ...see }).strict(),
  z.object({ kind: z.literal('yesno'), prompt: rich, answer: z.boolean(), why: rich, ...see }).strict(),
  z.object({ kind: z.literal('match'), prompt: rich, pairs: z.array(z.tuple([rich, rich])).min(2), ...see }).strict(),
  z.object({
    kind: z.literal('relation'), prompt: rich, a: rich, b: rich,
    answer: z.enum(['contains', 'before', 'cause']), why: rich, ...see, // 包含・順序・原因と結果（docs/learning-design.md 4 章）
  }).strict(),
]);

export const quizSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['choice', 'multi', 'situation', 'cause', 'predict', 'term', 'order']),
  prompt: rich,
  context: z.object({ log: z.string().optional(), command: z.string().optional(), figure: z.string().optional() }).strict().optional(),
  choices: z.array(choice).optional(),
  order: z.array(rich).optional(),
  explanation: rich,
}).strict();

export const checkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fs'), path: z.string(), exists: z.boolean().optional(), contains: z.string().optional() }).strict(),
  z.object({ kind: z.literal('cwd'), equals: z.string() }).strict(),
  z.object({ kind: z.literal('service'), name: z.string(), active: z.boolean().optional(), enabled: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('git'), expr: z.string() }).strict(),
  z.object({ kind: z.literal('k8s'), expr: z.string() }).strict(),
  z.object({ kind: z.literal('net'), expr: z.string() }).strict(),
  z.object({ kind: z.literal('http'), url: z.string(), status: z.number().int() }).strict(),
  z.object({ kind: z.literal('tls'), host: z.string(), trusted: z.boolean() }).strict(),
  z.object({ kind: z.literal('sql'), query: z.string(), equals: z.unknown() }).strict(),
  z.object({ kind: z.literal('answer'), equals: z.string() }).strict(),
]);

export const practiceStepSchema = z.object({
  id: z.string().min(1),
  purpose: rich,
  check: checkSchema,
  afterward: rich,
  hints: z.tuple([rich, rich, rich]),
  expectedErrors: z.array(z.string().min(1)).optional(),
}).strict();

export const practiceSchema = z.object({
  mode: practiceMode,
  purpose: rich,
  environment: z.string().min(1),
  setup: z.unknown().optional(),
  steps: z.array(practiceStepSchema).min(1),
  /** 危ない手。pattern は打った行に当てる正規表現。使うと「失策」として記録し、成功はさせる */
  dangerous: z.array(z.object({ id: z.string().min(1), pattern: z.string().min(1), why: rich }).strict()).optional(),
}).strict();

export const lessonSchema = z.object({
  id: lessonId,
  domain: domainId,
  level,
  theme: z.string().min(1),
  title: z.string().min(1),
  goal: rich,
  minutes: z.number().int().min(10).max(20),
  prerequisites: z.array(lessonId),
  related: z.array(lessonId),
  next: z.array(lessonId),
  terms: z.array(termId),
  explain: explainSchema,
  understand: z.array(understandSchema).min(2),
  quiz: z.array(quizSchema).min(3).max(5),
  practice: practiceSchema,
  result: z.object({ success: rich, partial: rich, retry: rich }).strict(),
  summary: z.object({
    points: z.array(rich).min(1).max(3),
    next: z.array(lessonId),
    terms: z.array(termId),
  }).strict(),
}).strict();

/* ---------- 用語（content/glossary/<分野>.json） ---------- */

export const termSchema = z.object({
  id: termId,
  word: z.string().min(1),
  reading: z.string().optional(),
  plain: rich,
  why: rich,
  related: z.array(termId),
  lessons: z.array(lessonId),
  analogy: rich.optional(),
}).strict();

export const glossaryFileSchema = z.object({ domain: domainId, terms: z.array(termSchema) }).strict();

/* ---------- エラーの解説（content/errors/<分野>.json） ---------- */

export const errorGuideSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  match: z.string().min(1),
  meaning: rich,
  causes: z.array(rich).min(2).max(3),
  hint: rich,
  terms: z.array(termId).optional(),
}).strict();

export const errorFileSchema = z.object({ domain: domainId, errors: z.array(errorGuideSchema) }).strict();

/* ---------- ミッション（content/missions/<ID>.json） ---------- */

export const missionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  story: rich,
  domains: z.array(domainId).min(1),
  recommended: z.array(lessonId),
  practice: practiceSchema,
  rewards: z.object({ xp: z.number().int(), funds: z.number().int(), unlocks: z.array(z.string()).optional(), landmark: z.string().optional() }).strict(),
}).strict();

export type DomainId = z.infer<typeof domainId>;
export type Level = z.infer<typeof level>;
export type PracticeMode = z.infer<typeof practiceMode>;
export type Domain = z.infer<typeof domainSchema>;
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type Explain = z.infer<typeof explainSchema>;
export type UnderstandItem = z.infer<typeof understandSchema>;
export type QuizItem = z.infer<typeof quizSchema>;
export type Choice = z.infer<typeof choice>;
export type Practice = z.infer<typeof practiceSchema>;
export type PracticeStep = z.infer<typeof practiceStepSchema>;
export type CheckSpec = z.infer<typeof checkSchema>;
export type Term = z.infer<typeof termSchema>;
export type ErrorGuide = z.infer<typeof errorGuideSchema>;
export type Mission = z.infer<typeof missionSchema>;
