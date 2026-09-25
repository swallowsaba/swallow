import { BoxGeometry, CylinderGeometry, type BufferGeometry } from 'three';
import { CAR_COLORS, type SurfaceName } from './palette';

/**
 * 車（REWORK 7-1）。箱 1 つで済ませない。
 *
 * 車体・運転席（窓付き）・屋根・タイヤ 4 つ・前照灯 2 つ・尾灯 2 つ。
 * 前は +z の向き。部品の位置は形に焼き込むので、どの部品も同じ行列で動かせる。
 * 車体と屋根の色は 1 台ずつ `CAR_COLORS` から掛ける。
 */

export interface CarPart {
  name: string;
  surface: SurfaceName;
  shape: 'box' | 'wheel';
  /** 幅・高さ・奥行き（メートル）。タイヤは [直径, 幅, 直径] */
  size: readonly [number, number, number];
  /** 車の中心の真下からの位置 */
  at: readonly [number, number, number];
  /** 1 台ずつ違う色を塗る部品か */
  painted: boolean;
}

const WHEEL = 0.72;
const TRACK = 0.9;
const AXLE = 1.35;

export const CAR_PARTS: readonly CarPart[] = [
  { name: 'body', surface: 'carPaint', shape: 'box', size: [1.9, 0.62, 4.3], at: [0, 0.66, 0], painted: true },
  { name: 'cabin', surface: 'carGlass', shape: 'box', size: [1.66, 0.6, 2.2], at: [0, 1.27, -0.25], painted: false },
  { name: 'roof', surface: 'carPaint', shape: 'box', size: [1.7, 0.1, 1.9], at: [0, 1.62, -0.3], painted: true },
  ...([
    ['wheel-front-left', TRACK, AXLE],
    ['wheel-front-right', -TRACK, AXLE],
    ['wheel-rear-left', TRACK, -AXLE],
    ['wheel-rear-right', -TRACK, -AXLE],
  ] as const).map(([name, x, z]): CarPart => ({
    name,
    surface: 'tire',
    shape: 'wheel',
    size: [WHEEL, 0.34, WHEEL],
    at: [x, WHEEL / 2, z],
    painted: false,
  })),
  { name: 'headlight-left', surface: 'headlight', shape: 'box', size: [0.42, 0.18, 0.06], at: [0.62, 0.78, 2.16], painted: false },
  { name: 'headlight-right', surface: 'headlight', shape: 'box', size: [0.42, 0.18, 0.06], at: [-0.62, 0.78, 2.16], painted: false },
  { name: 'taillight-left', surface: 'taillight', shape: 'box', size: [0.36, 0.14, 0.06], at: [0.66, 0.8, -2.16], painted: false },
  { name: 'taillight-right', surface: 'taillight', shape: 'box', size: [0.36, 0.14, 0.06], at: [-0.66, 0.8, -2.16], painted: false },
];

/** 部品 1 つぶんの形 */
export function carPartGeometry(part: CarPart): BufferGeometry {
  const [w, h, d] = part.size;
  const [x, y, z] = part.at;
  if (part.shape === 'wheel') {
    // 円柱を横に倒して、車軸の向き（x）に回るタイヤにする
    const geometry = new CylinderGeometry(w / 2, w / 2, h, 12);
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(x, y, z);
    return geometry;
  }
  const geometry = new BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  return geometry;
}

/** その車の色。置き場所を決めるときに振った番号から選ぶ */
export function carColor(tint: number): string {
  const index = ((Math.floor(tint) % CAR_COLORS.length) + CAR_COLORS.length) % CAR_COLORS.length;
  return CAR_COLORS[index] ?? CAR_COLORS[0];
}
