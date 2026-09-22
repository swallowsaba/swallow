import type { CityState } from '@/content/city';
import type { MissionTrack } from '@/engines/lesson/types';
import { useStore } from '@/store';

/** その街の育ち（理解度の正解＝家、コマンドの手順＝階） */
export interface TownGrowth {
  houses: number;
  floors: number;
}

export function growthOf(growth: Record<string, TownGrowth>, track: MissionTrack): TownGrowth {
  return growth[track] ?? { houses: 0, floors: 0 };
}

/** 街を育てる。理解度の正解で家が増え、コマンドの手順で階が積み上がる */
export function growCity(track: MissionTrack, kind: 'houses' | 'floors', n = 1): void {
  useStore.getState().grow(track, kind, n);
}

export function civicFacilities(city: CityState): { id: string; state: string; missionsCleared: number }[] {
  return city.facilities.map((f) => ({ id: f.facility.id, state: f.state, missionsCleared: Math.floor(f.missionsCleared) }));
}
