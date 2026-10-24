import { z } from 'zod';
import explainData from '../../content/politics/explain.json';
import namesData from '../../content/politics/names.json';

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
const MEMBER_KEYS = ['gain', 'concern', 'unanswered', 'explained', 'wrong', 'pushed', 'approval', 'persuaded', 'stance'] as const;
const text = z.string().min(1);
const recordOf = <K extends string>(keys: readonly K[]) => z.object(Object.fromEntries(keys.map((k) => [k, text])) as Record<K, typeof text>).strict();

export const explainSchema = z.object({
  approval: z.object({ up: text, down: text, flat: text }).strict(),
  layer: text,
  causes: recordOf(CAUSE_KINDS),
  factors: recordOf(FACTOR_IDS),
  member: recordOf(MEMBER_KEYS),
}).strict();
export type ExplainTemplates = z.infer<typeof explainSchema>;

export const EXPLAIN: ExplainTemplates = explainSchema.parse(explainData);
