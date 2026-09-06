import type { Chapter, DocRef, LessonKind, LessonMeta, TrackId } from './types';

/** [slug, title, kind, minutes, docs?] */
export type LessonSeed = [string, string, LessonKind, number, DocRef[]?];

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function chapter(
  trackId: TrackId,
  no: number,
  title: string,
  summary: string,
  defaultDocs: DocRef[],
  seeds: LessonSeed[],
): Chapter {
  const chapterId = `${trackId}/${pad2(no)}`;
  const lessons: LessonMeta[] = seeds.map(([slug, lessonTitle, kind, minutes, docs]) => ({
    id: `${chapterId}/${slug}`,
    trackId,
    chapterId,
    slug,
    title: lessonTitle,
    kind,
    status: 'planned',
    minutes,
    docs: docs ?? defaultDocs,
  }));
  return { id: chapterId, trackId, no, title, summary, lessons };
}

export function doc(label: string, url: string): DocRef {
  return { label, url };
}
