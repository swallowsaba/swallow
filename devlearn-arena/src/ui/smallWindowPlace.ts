/** 小さな窓（docs/ui-design.md 10.0）の幅と置き場所。窓と、窓を避けて置く物（知らせ）の両方が使う */
export const SMALL_WINDOW_WIDTH = 400;

/** 窓の右端から画面の右端までの距離（重ねた順でずらす。情報パネルがある時は、その左） */
export function smallWindowRight(stack: number, shifted: boolean): number {
  return 14 + (shifted ? 360 + 14 : 0) + stack * 28;
}
