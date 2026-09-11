import type { DocRef } from '@/content/types';
import { chapterOf } from './ids';
import { missions as curated } from './missions';
import { drillSources } from './drills';
import type { MissionSource } from './authoring/mission';
import { assignOrder, assignRequires } from './order';
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
  /** 推奨順。小さいほど先。地図でも学習画面でもこの順に並べる */
  order: number;
  /** 先にやっておくとよい任務。遊べなくはしない */
  requires: readonly string[];
  /** 目次に元から書いてある、読んで手を動かす任務か（演習ではないもの） */
  curated: boolean;
  build: () => LessonDefinition;
}

type Unordered = Omit<MissionEntry, 'order' | 'requires'>;

function fromSource(source: MissionSource): Unordered {
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
    curated: false,
    build: source.build,
  };
}

/** 先に書いた任務は LessonDefinition のまま持っているので、包んで揃える */
function fromDefinition(definition: LessonDefinition): Unordered {
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
    curated: true,
    build: () => definition,
  };
}

let cache: MissionEntry[] | null = null;

export function allMissions(): readonly MissionEntry[] {
  if (cache === null) {
    const entries = [...curated.map(fromDefinition), ...drillSources().map(fromSource)];
    const seen = new Set<string>();
    const unique = entries.filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
    const order = assignOrder(unique);
    const requires = assignRequires(unique, order);
    cache = unique
      .map((entry) => ({ ...entry, order: order.get(entry.id) ?? 0, requires: requires.get(entry.id) ?? [] }))
      .sort((a, b) => a.order - b.order);
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

/**
 * まだ終えていない前提の任務。「先に〇〇をやりましょう」と出すのに使う。
 * 遊べなくはしないので、ここで返ったものがあっても開ける。
 */
export function missingPrerequisites(id: string, cleared: ReadonlySet<string>): MissionEntry[] {
  const entry = missionById(id);
  if (!entry) return [];
  return entry.requires
    .filter((req) => !cleared.has(req))
    .map((req) => missionById(req))
    .filter((m): m is MissionEntry => m !== undefined);
}

/** まだ終えていない任務のうち、推奨順で最初のもの */
export function recommendedNext(cleared: ReadonlySet<string>, exceptId?: string): MissionEntry | null {
  return allMissions().find((m) => m.id !== exceptId && !cleared.has(m.id)) ?? null;
}

/** 目次が `ready` を判定するのに使う */
export function implementedIds(): ReadonlySet<string> {
  return new Set(allMissions().map((m) => m.id));
}
