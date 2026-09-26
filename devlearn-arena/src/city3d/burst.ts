/**
 * 街が育った所（REWORK 2-1）。`key` が変わるたびに、輪と札を出し直す。
 *
 * CityScene は重いので動的にしか読まない。外から渡す形はここに置く。
 */
export interface GrowthBurst {
  key: number;
  building: string;
  /** 浮かぶ札の字（「＋家 1」「＋1 階」） */
  gain: string;
}
