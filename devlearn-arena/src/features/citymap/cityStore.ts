import type { CityState } from '@/content/city';
import { voicesOf, type CityVoice } from '@/engines/city/civic';
import type { MissionTrack } from '@/engines/lesson/types';
import { useStore } from '@/store';
import type { CivicView, TownGrowth } from './isoScene';

/** その街の育ち（理解度の正解＝家、コマンドの手順＝階） */
export function growthOf(growth: Record<string, { houses: number; floors: number }>, track: MissionTrack): TownGrowth {
  return growth[track] ?? { houses: 0, floors: 0 };
}

/** 街を育てる。理解度の正解で家が増え、コマンドの手順で階が積み上がる */
export function growCity(track: MissionTrack, kind: 'houses' | 'floors', n = 1): void {
  useStore.getState().grow(track, kind, n);
}

export function civicFacilities(city: CityState): { id: string; state: string; missionsCleared: number }[] {
  return city.facilities.map((f) => ({ id: f.facility.id, state: f.state, missionsCleared: Math.floor(f.missionsCleared) }));
}

/** いま取り組んでいる任務の手順の進み（0..1）を、その施設の稼働に足した街 */
export function withPartial(city: CityState, partial: { facilityId: string; fraction: number } | null): CityState {
  if (partial === null || partial.fraction <= 0) return city;
  return {
    ...city,
    facilities: city.facilities.map((f) => {
      if (f.facility.id !== partial.facilityId || f.state === 'locked' || f.state === 'available' || f.missionsTotal === 0) return f;
      const cleared = Math.min(f.missionsTotal, f.missionsCleared + partial.fraction);
      return { ...f, missionsCleared: cleared, ratio: cleared / f.missionsTotal, state: f.state === 'built' ? 'operating' : f.state };
    }),
  };
}

/** 地図の上の通りに並べる市民施設 */
export function civicViews(city: CityState, learned: CityState, currentId: string | null): CivicView[] {
  const voices: CityVoice[] = voicesOf(civicFacilities(learned));
  return city.facilities.map((f) => {
    const voice = voices.find((v) => v.facilityId === f.facility.id);
    const isLearned = f.state !== 'locked' && f.state !== 'available';
    return {
      id: f.facility.id,
      name: f.facility.name,
      kind: f.facility.building,
      ratio: isLearned ? f.ratio : 0,
      // 最初の任務を終えると建物ができあがる。手順を進めるたびに背が伸びる
      build: isLearned ? Math.min(1, f.missionsCleared) : 0,
      learned: isLearned,
      voice: voice?.kind ?? null,
      current: f.facility.id === currentId,
    };
  });
}
