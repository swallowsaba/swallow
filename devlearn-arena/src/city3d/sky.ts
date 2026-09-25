import { LIGHT, SKY } from './palette';
import type { LayoutDistrict, Vec2 } from './model';
import type { PropPath } from './props';

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

/** 昼でも灯りと分かる強さ。これより弱いと、昼の光の中で暗い窓と見分けられない */
const DAY_GLOW = 0.55;

/**
 * 住人が暮らしている窓の灯り（REWORK 7-3）。
 * 灯った窓は「中で住人（Pod）が動いている」の印なので、昼も消さない。夜はもっと明るくなる
 */
export function windowGlow(time: number): number {
  return Math.max(DAY_GLOW, glowStrength(time));
}

/**
 * fog の掛かり方。街の半径から決める。
 *
 * 近景と中景ははっきり見えること。霧は地平線の近くだけに掛ける。
 * そのため near は街の半径の 2 倍以上を取る。街の中に立っている限り霧に沈まない。
 */
export function cityRadius(size: { w: number; d: number }): number {
  return Math.max(size.w, size.d) / 2;
}

export function fogRange(size: { w: number; d: number }): [number, number] {
  const radius = cityRadius(size);
  return [radius * SKY.fogNearRadii, radius * SKY.fogFarRadii];
}

/** その広さが画面に収まるカメラの距離 */
export function fitDistance(size: { w: number; d: number }): number {
  const span = Math.max(size.w, size.d * 1.4);
  return span / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360));
}

/**
 * 開いたときに見る所。いま学んでいる区域に寄せる。
 *
 * 島全体を遠くから見下ろさない。建物の顔が見える近さで始める。
 * その区域がまだ開いていなければ、開いている区域のうち最初のものを見る。
 */
export function openingView(
  layout: { terrain: { size: { w: number; d: number } }; districts: readonly LayoutDistrict[] },
  district: string | null,
): { at: Vec2; distance: number } {
  const open = layout.districts.filter((d) => d.unlocked);
  const area = open.find((d) => d.id === district) ?? open[0];
  if (area === undefined) return { at: { x: 0, z: 0 }, distance: fitDistance(layout.terrain.size) };
  return { at: area.at, distance: fitDistance({ w: area.w, d: area.d }) };
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
 * いまのカメラ位置から、水平の向き（azimuth）を読む。
 * `cameraPosition` の逆。寄る先を変えても、向きだけは保てるようにするためのもの。
 */
export function azimuthOf(camera: Vec2, target: Vec2): number {
  return Math.atan2(camera.x - target.x, camera.z - target.z);
}

/** カメラと注目点の水平の隔たり（メートル）から、伏せ角を保った距離を戻す */
export function distanceOf(camera: Vec2, target: Vec2): number {
  const flat = Math.hypot(camera.x - target.x, camera.z - target.z);
  return flat / Math.cos(CAMERA_PITCH);
}

/**
 * ツアーで 1 つの施設に寄るときの距離（メートル）。
 * 建物の全体と、その足元で起きていることが同時に見える近さ。
 * これより近づけると、高い建物ではカメラが壁にめり込む。
 */
export const TOUR_DISTANCE = 240;

/** ツアーで次の施設へ移る秒数。歩いて回るくらいの速さで、目で追える */
export const TOUR_SECONDS = 1.6;

/**
 * 案内のときに、見る所を画面の右へ寄せる量。カメラからの距離に対する割合。
 *
 * 画面の左は端末の柱と課題の札で埋まっている。真ん中に寄せると、
 * 案内したい施設がその板の裏に隠れる。そのぶんだけ右へ置く。
 */
export const TOUR_SIDE = 0.2;

/**
 * 施設が画面の右寄りに映るように、カメラが向く先をずらす。
 * `azimuth` はカメラの水平の向き。`side` はずらす距離（メートル）。
 */
export function aside(at: Vec2, azimuth: number, side: number): Vec2 {
  return { x: at.x - Math.cos(azimuth) * side, z: at.z + Math.sin(azimuth) * side };
}

/**
 * 車と人を進める。経路の端まで行ったら先頭へ戻る。
 * 時刻だけで決まるので、止めて再開しても飛ばない。
 */
export function moveAlong(path: PropPath, seconds: number): { at: Vec2; angle: number } {
  const total = pathLength(path.points);
  const travelled = path.start + (path.speed * seconds) / Math.max(1, total);
  const cycle = ((travelled % 1) + 1) % 1;
  // 折り返す道では、行きは 0→1、帰りは 1→0 と進む。帰りは向きも反対にする
  const returning = path.bounce === true && Math.floor(((travelled % 2) + 2) % 2) === 1;
  const t = returning ? 1 - cycle : cycle;
  // 点の番号ではなく、道のりで測った位置に置く。区間の長さが違っても同じ速さで進むように
  const spot = atDistance(path.points, t * total);
  const back = (path.speed < 0) !== returning ? Math.PI : 0;
  return {
    at: {
      x: spot.at.x + Math.cos(spot.angle) * path.offset,
      z: spot.at.z - Math.sin(spot.angle) * path.offset,
    },
    angle: spot.angle + back,
  };
}

/** 点列の始点から道のり `meters` の所の点と向き */
function atDistance(points: readonly Vec2[], meters: number): { at: Vec2; angle: number } {
  let left = meters;
  let angle = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-9) continue;
    angle = Math.atan2(b.x - a.x, b.z - a.z);
    if (left <= len) {
      const f = left / len;
      return { at: { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }, angle };
    }
    left -= len;
  }
  return { at: points[points.length - 1] ?? { x: 0, z: 0 }, angle };
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
  /** 押したときに端末へ送るコマンド。持たない建物もある */
  command: string;
  why: string;
  /** 中にいる住人の数。名札に添える */
  residents: number;
}

/**
 * 押せる建物を集める。どの建物も選べる（選ぶと右に情報が開く）。
 * 形は融合してしまうので、当たり判定だけは 1 棟ずつ別に置く（描かないので絵は重くならない）。
 */
export function pickTargets(buildings: readonly { id: string; label: string; at: Vec2; rotation: number; params: { footprint: { w: number; d: number }; floors: number }; occupants?: readonly { state: string }[]; command?: string; why?: string }[]): PickTarget[] {
  return buildings.map((building) => ({
    id: building.id,
    label: building.label,
    at: building.at,
    rotation: building.rotation,
    size: {
      w: building.params.footprint.w + 2,
      h: Math.max(6, building.params.floors * 3.4),
      d: building.params.footprint.d + 2,
    },
    command: building.command ?? '',
    why: building.why ?? '',
    residents: (building.occupants ?? []).filter((o) => o.state !== 'gone').length,
  }));
}
