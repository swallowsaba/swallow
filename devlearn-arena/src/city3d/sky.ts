import { LIGHT, SKY } from './palette';
import type { Vec2 } from './model';
import { pointAt, type PropPath } from './props';

/**
 * 光とカメラ。時間帯から太陽の向きと明るさを出す。
 *
 * 決まり（DESIGN.md §2 と §3）。
 * - カメラは水平から 35 度の固定角。視野角 45。回転は水平方向のみ
 * - 太陽は `DirectionalLight` 1 つ。空の色を回り込ませる間接光を足す
 * - 夜は窓が光る
 * - 注目点へ寄るときは 0.6 秒で補間する
 *
 * ここは three に触れない純粋な計算。使うのは `CityScene.tsx`。
 */

/** カメラの伏せ角（水平から 35 度） */
export const CAMERA_PITCH = (35 * Math.PI) / 180;

/** `OrbitControls` に渡す極角。ここを固定して真下や真横を向かせない */
export const POLAR_ANGLE = Math.PI / 2 - CAMERA_PITCH;

/** 視野角 */
export const CAMERA_FOV = 45;

/** 注目点へ寄るのにかける時間（秒） */
export const FOCUS_SECONDS = 0.6;

/** 時間帯。0 と 1 が真夜中、0.25 が朝、0.5 が正午、0.75 が夕方 */
export const NOON = 0.5;

export interface SunState {
  /** 太陽の位置（メートル） */
  position: [number, number, number];
  color: string;
  intensity: number;
  /** 夜の深さ 0..1。窓の灯りの強さに使う */
  night: number;
  /** 空からの回り込み（間接光）の強さ */
  ambient: number;
  /** 空と fog の色の濃さ 0..1。夜は暗く沈む */
  daylight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 時間帯から太陽の様子を出す。
 * 高さは正午にいちばん高く、真夜中には地面の下へ回る。
 */
export function sunAt(time: number, radius: number): SunState {
  const turn = (((time % 1) + 1) % 1) * Math.PI * 2;
  // 0.25（朝）で地平、0.5（正午）で真上
  const elevation = Math.sin(turn - Math.PI / 2);
  const azimuth = turn;
  const height = Math.max(0.06, elevation) * radius;
  const daylight = clamp(elevation * 1.6 + 0.35, 0, 1);
  return {
    position: [Math.cos(azimuth) * radius * 0.8, height, Math.sin(azimuth) * radius * 0.6],
    // 低い太陽は赤みがかる
    color: elevation < 0.25 ? LIGHT.sunset : LIGHT.sun,
    intensity: clamp(elevation * 2.4, 0, 2.1),
    night: clamp(-elevation * 2 + 0.25, 0, 1),
    ambient: 0.25 + daylight * 0.45,
    daylight,
  };
}

/** 夜に灯るものの強さ */
export function glowStrength(time: number): number {
  return sunAt(time, 1).night * 1.8;
}

/** fog の掛かり方。遠景を薄く沈ませる */
export function fogRange(size: { w: number; d: number }): [number, number] {
  const span = Math.max(size.w, size.d);
  return [Math.max(SKY.fogNear, span * 0.35), Math.max(SKY.fogFar, span * 1.35)];
}

/** 街全体が入るカメラの距離 */
export function fitDistance(size: { w: number; d: number }): number {
  const span = Math.max(size.w, size.d * 1.4);
  return span / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360));
}

/** 伏せ角を保ったカメラの位置。水平の向き（azimuth）だけを変えられる */
export function cameraPosition(target: Vec2, distance: number, azimuth: number): [number, number, number] {
  const flat = Math.cos(CAMERA_PITCH) * distance;
  return [target.x + Math.sin(azimuth) * flat, Math.sin(CAMERA_PITCH) * distance, target.z + Math.cos(azimuth) * flat];
}

/** 0.6 秒で寄る動き。行きも帰りも滑らかに */
export function easeFocus(elapsed: number, seconds = FOCUS_SECONDS): number {
  const t = clamp(elapsed / seconds, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function lerpPoint(from: Vec2, to: Vec2, t: number): Vec2 {
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
}

/**
 * 車と人を進める。経路の端まで行ったら先頭へ戻る。
 * 時刻だけで決まるので、止めて再開しても飛ばない。
 */
export function moveAlong(path: PropPath, seconds: number): { at: Vec2; angle: number } {
  const total = pathLength(path.points);
  const travelled = path.start + (path.speed * seconds) / Math.max(1, total);
  const t = ((travelled % 1) + 1) % 1;
  const spot = pointAt(path.points, t);
  const back = path.speed < 0 ? Math.PI : 0;
  return {
    at: {
      x: spot.at.x + Math.cos(spot.angle) * path.offset,
      z: spot.at.z - Math.sin(spot.angle) * path.offset,
    },
    angle: spot.angle + back,
  };
}

function pathLength(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    sum += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return sum;
}

/** 押せる的。建物 1 棟ぶんの当たり判定 */
export interface PickTarget {
  id: string;
  label: string;
  at: Vec2;
  /** 当たり判定の箱（メートル） */
  size: { w: number; h: number; d: number };
  rotation: number;
  command: string;
  why: string;
}

/**
 * 押せる建物を集める。
 * 形は融合してしまうので、当たり判定だけは 1 棟ずつ別に置く（描かないので絵は重くならない）。
 */
export function pickTargets(buildings: readonly { id: string; label: string; at: Vec2; rotation: number; params: { footprint: { w: number; d: number }; floors: number }; command?: string; why?: string }[]): PickTarget[] {
  return buildings.flatMap((building) => {
    if (building.command === undefined) return [];
    return [
      {
        id: building.id,
        label: building.label,
        at: building.at,
        rotation: building.rotation,
        size: {
          w: building.params.footprint.w + 2,
          h: Math.max(6, building.params.floors * 3.4),
          d: building.params.footprint.d + 2,
        },
        command: building.command,
        why: building.why ?? '',
      },
    ];
  });
}
