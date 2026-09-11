import type { DocRef } from '@/content/types';
import { chapterOf } from './ids';
import { missions as curated } from './missions';
import { drillSources } from './drills';
import type { MissionSource } from './authoring/mission';
import type { LessonDefinition, LessonIntro, LessonKindMeta, MissionKind, MissionTrack } from './types';

/**
 * 一覧に出すための情報。
 * 実際の初期状態や判定は `build()` を呼ぶまで作らない。
 * 任務の数が増えても、開いたぶんしか組み立てないようにするため。
 */
export interface MissionEntry {
  id: string;
  title: string;
  /** 課題の前に読む説明。一覧を作るだけでも引けるよう、組み立てずに持つ */
  intro: LessonIntro;
  track: MissionTrack;
  chapterId: string;
  kind: MissionKind;
  lessonKind: LessonKindMeta;
  minutes: number;
  stepCount: number;
  docs: readonly DocRef[];
  build: () => LessonDefinition;
}

function fromSource(source: MissionSource): MissionEntry {
  return {
    id: source.id,
    title: source.title,
    intro: source.intro,
    track: source.track,
    chapterId: source.chapterId,
    kind: source.kind,
    lessonKind: source.lessonKind,
    minutes: source.minutes,
    stepCount: source.stepCount,
    docs: source.docs,
    build: source.build,
  };
}

/** 先に書いた任務は LessonDefinition のまま持っているので、包んで揃える */
function fromDefinition(definition: LessonDefinition): MissionEntry {
  return {
    id: definition.id,
    title: definition.title,
    intro: definition.intro,
    track: definition.track,
    chapterId: chapterOf(definition.id),
    kind: definition.kind,
    lessonKind: definition.kind === 'boss' ? 'boss' : 'drill',
    minutes: Math.max(4, definition.steps.length * 3),
    stepCount: definition.steps.length,
    docs: [],
    build: () => definition,
  };
}

let cache: MissionEntry[] | null = null;

export function allMissions(): readonly MissionEntry[] {
  if (cache === null) {
    const entries = [...curated.map(fromDefinition), ...drillSources().map(fromSource)];
    const seen = new Set<string>();
    cache = entries.filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
  }
  return cache;
}

export function missionById(id: string): MissionEntry | undefined {
  return allMissions().find((m) => m.id === id);
}

export function missionsOfChapter(chapterId: string): readonly MissionEntry[] {
  return allMissions().filter((m) => m.chapterId === chapterId);
}

export function missionsOfTrack(track: MissionTrack): readonly MissionEntry[] {
  return allMissions().filter((m) => m.track === track);
}

/** 目次が `ready` を判定するのに使う */
export function implementedIds(): ReadonlySet<string> {
  return new Set(allMissions().map((m) => m.id));
}
