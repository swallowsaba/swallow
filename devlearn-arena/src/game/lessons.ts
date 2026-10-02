import type { DomainId } from '@/city/types';
import list from '../../content/lesson-list.json';
import type { Difficulty, LessonMeta } from './types';

/**
 * 全レッスンの ID と題名（content/lesson-list.json。Phase 5 で目録に置き換える）。
 * 分野と難易度は ID（<分野>.<難易度>.<番号>、docs/curriculum.md）から読む。
 */

const ID = /^([a-z0-9]+)\.([bia])\.\d+$/;

export function metaOf(id: string, title = id): LessonMeta | null {
  const m = ID.exec(id);
  if (!m) return null;
  return { id, domain: m[1] as DomainId, difficulty: m[2] as Difficulty, title };
}

export const LESSONS: readonly LessonMeta[] = list.lessons.map((l) => {
  const meta = metaOf(l.id, l.title);
  if (!meta) throw new Error(`レッスン ID の形が違う: ${l.id}`);
  return meta;
});

const BY_ID = new Map(LESSONS.map((l) => [l.id, l]));

export function lessonMeta(id: string, catalog: readonly LessonMeta[] = LESSONS): LessonMeta | null {
  return (catalog === LESSONS ? BY_ID.get(id) : catalog.find((l) => l.id === id)) ?? metaOf(id);
}

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { b: '初級', i: '中級', a: '上級' };
