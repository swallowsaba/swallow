import type { BuildingKind, FacilityState, FacilityStatus } from '@/content/city';
import { cellNoise } from './terrain';

/**
 * アイソメトリックの街の配置を、施設の状態から組み立てる。描画から切り離し、テストで確かめる。
 *
 * - マス目の街。BLOCK マスごとに道路が通り、道路で囲まれた 1 区画が 1 施設の地区になる
 * - 未開拓の地区は森。建設できる地区は区画割りの線と工事のクレーン
 * - 施設を建てると地区の中央に名所（2×2 マス）が建つ。任務をこなすほど、まわりの区画に住宅・商業・工業のビルが増え、高くなる
 * - 道路には、建った施設の数に応じて車が走る
 */

export const BLOCK = 7;
export const INNER = BLOCK - 1;
export const DISTRICT_COLS = 4;

export type Zone = 'residential' | 'commercial' | 'industrial';
export type TileKind = 'road' | 'grass' | 'forest' | 'plan' | 'lot' | 'plaza';

export interface IsoTile {
  gx: number;
  gy: number;
  kind: TileKind;
  zone?: Zone;
}

export interface IsoBuilding {
  id: string;
  gx: number;
  gy: number;
  /** 足もとの広さ（マス） */
  w: number;
  d: number;
  /** 高さ（階数） */
  floors: number;
  zone?: Zone;
  /** 施設の名所なら、その施設の id と見た目 */
  facilityId?: string;
  kind?: BuildingKind;
}

export interface IsoTree {
  gx: number;
  gy: number;
  /** マスの中での位置（0..1） */
  ox: number;
  oy: number;
  size: number;
}

export interface IsoDistrict {
  facilityId: string;
  state: FacilityState;
  /** 地区の左上のマス（道路の内側） */
  gx: number;
  gy: number;
  /** 名所の位置 */
  landmark: { gx: number; gy: number };
  /** 建ったビルの数 / 建てられる区画の数 */
  built: number;
  lots: number;
}

export interface IsoCar {
  id: string;
  /** 道路をひと回りするマスの角の並び */
  loop: { gx: number; gy: number }[];
  /** 出発を遅らせる割合（0..1） */
  offset: number;
}

export interface IsoCityModel {
  cols: number;
  rows: number;
  tiles: IsoTile[];
  buildings: IsoBuilding[];
  trees: IsoTree[];
  districts: IsoDistrict[];
  cars: IsoCar[];
  /** 住民の数に応じた、歩いている人の数 */
  walkers: number;
}

/** 地区の中の区画を、名所のまわりから外へ向かう順に並べる（街は中心から育つ） */
function lotOrder(originX: number, originY: number, seed: number): { gx: number; gy: number }[] {
  const lots: { gx: number; gy: number; rank: number }[] = [];
  const cx = originX + INNER / 2;
  const cy = originY + INNER / 2;
  for (let dy = 0; dy < INNER; dy += 1) {
    for (let dx = 0; dx < INNER; dx += 1) {
      const gx = originX + dx;
      const gy = originY + dy;
      // 名所の 2×2 は区画にしない
      if ((dx === 2 || dx === 3) && (dy === 2 || dy === 3)) continue;
      const dist = Math.abs(gx + 0.5 - cx) + Math.abs(gy + 0.5 - cy);
      lots.push({ gx, gy, rank: dist + cellNoise(gx + seed, gy) * 1.5 });
    }
  }
  return lots.sort((a, b) => a.rank - b.rank).map(({ gx, gy }) => ({ gx, gy }));
}

/** 区画の種類。内側は商業が多く、外側は住宅、ところどころ工業 */
function zoneOf(gx: number, gy: number, originX: number, originY: number): Zone {
  const dx = gx - originX;
  const dy = gy - originY;
  const edge = Math.min(dx, dy, INNER - 1 - dx, INNER - 1 - dy);
  const n = cellNoise(gx * 3, gy * 5);
  if (edge >= 1 && n < 0.5) return 'commercial';
  if (n > 0.82) return 'industrial';
  return 'residential';
}

export function buildIsoCity(facilities: readonly FacilityStatus[]): IsoCityModel {
  const count = Math.max(1, facilities.length);
  const districtRows = Math.ceil(count / DISTRICT_COLS);
  const cols = DISTRICT_COLS * BLOCK + 1;
  const rows = districtRows * BLOCK + 1;
  const tiles: IsoTile[] = [];
  const buildings: IsoBuilding[] = [];
  const trees: IsoTree[] = [];
  const districts: IsoDistrict[] = [];
  const tileAt = new Map<string, IsoTile>();

  for (let gy = 0; gy < rows; gy += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      const tile: IsoTile = { gx, gy, kind: gx % BLOCK === 0 || gy % BLOCK === 0 ? 'road' : 'grass' };
      tiles.push(tile);
      tileAt.set(`${String(gx)},${String(gy)}`, tile);
    }
  }

  facilities.forEach((status, i) => {
    const originX = (i % DISTRICT_COLS) * BLOCK + 1;
    const originY = Math.floor(i / DISTRICT_COLS) * BLOCK + 1;
    const landmark = { gx: originX + 2, gy: originY + 2 };
    const order = lotOrder(originX, originY, i * 17);
    const isBuilt = status.state === 'built' || status.state === 'operating' || status.state === 'complete';
    // 建てた時点で数軒が集まり、稼働するほど埋まっていく
    const builtLots = isBuilt ? Math.min(order.length, 3 + Math.round(status.ratio * (order.length - 3))) : 0;

    for (let dy = 0; dy < INNER; dy += 1) {
      for (let dx = 0; dx < INNER; dx += 1) {
        const tile = tileAt.get(`${String(originX + dx)},${String(originY + dy)}`);
        if (!tile) continue;
        if (status.state === 'locked') tile.kind = 'forest';
        else if (status.state === 'available') tile.kind = 'plan';
        else tile.kind = 'lot';
      }
    }

    if (status.state === 'locked') {
      // 森。木の位置はマスから決まる
      for (let dy = 0; dy < INNER; dy += 1) {
        for (let dx = 0; dx < INNER; dx += 1) {
          const gx = originX + dx;
          const gy = originY + dy;
          const n = cellNoise(gx * 7, gy * 11);
          if (n < 0.55) trees.push({ gx, gy, ox: 0.25 + n * 0.5, oy: 0.3 + cellNoise(gy, gx) * 0.4, size: 0.7 + n * 0.6 });
        }
      }
    }

    if (isBuilt) {
      for (let dy = 2; dy <= 3; dy += 1) {
        for (let dx = 2; dx <= 3; dx += 1) {
          const tile = tileAt.get(`${String(originX + dx)},${String(originY + dy)}`);
          if (tile) tile.kind = 'plaza';
        }
      }
      buildings.push({
        id: `landmark-${status.facility.id}`,
        gx: landmark.gx,
        gy: landmark.gy,
        w: 2,
        d: 2,
        floors: landmarkFloors(status.facility.building, status.ratio),
        facilityId: status.facility.id,
        kind: status.facility.building,
      });
      order.forEach((lot, k) => {
        const zone = zoneOf(lot.gx, lot.gy, originX, originY);
        const tile = tileAt.get(`${String(lot.gx)},${String(lot.gy)}`);
        if (tile) tile.zone = zone;
        if (k < builtLots) {
          const n = cellNoise(lot.gx * 13, lot.gy * 7);
          // 稼働が進むほど高いビルが建つ。商業は高く、住宅と工業は低め
          const base = zone === 'commercial' ? 2 : 1;
          const growth = Math.round(status.ratio * (zone === 'commercial' ? 7 : zone === 'residential' ? 4 : 2));
          buildings.push({ id: `lot-${String(lot.gx)}-${String(lot.gy)}`, gx: lot.gx, gy: lot.gy, w: 1, d: 1, floors: base + Math.floor(n * 2) + growth, zone });
        } else if (cellNoise(lot.gx, lot.gy * 3) < 0.35) {
          trees.push({ gx: lot.gx, gy: lot.gy, ox: 0.5, oy: 0.5, size: 0.8 });
        }
      });
    }

    districts.push({
      facilityId: status.facility.id,
      state: status.state,
      gx: originX,
      gy: originY,
      landmark,
      built: builtLots,
      lots: order.length,
    });
  });

  // 車は、建った地区を囲む道路をひと回りする
  const cars: IsoCar[] = [];
  districts
    .filter((d) => d.state === 'built' || d.state === 'operating' || d.state === 'complete')
    .forEach((d, i) => {
      const x0 = d.gx - 1;
      const y0 = d.gy - 1;
      const loop = [
        { gx: x0, gy: y0 },
        { gx: x0 + BLOCK, gy: y0 },
        { gx: x0 + BLOCK, gy: y0 + BLOCK },
        { gx: x0, gy: y0 + BLOCK },
      ];
      const perDistrict = d.state === 'complete' ? 3 : d.state === 'operating' ? 2 : 1;
      for (let k = 0; k < perDistrict; k += 1) {
        cars.push({ id: `car-${d.facilityId}-${String(k)}`, loop: k % 2 === 0 ? loop : [...loop].reverse(), offset: (k / perDistrict + i * 0.13) % 1 });
      }
    });

  const residents = districts.reduce((n, d) => n + d.built * 12 + (d.state === 'locked' || d.state === 'available' ? 0 : 20), 0);
  buildings.sort((a, b) => a.gx + a.w + a.gy + a.d - (b.gx + b.w + b.gy + b.d) || a.gx - b.gx);

  return { cols, rows, tiles, buildings, trees, districts, cars, walkers: Math.min(16, Math.floor(residents / 40)) };
}

/** 名所の高さ。種類で基本の高さが違い、稼働するほど少し伸びる（看板や塔が増える） */
export function landmarkFloors(kind: BuildingKind, ratio: number): number {
  const base: Record<BuildingKind, number> = {
    hall: 4,
    office: 6,
    house: 3,
    warehouse: 3,
    workshop: 3,
    station: 3,
    bridge: 2,
    tower: 9,
    castle: 5,
    factory: 4,
    post: 4,
    library: 4,
    gate: 4,
    farm: 2,
    lab: 5,
  };
  return base[kind] + Math.round(ratio * 3);
}
