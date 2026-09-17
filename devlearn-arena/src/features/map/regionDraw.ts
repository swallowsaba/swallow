import type { BuildingKind } from '@/content/city';
import type { MissionTrack } from '@/engines/lesson/types';
import { diamond, facilityBuilding, lamp, poly, project, TH, TRACK_ACCENT, tree, TW, type Ctx } from '@/features/citymap/isoDraw';

/**
 * 全体図（地方の地図）。5 つの街を、実際に建てた施設の建ち具合で斜め見下ろしに描き、幹線道路でつなぐ。
 */

export interface RegionCity {
  track: MissionTrack;
  name: string;
  facilities: { kind: BuildingKind; built: boolean; ratio: number; build: number }[];
  complaints: number;
  /** 0..1（任務の完了の割合） */
  progress: number;
}

/** 街の左上のマスと大きさ */
export const REGION_SPOTS: Record<MissionTrack, { x: number; y: number }> = {
  kernel: { x: 0, y: 10 },
  git: { x: 12, y: 0 },
  github: { x: 26, y: 4 },
  k8s: { x: 12, y: 22 },
  net: { x: 28, y: 22 },
};
export const CITY_W = 8;
export const CITY_D = 11;
export const REGION_W = 40;
export const REGION_H = 34;

const ROUTE: readonly MissionTrack[] = ['kernel', 'git', 'github', 'net', 'k8s', 'kernel'];

const center = (track: MissionTrack) => ({ x: REGION_SPOTS[track].x + CITY_W / 2, y: REGION_SPOTS[track].y + CITY_D / 2 });

/** 街どうしをつなぐ幹線道路のマス（横 → 縦の L 字） */
export function routeCells(): { x: number; y: number }[] {
  const cells = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < ROUTE.length - 1; i += 1) {
    const a = center(ROUTE[i] ?? 'kernel');
    const b = center(ROUTE[i + 1] ?? 'kernel');
    const sx = Math.sign(b.x - a.x);
    for (let x = a.x; x !== b.x + sx && sx !== 0; x += sx) cells.set(`${String(x)},${String(a.y)}`, { x, y: a.y });
    const sy = Math.sign(b.y - a.y);
    for (let y = a.y; y !== b.y + sy && sy !== 0; y += sy) cells.set(`${String(b.x)},${String(y)}`, { x: b.x, y });
  }
  return [...cells.values()];
}

export function drawRegion(ctx: Ctx, cities: readonly RegionCity[]): void {
  const margin = 4;
  for (let y = -margin; y < REGION_H + margin; y += 1) {
    for (let x = -margin; x < REGION_W + margin; x += 1) {
      const checker = (x + y) % 2 === 0;
      const sea = x < -1 || y < -1 || x > REGION_W || y > REGION_H;
      diamond(ctx, x, y, sea ? (checker ? '#4c9bcb' : '#4896c6') : checker ? '#76b24f' : '#6fab49');
    }
  }
  for (const c of routeCells()) diamond(ctx, c.x, c.y, '#cdb48a');

  const draws: { key: number; draw: () => void }[] = [];
  for (let i = 0; i < 60; i += 1) {
    const x = (i * 37) % REGION_W;
    const y = (i * 53) % REGION_H;
    const inCity = cities.some((c) => {
      const s = REGION_SPOTS[c.track];
      return x >= s.x - 1 && x <= s.x + CITY_W && y >= s.y - 1 && y <= s.y + CITY_D;
    });
    if (!inCity) draws.push({ key: x + y, draw: () => { tree(ctx, x + 0.5, y + 0.5, i * 7919); } });
  }
  for (const city of cities) {
    const s = REGION_SPOTS[city.track];
    const accent = TRACK_ACCENT[city.track];
    poly(ctx, [project(s.x, s.y), project(s.x + CITY_W, s.y), project(s.x + CITY_W, s.y + CITY_D), project(s.x, s.y + CITY_D)], '#d9d0bd', accent, 3);
    city.facilities.forEach((f, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const fx = s.x + col * 2;
      const fy = s.y + row * 2.6 + 0.2;
      if (f.built) {
        draws.push({ key: fx + fy + 4, draw: () => {
          ctx.save();
          const c = project(fx + 1, fy + 1);
          ctx.translate(c.sx, c.sy);
          ctx.scale(0.8, 0.8);
          ctx.translate(-c.sx, -c.sy);
          facilityBuilding(ctx, f.kind, accent, fx, fy, f.ratio, f.build);
          ctx.restore();
        } });
      } else {
        draws.push({ key: fx + fy, draw: () => {
          poly(ctx, [project(fx + 0.4, fy + 0.4), project(fx + 1.6, fy + 0.4), project(fx + 1.6, fy + 1.6), project(fx + 0.4, fy + 1.6)], 'rgba(160,120,70,0.25)', 'rgba(255,255,255,0.6)', 1);
        } });
      }
    });
    draws.push({ key: s.x + s.y + CITY_W + CITY_D, draw: () => { lamp(ctx, s.x + CITY_W - 0.3, s.y + CITY_D - 0.3); } });
  }
  draws.sort((a, b) => a.key - b.key);
  for (const d of draws) d.draw();
}

/** 街を押したか。地図上の px（投影後）から判定する */
export function cityAt(sx: number, sy: number, cities: readonly RegionCity[]): MissionTrack | null {
  for (const city of cities) {
    const s = REGION_SPOTS[city.track];
    const left = project(s.x, s.y + CITY_D).sx;
    const right = project(s.x + CITY_W, s.y).sx;
    const top = project(s.x, s.y).sy - 80;
    const bottom = project(s.x + CITY_W, s.y + CITY_D).sy;
    if (sx >= left && sx <= right && sy >= top && sy <= bottom) return city.track;
  }
  return null;
}

export const REGION_BOUNDS = (() => {
  const margin = 4;
  const left = project(-margin, REGION_H + margin).sx;
  const right = project(REGION_W + margin, -margin).sx;
  const top = project(-margin, -margin).sy - 120;
  const bottom = project(REGION_W + margin, REGION_H + margin).sy;
  return { left, top, width: right - left, height: bottom - top, tw: TW, th: TH };
})();
