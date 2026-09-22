import type { BuildingKind, Building, Occupant } from './model';

/**
 * 街の画風。色は必ずここから引く。
 *
 * 決めごとは 3 つだけ。
 * - 輪郭線はどこでも同じ太さ（`OUTLINE_WIDTH`）
 * - 影は右下に 1 段だけ（`SHADOW_STEP`）
 * - 角は丸めない
 *
 * 手描き風・絵文字・写実のどれとも混ぜない。
 */

/** タイル 1 つの大きさ（px） */
export const TILE = 14;

/** 輪郭線の太さ。太さを変えるのはここだけ */
export const OUTLINE_WIDTH = 1;

/** 影の段。右下へこれだけずらす（px） */
export const SHADOW_STEP = 2;

export const INK = '#2f3440';
export const SHADOW = 'rgba(47,52,64,0.24)';

/** 地面 */
export const GROUND: Record<'grass' | 'road' | 'plot' | 'water', string> = {
  grass: '#dde3cd',
  road: '#c5c4bb',
  plot: '#ece5d2',
  water: '#b6d2dd',
};

/** 建物の地色。種類ごとに決まっていて、状態では変えない */
export const BUILDING: Record<BuildingKind, string> = {
  tower: '#93a9c6',
  office: '#c9a273',
  stop: '#7fb5a2',
  monument: '#bab4a6',
  flag: '#cf6f5c',
  depot: '#c3ac7c',
  hut: '#d9c59b',
  house: '#cfa98d',
  relay: '#9e94c3',
  gate: '#90a08d',
  window: '#b3a1c7',
  line: '#a0b0bd',
};

/** 状態は輪郭と印で示す。地色は変えない（同じ種類の建物は同じ色に見える） */
export const STATE: Record<Building['state'], string> = {
  building: '#d9a441',
  normal: INK,
  busy: '#d9a441',
  broken: '#cf5946',
};

/** 住人。色だけで状態が分かるようにする */
export const OCCUPANT: Record<Occupant['state'], string> = {
  moving: '#d9a441',
  settled: '#5c9f6b',
  sick: '#cf5946',
  gone: '#9aa0a6',
};

/** 道の帯。使われている道は明るく、切れている道は赤く途切れる */
export const ROAD = {
  active: '#8d8b82',
  idle: '#bcbab1',
  broken: '#cf5946',
};

/** まだ開いていない区域。暗く沈め、輪郭だけ見せる */
export const LOCKED = {
  fill: 'rgba(47,52,64,0.72)',
  edge: 'rgba(233,236,242,0.35)',
  text: 'rgba(233,236,242,0.6)',
};

/** 荷車（パケット） */
export const CART = { body: '#e0b552', edge: INK };

/** 文字 */
export const LABEL = { fill: INK, size: 7 };
