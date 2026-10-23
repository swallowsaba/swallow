import { z } from 'zod';
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
