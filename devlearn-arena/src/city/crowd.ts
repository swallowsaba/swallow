import type { Point } from './types';

/**
 * 反対する集団の人の影（docs/city-design.md 9.1）。反対の受付・公聴会・異議申し立ての間、囲いの前（道路の側）に立つ。
 * 人数は反対率に応じて 0〜6 人。手に札を持ち、札の色は反対率が 20% を超えると警告の黄、50% を超えると赤。顔は描かない
 */

export const CROWD_MAX = 6;

/** 人数（反対率 0% で 0 人。100 ÷ 6 ごとに 1 人増え、6 人まで） */
export function crowdCount(opposition: number): number {
  if (!(opposition > 0)) return 0;
  return Math.min(CROWD_MAX, Math.ceil((opposition * CROWD_MAX) / 100));
}

export type PlacardTone = 'calm' | 'warn' | 'bad';

export function placardTone(opposition: number): PlacardTone {
  return opposition > 50 ? 'bad' : opposition > 20 ? 'warn' : 'calm';
}

/** 人の影が立つ敷地（回す前の origin と大きさ・向き。向きは施設の入口の側） */
export interface CrowdSite {
  origin: Point;
  w: number;
  d: number;
  rotation: 0 | 90 | 180 | 270;
}

/** 囲いから道路の側へ離れる距離（マス） */
const OUTSIDE = 0.3;

/**
 * 人の影の立つ所（世界の座標）。入口の側の縁の外に、縁の長さを等分して並べる。
 * 同じ敷地と人数からは、いつも同じ所になる
 */
export function crowdSpots(site: CrowdSite, count: number): Point[] {
  if (count <= 0) return [];
  const turned = site.rotation === 90 || site.rotation === 270;
  const W = turned ? site.d : site.w;
  const D = turned ? site.w : site.d;
  const { x, y } = site.origin;
  const along = (i: number, len: number): number => ((i + 1) * len) / (count + 1);
  return Array.from({ length: count }, (_, i): Point => {
    switch (site.rotation) {
      case 0: return { x: x + along(i, W), y: y + D + OUTSIDE };
      case 180: return { x: x + along(i, W), y: y - OUTSIDE };
      case 90: return { x: x - OUTSIDE, y: y + along(i, D) };
      case 270: return { x: x + W + OUTSIDE, y: y + along(i, D) };
    }
  });
}

/** 遠く（この拡大率より小さい）では人の影を間引き、看板だけを残す */
export const CROWD_MIN_ZOOM = 0.8;
