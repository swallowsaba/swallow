import type { CityState } from '@/content/city';
import { createCity, grant, isValidCity, type CitySave, type FacilityInfo } from '@/engines/city/sim';
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

/** シミュレーションに渡す、施設の学びと稼働の状況 */
export function facilityInfos(city: CityState): FacilityInfo[] {
  return city.facilities.map((f) => {
    const learned = f.state !== 'locked' && f.state !== 'available';
    return { id: f.facility.id, learned, ratio: learned ? f.ratio : 0 };
  });
}
