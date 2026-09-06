import { gitTrack } from './tracks/git';
import { githubTrack } from './tracks/github';
import { k8sTrack } from './tracks/k8s';
import { netTrack } from './tracks/net';
import type { Chapter, LessonMeta, Track, TrackId } from './types';

/** 目次は最初から全カリキュラム分ある。実装済みかどうかは lesson.status で示す。 */
export const TRACKS: readonly Track[] = [k8sTrack, netTrack, gitTrack, githubTrack];

const trackById = new Map<TrackId, Track>(TRACKS.map((t) => [t.id, t]));
const chapterById = new Map<string, Chapter>();
const lessonById = new Map<string, LessonMeta>();

for (const track of TRACKS) {
  for (const ch of track.chapters) {
    chapterById.set(ch.id, ch);
    for (const lesson of ch.lessons) lessonById.set(lesson.id, lesson);
  }
}

export function getTrack(id: string): Track | undefined {
  return trackById.get(id as TrackId);
}

export function getChapter(id: string): Chapter | undefined {
  return chapterById.get(id);
}

export function getLesson(id: string): LessonMeta | undefined {
  return lessonById.get(id);
}

export function allLessons(): LessonMeta[] {
  return [...lessonById.values()];
}

export function chapterLessons(chapterId: string): LessonMeta[] {
  return chapterById.get(chapterId)?.lessons ?? [];
}

export interface CatalogCounts {
  lessons: number;
  bosses: number;
  ready: number;
  minutes: number;
}

export function countTrack(track: Track): CatalogCounts {
  const lessons = track.chapters.flatMap((c) => c.lessons);
  return {
    lessons: lessons.length,
    bosses: lessons.filter((l) => l.kind === 'boss').length,
    ready: lessons.filter((l) => l.status === 'ready').length,
    minutes: lessons.reduce((sum, l) => sum + l.minutes, 0),
  };
}

export function countAll(): CatalogCounts {
  return TRACKS.map(countTrack).reduce(
    (a, b) => ({
      lessons: a.lessons + b.lessons,
      bosses: a.bosses + b.bosses,
      ready: a.ready + b.ready,
      minutes: a.minutes + b.minutes,
    }),
    { lessons: 0, bosses: 0, ready: 0, minutes: 0 },
  );
}
