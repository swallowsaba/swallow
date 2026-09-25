import type { CargoShape, Journey } from '@/city/journey';
import type { Vec2 } from './model';

/**
 * 荷車の走り方。停留所の間を進み、着くたびに積荷が姿を変える。
 *
 * ここは three に触れない純粋な計算。使うのは `CityScene.tsx`。
 * 時刻だけで位置が決まるので、止めて再開しても飛ばない。
 */

/** 荷車を地面から浮かせる高さ（メートル）。道に沈ませない */
export const CART_LIFT = 0.7;

/** 停留所と停留所の間を走る秒数 */
export const TRAVEL_SECONDS = 1.4;

/** 停留所で荷を積み替える秒数。ここで積荷の姿が変わる */
export const DWELL_SECONDS = 0.6;

/** 停留所 1 つぶんの秒数 */
export const LEG_SECONDS = TRAVEL_SECONDS + DWELL_SECONDS;

export interface RouteStop {
  /** 停留所になる建物の id */
  building: string;
  /** 停留所の位置（メートル） */
  at: Vec2;
  label: string;
  cargo: CargoShape;
  cargoLabel: string;
}

export interface CartRoute {
  id: string;
  command: string;
  stops: readonly RouteStop[];
}

/**
 * 旅の進み方。外から止めたり、速さを変えたり、1 段ずつ進めたりする。
 * カメラは一度に一か所しか映せないので、学習者が自分の速さで見られるようにする。
 */
export interface JourneyPlay {
  playing: boolean;
  /** 進む速さの倍率。0.5 / 1 / 2 */
  rate: number;
  /** 増えるたびに 1 停留所ぶん進む */
  step: number;
}

/**
 * いま着いている停留所（0 始まり）。
 * 走っている間は、直前に出た停留所を指す。帯の印はこれで動く。
 */
export function reachedStop(seconds: number, stops: number): number {
  for (let k = stops - 1; k > 0; k -= 1) {
    if (seconds >= (k - 1) * LEG_SECONDS + TRAVEL_SECONDS) return k;
  }
  return 0;
}

/** 1 段ずつ進める。次の停留所に着く時刻を返す */
export function stepTo(seconds: number, stops: number): number {
  const total = Math.max(0, stops - 1) * LEG_SECONDS;
  for (let k = 1; k <= stops - 1; k += 1) {
    const arrive = (k - 1) * LEG_SECONDS + TRAVEL_SECONDS;
    if (arrive > seconds + 0.001) return Math.min(total, arrive);
  }
  return total;
}

/** 荷車のいまの様子 */
export interface CartSpot {
  at: Vec2;
  /** Y 軸まわりの向き。`props.pointAt` と同じ取り方 */
  angle: number;
  /** いま何本目の区間にいるか（0 始まり） */
  leg: number;
  /** 積んでいるものの姿と呼び名 */
  cargo: CargoShape;
  cargoLabel: string;
  /** いま停留所で積み替えているか */
  loading: boolean;
  /** 旅を終えたか */
  done: boolean;
}

/**
 * 旅を、地面の上の道のりに直す。
 * 停留所の建物が 3D の街に無ければ飛ばし、2 つに満たなければ道のりにしない。
 */
export function routeOf(
  journey: Journey,
  buildings: readonly { id: string; at: Vec2 }[],
): CartRoute | null {
  const where = new Map(buildings.map((building) => [building.id, building.at]));
  const stops: RouteStop[] = [];
  for (const stop of journey.stops) {
    const at = where.get(stop.building);
    if (at === undefined) continue;
    stops.push({ building: stop.building, at, label: stop.label, cargo: stop.cargo, cargoLabel: stop.cargoLabel });
  }
  if (stops.length < 2) return null;
  return { id: journey.id, command: journey.command, stops };
}

/** 旅にかかる秒数 */
export function routeSeconds(route: CartRoute): number {
  return Math.max(0, route.stops.length - 1) * LEG_SECONDS;
}

function ease(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
}

function headingOf(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/**
 * 経った秒数から荷車の様子を出す。
 *
 * 区間を走っている間は、出てきた停留所の積荷を積んでいる。
 * 次の停留所に着くと積み替えの間になり、そこで積荷が次の姿に変わる。
 */
export function cartAt(route: CartRoute, seconds: number): CartSpot {
  const legs = route.stops.length - 1;
  const last = route.stops[legs];
  const first = route.stops[0];
  if (first === undefined || last === undefined) throw new Error('停留所が足りない');
  if (seconds >= routeSeconds(route)) {
    const before = route.stops[Math.max(0, legs - 1)] ?? first;
    return {
      at: last.at,
      angle: headingOf(before.at, last.at),
      leg: Math.max(0, legs - 1),
      cargo: last.cargo,
      cargoLabel: last.cargoLabel,
      loading: false,
      done: true,
    };
  }
  const index = Math.max(0, Math.min(legs - 1, Math.floor(seconds / LEG_SECONDS)));
  const from = route.stops[index] ?? first;
  const to = route.stops[index + 1] ?? last;
  const into = Math.max(0, seconds - index * LEG_SECONDS);
  const angle = headingOf(from.at, to.at);
  if (into >= TRAVEL_SECONDS) {
    return { at: to.at, angle, leg: index, cargo: to.cargo, cargoLabel: to.cargoLabel, loading: true, done: false };
  }
  const t = ease(into / TRAVEL_SECONDS);
  return {
    at: { x: from.at.x + (to.at.x - from.at.x) * t, z: from.at.z + (to.at.z - from.at.z) * t },
    angle,
    leg: index,
    cargo: from.cargo,
    cargoLabel: from.cargoLabel,
    loading: false,
    done: false,
  };
}
