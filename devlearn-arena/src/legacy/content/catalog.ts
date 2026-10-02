import { allMissions } from '@/engines/lesson/registry';
import { gitTrack } from './tracks/git';
import { githubTrack } from './tracks/github';
import { k8sTrack } from './tracks/k8s';
import { kernelTrack } from './tracks/kernel';
import { netTrack } from './tracks/net';
import type { Chapter, LessonMeta, Track, TrackId } from './types';

/**
 * 目次は最初から全カリキュラム分ある。
 * 遊べるかどうか（status）と、章に並ぶ演習は、実装された任務から刻む。
 * 目次側に手で印を付けると必ず実装とずれるため、ここで一度だけ突き合わせる。
 */
export const TRACKS: readonly Track[] = [kernelTrack, k8sTrack, netTrack, gitTrack, githubTrack];

const trackById = new Map<TrackId, Track>(TRACKS.map((t) => [t.id, t]));
const chapterById = new Map<string, Chapter>();
const lessonById = new Map<string, LessonMeta>();

for (const track of TRACKS) {
  for (const ch of track.chapters) {
    chapterById.set(ch.id, ch);
  }
}

/** 目次に元から書いてあったレッスンの id。演習を足す前に控えておく */
const CORE = new Set(
  [...chapterById.values()].flatMap((c) => c.lessons).map((l) => l.id),
);

// 1. 目次に元から書いてあるレッスンに、任務の有無で印を付ける
const missions = allMissions();
const byId = new Map(missions.map((m) => [m.id, m]));

for (const chapter of chapterById.values()) {
  for (const lesson of chapter.lessons) {
    lesson.status = byId.has(lesson.id) ? 'ready' : 'planned';
    lessonById.set(lesson.id, lesson);
  }
}

// 2. 目次に無い任務は、その章の演習として並べる
for (const mission of missions) {
  if (lessonById.has(mission.id)) continue;
  const chapter = chapterById.get(mission.chapterId);
  if (!chapter) continue;
  const lesson: LessonMeta = {
    id: mission.id,
    trackId: chapter.trackId,
    chapterId: chapter.id,
    slug: mission.id.slice(chapter.id.length + 1),
    title: mission.title,
    kind: mission.lessonKind,
    status: 'ready',
    minutes: mission.minutes,
    docs: [...mission.docs],
  };
  chapter.lessons.push(lesson);
  lessonById.set(lesson.id, lesson);
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

/** 章の「本編」（目次に元から書いてあるもの）だけを返す */
export function chapterCoreLessons(chapterId: string): LessonMeta[] {
  return (chapterById.get(chapterId)?.lessons ?? []).filter((l) => CORE.has(l.id));
}

/** 章に足された反復演習（本編以外）を返す */
export function chapterDrills(chapterId: string): LessonMeta[] {
  return (chapterById.get(chapterId)?.lessons ?? []).filter((l) => !CORE.has(l.id));
}

export function isCoreLesson(id: string): boolean {
  return CORE.has(id);
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
