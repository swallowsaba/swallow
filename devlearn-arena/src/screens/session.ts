import { createCityStore, type CityStore } from './city/cityStore';
import { createProgressStore, type ProgressStore } from './progressStore';

/**
 * 遊んでいる間の状態（都市と学習の記録）。全ての画面が同じものを読む。
 * 学習で得た開発資金は都市の資金に入る（docs/game-design.md 2 章）。
 */
export interface Session {
  city: CityStore;
  progress: ProgressStore;
}

export function createSession(seed?: number): Session {
  const city = createCityStore(seed);
  const progress = createProgressStore((amount) => {
    const c = city.getState().city;
    city.getState().setCity({ ...c, funds: c.funds + amount });
  });
  return { city, progress };
}
