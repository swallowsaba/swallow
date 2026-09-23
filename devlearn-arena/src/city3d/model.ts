import type { Building, BuildingKind, City, Occupant } from '@/city/model';
import type { DistrictId } from '@/city/growth';
import { TILE_METERS } from './palette';
import { between, hashString, intBetween, unit } from './seed';

/**
 * 街の状態 → 3D の街の配置。純粋関数。
 *
 * `src/city/model.ts` が出した街（タイル座標の平面図）を、
 * メートルの世界に置き直す。ここは three に触れない。形を組み立てるのは `buildings.ts`。
 *
 * 見た目の振れ幅は乱数ではなく seed から決める。同じ状態からは必ず同じ街になる。
 */

/** 地面の上の 1 点（メートル）。y が上なので、平面は x と z */
export interface Vec2 {
  x: number;
  z: number;
}

/**
 * 建物のパラメータ。ここから形を組み立てる（外部モデルを取ってこない）。
 * DESIGN.md §5 の指定に、曲面の高層ビル（§11）のための `shape` を足したもの。
 */
export interface BuildingParams {
  kind: 'tower' | 'midrise' | 'house' | 'monument' | 'depot';
  /** 箱か円柱か。円柱の高層ビルを混ぜて、直線だけの街にしない */
  shape: 'box' | 'cylinder';
  /** 底面（メートル） */
  footprint: { w: number; d: number };
  /** 階数 */
  floors: number;
  /** 何階目で幅を絞るか */
  setbacks: number[];
  roof: 'flat' | 'gable' | 'hip';
  /** 見た目の振れ幅。乱数ではなく seed から決める */
  seed: number;
}

export interface LayoutOccupant {
  id: string;
  label: string;
  state: Occupant['state'];
  /** 住んでいる階（1 始まり）。ここの窓が灯る */
  floor: number;
  /** 引っ越してきたなら、元の建物の中心 */
  from?: Vec2;
}

export interface LayoutBuilding {
  id: string;
  kind: BuildingKind;
  label: string;
  /** 底面の中心（メートル） */
  at: Vec2;
  /** Y 軸まわりの向き（ラジアン） */
  rotation: number;
  params: BuildingParams;
  occupants: LayoutOccupant[];
  state: Building['state'];
  phase: Building['phase'];
  /** 建ち上がり 0..1。基礎だけのときは低い */
  progress: number;
  district: DistrictId;
  command?: string;
  why?: string;
}

export interface LayoutDistrict {
  id: DistrictId;
  unlocked: boolean;
  /** 区域の中心（メートル） */
  at: Vec2;
  w: number;
  d: number;
}

export interface CityLayout {
  seed: number;
  /** 街の広さ（メートル） */
  size: { w: number; d: number };
  buildings: LayoutBuilding[];
  districts: LayoutDistrict[];
}

export interface LayoutInput {
  /** 街の見た目を決める種。省略すると既定の種を使う */
  seed?: number;
}

/** 既定の種。文字列から作るので、数を書き換えても意味が分かる */
export const DEFAULT_SEED = hashString('devlearn-city');

/** 学ぶ対象ごとの建物を、組み立て方の 5 種類へ割り当てる */
const PARAM_KIND: Record<BuildingKind, BuildingParams['kind']> = {
  tower: 'tower',
  office: 'midrise',
  stop: 'depot',
  monument: 'monument',
  flag: 'monument',
  depot: 'depot',
  hut: 'house',
  house: 'house',
  relay: 'tower',
  gate: 'depot',
  window: 'midrise',
  line: 'depot',
};

/** 建物の階数。規模（level）が上がるほど高くなる */
function floorsOf(kind: BuildingParams['kind'], level: number, seed: number): number {
  switch (kind) {
    case 'tower':
      return 8 + level * 3 + intBetween(seed, 1, 0, 3);
    case 'midrise':
      return 3 + level + intBetween(seed, 2, 0, 2);
    case 'house':
      return level >= 3 ? 3 : 2;
    case 'depot':
      return 2;
    case 'monument':
      return 1;
  }
}

/** 上へ行くほど細くなる段。高い建物にだけ付く */
function setbacksOf(floors: number): number[] {
  if (floors < 10) return [];
  if (floors < 16) return [Math.round(floors * 0.65)];
  return [Math.round(floors * 0.5), Math.round(floors * 0.78)];
}

function roofOf(kind: BuildingParams['kind'], seed: number): BuildingParams['roof'] {
  if (kind === 'house') return 'gable';
  if (kind === 'depot') return unit(seed, 3) < 0.5 ? 'gable' : 'hip';
  if (kind === 'midrise') return unit(seed, 3) < 0.3 ? 'hip' : 'flat';
  return 'flat';
}

/**
 * 街の建物 1 棟から、組み立てのパラメータを出す。
 * タイルの広さをメートルに直し、縁石と庭のぶんだけ内側へ寄せる。
 */
export function paramsFor(building: Building): BuildingParams {
  const seed = hashString(building.id);
  const kind = PARAM_KIND[building.kind];
  const margin = kind === 'tower' ? 3 : 2;
  const w = Math.max(4, building.w * TILE_METERS - margin * 2);
  const d = Math.max(4, building.h * TILE_METERS - margin * 2);
  const floors = floorsOf(kind, building.level, seed);
  // 円柱の高層ビルを混ぜる。四角い箱だけの街にしない
  const shape: BuildingParams['shape'] = kind === 'tower' && unit(seed, 4) < 0.35 ? 'cylinder' : 'box';
  const side = shape === 'cylinder' ? Math.min(w, d) : 0;
  return {
    kind,
    shape,
    footprint: shape === 'cylinder' ? { w: side, d: side } : { w, d },
    floors,
    setbacks: setbacksOf(floors),
    roof: roofOf(kind, seed),
    seed,
  };
}

/** 建ち上がりの段を 0..1 に直す */
function progressOf(phase: Building['phase']): number {
  if (phase === 'done') return 1;
  return phase === 'frame' ? 0.55 : 0.15;
}

/** タイル座標をメートルに直す。街の真ん中が原点 */
function toMeters(tileX: number, tileY: number, city: City): Vec2 {
  return {
    x: (tileX - city.width / 2) * TILE_METERS,
    z: (tileY - city.height / 2) * TILE_METERS,
  };
}

function centerOf(building: Building, city: City): Vec2 {
  return toMeters(building.x + building.w / 2, building.y + building.h / 2, city);
}

/** 住人をどの階に住ませるか。上の階から埋めず、散らして灯りを混ぜる */
function occupantsOf(building: Building, city: City, places: ReadonlyMap<string, Building>): LayoutOccupant[] {
  const floors = Math.max(1, floorsOf(PARAM_KIND[building.kind], building.level, hashString(building.id)));
  return building.occupants.map((occupant, i) => {
    const seed = hashString(occupant.id);
    const from = occupant.from === undefined ? undefined : places.get(occupant.from);
    return {
      id: occupant.id,
      label: occupant.label,
      state: occupant.state,
      floor: 1 + ((intBetween(seed, 5, 0, floors - 1) + i) % floors),
      ...(from === undefined ? {} : { from: centerOf(from, city) }),
    };
  });
}

/**
 * 街を 3D の配置に直す。
 * 建てる場所は学習者が作った資源が決める。ここが勝手に建物を足すことはない。
 */
export function layoutCity(city: City, input: LayoutInput = {}): CityLayout {
  const seed = input.seed ?? DEFAULT_SEED;
  const places = new Map(city.buildings.map((b) => [b.id, b]));

  const buildings: LayoutBuilding[] = city.buildings.map((building, i) => {
    const at = centerOf(building, city);
    const face = hashString(building.id);
    return {
      id: building.id,
      kind: building.kind,
      label: building.label,
      // 通りに正対させつつ、少しだけ振る。定規で引いたように揃えない
      at,
      rotation: (Math.PI / 2) * intBetween(face, 6, 0, 3) + between(seed + face, i, -0.09, 0.09),
      params: paramsFor(building),
      occupants: occupantsOf(building, city, places),
      state: building.state,
      phase: building.phase,
      progress: progressOf(building.phase),
      district: building.district,
      ...(building.command === undefined ? {} : { command: building.command }),
      ...(building.why === undefined ? {} : { why: building.why }),
    };
  });

  return {
    seed,
    size: { w: city.width * TILE_METERS, d: city.height * TILE_METERS },
    buildings,
    districts: city.districts.map((district) => ({
      id: district.track,
      unlocked: district.unlocked,
      at: toMeters(district.x + district.w / 2, district.y + district.h / 2, city),
      w: district.w * TILE_METERS,
      d: district.h * TILE_METERS,
    })),
  };
}
