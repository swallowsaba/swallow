import { getChapter } from '@/content/catalog';
import { allMissions } from '@/engines/lesson/registry';
import { buildTown, type Town, type TownDistrict, type TownRankId } from '@/engines/lesson/town';
import type { MissionTrack } from '@/engines/lesson/types';
import type { Translate } from '@/i18n/useT';
import type { MissionProgress } from '@/lib/storage/schema';

/** 町の名前。世界ごとの名前に、人口で決まる格が付く（例: コマンド村 → コマンド町） */
export function townName(t: Translate, track: MissionTrack, rank: TownRankId): string {
  return `${t(`town.base.${track}`)}${t(`town.rank.${rank}`)}`;
}

/** 建物の名前。地区の番号と、その地区で何号棟か */
export function buildingName(t: Translate, track: MissionTrack, district: TownDistrict, index: number, landmark: boolean): string {
  return t('town.buildingName', {
    no: district.no,
    n: index + 1,
    kind: t(landmark ? 'town.kind.landmark' : `town.kind.${track}`),
  });
}

/** 保存データのクリア状況と手を付けた任務から、その世界の町を組み立てる */
export function townOf(
  track: MissionTrack,
  lessons: Readonly<Record<string, { cleared: boolean }>>,
  missionProgress: Readonly<Record<string, MissionProgress>> = {},
  extraCleared: readonly string[] = [],
): Town {
  const cleared = new Set([
    ...Object.entries(lessons)
      .filter(([, p]) => p.cleared)
      .map(([id]) => id),
    ...extraCleared,
  ]);
  const started = new Set(
    Object.entries(missionProgress)
      .filter(([, p]) => p.stepIndex > 0 || p.commandsUsed > 0)
      .map(([id]) => id),
  );
  return buildTown(track, allMissions(), cleared, started, (id) => getChapter(id)?.title);
}
