import type { CityState } from '@/content/city';
import { advanceDays, autoPlace, populationOf, unrestOf, voicesOf, type CityVoice } from '@/engines/city/civic';
import { createCity, grant, isValidCity, terrainOf, type CitySave, type FacilityInfo } from '@/engines/city/sim';
import type { MissionTrack } from '@/engines/lesson/types';
import { useStore } from '@/store';

/** 保存されている街。無い・壊れていれば新しい街 */
export function citySaveOf(track: MissionTrack): CitySave {
  const saved = useStore.getState().cities[track];
  return saved !== undefined && isValidCity(saved) ? saved : createCity();
}

/**
 * 学び（理解度）とコマンドの報酬を、そのカテゴリの街の予算に入れる。
 * 同じキーは一度だけ。新しく受け取ったときだけ true。
 */
export function rewardCity(track: MissionTrack, key: string, amount: number): boolean {
  const before = citySaveOf(track);
  const after = grant(before, key, amount);
  if (after === before) return false;
  useStore.getState().setCity(track, after);
  return true;
}

/** 出来事で街の時間を進める */
export function boostCity(track: MissionTrack, city: CityState, days: number): void {
  const infos = facilityInfos(city);
  const save = citySaveOf(track);
  const terrain = terrainOf(track);
  const voices = voicesOf(civicFacilities(city), populationOf(save, terrain, infos), save.day);
  useStore.getState().setCity(track, advanceDays(save, terrain, infos, days, unrestOf(voices)));
}

/** 建設を決めた施設を、地図に仮置きする。置けたら true */
export function placeFacility(track: MissionTrack, city: CityState, facilityId: string): boolean {
  const infos = facilityInfos(city).map((f) => (f.id === facilityId ? { ...f, learned: true } : f));
  const before = citySaveOf(track);
  const after = autoPlace(before, terrainOf(track), infos, facilityId);
  if (after === before) return false;
  useStore.getState().setCity(track, after);
  return true;
}

/** シミュレーションに渡す、施設の学びと稼働の状況 */
export function facilityInfos(city: CityState): FacilityInfo[] {
  return city.facilities.map((f) => {
    const learned = f.state !== 'locked' && f.state !== 'available';
    return { id: f.facility.id, learned, ratio: learned ? f.ratio : 0 };
  });
}

export function civicFacilities(city: CityState): { id: string; state: string; ratio: number }[] {
  return city.facilities.map((f) => ({ id: f.facility.id, state: f.state, ratio: f.ratio }));
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

export type { CityVoice };
