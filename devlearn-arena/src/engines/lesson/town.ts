import type { LessonKindMeta, MissionTrack } from './types';

/**
 * トラックごとの「町」を、任務のクリア状況だけから組み立てる。
 *
 * 町は保存しない。クリアした任務の集合から毎回同じ町が導かれるので、
 * 保存データを増やさずに済み、やり直しや書き出し・読み込みでも町が壊れない。
 *
 * - 章 = 地区。推奨順に並べた任務を FLOORS_PER_BUILDING 本ずつまとめて 1 棟の建物にする
 * - 任務を 1 本終えるごとに、その建物が 1 階ずつ建つ。全部終えると完成
 * - 障害対応（boss）を含む建物は町の名所になる
 */

export const FLOORS_PER_BUILDING = 6;

/** 町に住む人の増え方 */
export const RESIDENTS = {
  /** 任務 1 本（建物 1 階）あたり */
  perFloor: 3,
  /** 建物が完成したときの上乗せ */
  perBuilding: 10,
  /** 名所が完成したときの上乗せ */
  perLandmark: 30,
} as const;

/** 町の格。人口がこの数に届くと上がる */
export const TOWN_RANKS = [
  { id: 'hamlet', population: 0 },
  { id: 'village', population: 30 },
  { id: 'town', population: 150 },
  { id: 'city', population: 600 },
  { id: 'metropolis', population: 2000 },
  { id: 'capital', population: 5000 },
] as const;

export type TownRankId = (typeof TOWN_RANKS)[number]['id'];

/** 町の組み立てに要る任務の情報。一覧の情報だけで足り、任務そのものは組み立てない */
export interface TownMissionInput {
  id: string;
  title: string;
  track: MissionTrack;
  chapterId: string;
  lessonKind: LessonKindMeta;
  order: number;
}

export type BuildingState = 'lot' | 'construction' | 'complete';

export interface TownFloor {
  id: string;
  title: string;
  kind: LessonKindMeta;
  cleared: boolean;
  /** 手を付けたがまだ終えていない */
  started: boolean;
}

export interface TownBuilding {
  id: string;
  /** 地区の中で何棟目か（0 始まり） */
  index: number;
  floors: TownFloor[];
  built: number;
  state: BuildingState;
  /** 障害対応を含む建物。町の名所になる */
  landmark: boolean;
  /** 推奨順で次にやる任務がこの建物にある */
  next: boolean;
}

export interface TownDistrict {
  chapterId: string;
  /** 地区の番号（1 始まり） */
  no: number;
  title: string;
  buildings: TownBuilding[];
  built: number;
  floors: number;
  /**
   * 開拓済みか。最初の地区と、手を付けた地区と、前の地区で 1 本でも終えたら開く。
   * 開いていなくても入れる（遊べなくはしない）。見た目で「次はここ」を示すためだけに使う。
   */
  opened: boolean;
}

export interface TownStats {
  population: number;
  rank: TownRankId;
  /** 次の格までに要る人口。最上位なら null */
  nextRankAt: number | null;
  /** いまの格になった人口 */
  rankFrom: number;
  completeBuildings: number;
  buildings: number;
  clearedFloors: number;
  floors: number;
  landmarks: number;
}

export interface Town {
  track: MissionTrack;
  districts: TownDistrict[];
  stats: TownStats;
  /** 推奨順で次にやる任務。全部終えていれば null */
  nextMissionId: string | null;
}

export function rankOf(population: number): { rank: TownRankId; from: number; next: number | null } {
  let index = 0;
  TOWN_RANKS.forEach((r, i) => {
    if (population >= r.population) index = i;
  });
  const current = TOWN_RANKS[index] ?? TOWN_RANKS[0];
  return { rank: current.id, from: current.population, next: TOWN_RANKS[index + 1]?.population ?? null };
}

export function buildTown(
  track: MissionTrack,
  missions: readonly TownMissionInput[],
  cleared: ReadonlySet<string>,
  started: ReadonlySet<string> = new Set(),
  chapterTitle: (chapterId: string) => string | undefined = () => undefined,
): Town {
  const mine = missions.filter((m) => m.track === track).sort((a, b) => a.order - b.order);
  const nextMissionId = mine.find((m) => !cleared.has(m.id))?.id ?? null;

  // 章は、その章の最初の任務が出てくる順に並べる
  const chapters: string[] = [];
  for (const m of mine) if (!chapters.includes(m.chapterId)) chapters.push(m.chapterId);

  let population = 0;
  let previousHasClear = true;
  const districts = chapters.map((chapterId, d): TownDistrict => {
    const list = mine.filter((m) => m.chapterId === chapterId);
    const buildings: TownBuilding[] = [];
    for (let i = 0; i < list.length; i += FLOORS_PER_BUILDING) {
      const floors = list.slice(i, i + FLOORS_PER_BUILDING).map((m) => ({
        id: m.id,
        title: m.title,
        kind: m.lessonKind,
        cleared: cleared.has(m.id),
        started: !cleared.has(m.id) && started.has(m.id),
      }));
      const built = floors.filter((f) => f.cleared).length;
      const state: BuildingState =
        built === floors.length ? 'complete' : built > 0 || floors.some((f) => f.started) ? 'construction' : 'lot';
      const landmark = floors.some((f) => f.kind === 'boss');
      population += built * RESIDENTS.perFloor;
      if (state === 'complete') population += landmark ? RESIDENTS.perLandmark : RESIDENTS.perBuilding;
      buildings.push({
        id: `${chapterId}#${String(buildings.length)}`,
        index: buildings.length,
        floors,
        built,
        state,
        landmark,
        next: nextMissionId !== null && floors.some((f) => f.id === nextMissionId),
      });
    }
    const built = buildings.reduce((n, b) => n + b.built, 0);
    const touched = buildings.some((b) => b.state !== 'lot');
    const opened = d === 0 || touched || previousHasClear;
    previousHasClear = built > 0;
    return {
      chapterId,
      no: d + 1,
      title: chapterTitle(chapterId) ?? chapterId,
      buildings,
      built,
      floors: list.length,
      opened,
    };
  });

  const all = districts.flatMap((d) => d.buildings);
  const { rank, from, next } = rankOf(population);
  return {
    track,
    districts,
    nextMissionId,
    stats: {
      population,
      rank,
      rankFrom: from,
      nextRankAt: next,
      completeBuildings: all.filter((b) => b.state === 'complete').length,
      buildings: all.length,
      clearedFloors: districts.reduce((n, d) => n + d.built, 0),
      floors: mine.length,
      landmarks: all.filter((b) => b.landmark && b.state === 'complete').length,
    },
  };
}

export interface TownGrowth {
  /** 任務を終えて建った建物 */
  buildingId: string;
  /** その建物が完成したか */
  completed: boolean;
  /** 何階まで建ったか / 全部で何階か */
  built: number;
  floors: number;
  populationGain: number;
  /** 格が上がったなら新しい格 */
  rankUp: TownRankId | null;
}

/** 任務を 1 本終えたとき、町がどう育ったか。祝いの画面で見せる */
export function growthOf(before: Town, after: Town, missionId: string): TownGrowth | null {
  const building = after.districts.flatMap((d) => d.buildings).find((b) => b.floors.some((f) => f.id === missionId));
  if (!building) return null;
  const prev = before.districts.flatMap((d) => d.buildings).find((b) => b.id === building.id);
  return {
    buildingId: building.id,
    completed: building.state === 'complete' && prev?.state !== 'complete',
    built: building.built,
    floors: building.floors.length,
    populationGain: after.stats.population - before.stats.population,
    rankUp: after.stats.rank === before.stats.rank ? null : after.stats.rank,
  };
}
