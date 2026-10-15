import { screenToWorld, type Camera, type Viewport } from './camera';
import { rotate, unrotate, type P2, type Rotation } from './projection';
import type { City } from './types';

/**
 * ミニマップの座標（docs/ui-design.md 3 章、docs/decisions.md D-18）。
 * 都市ビューと同じ向き（画面の上 = 回した後の x + y が小さい方、右 = x − y が大きい方）で、真上から見た地図を描く。
 * 都市の回転に合わせて回る。縮尺は地図の中心から島の端までで決め、どの向きでも変わらない。
 */
export interface MinimapFrame {
  /** 地図の一辺のマス数 */
  size: number;
  /** ミニマップの一辺（画素） */
  box: number;
  rotation: Rotation;
  /** 1 マスあたりの画素（斜めに置くので、マスの対角が 2 × scale 画素） */
  scale: number;
}

/** ミニマップの一辺（docs/ui-design.md 3 章: 160×160。画面の高さが 900 未満では 100×100） */
export function minimapBox(height: number): number {
  return height < 900 ? 100 : 160;
}

/** 島の輪郭（地盤）が収まるように縮尺を決める。pad はミニマップの縁の余白（画素） */
export function minimapFrame(outline: readonly P2[], size: number, box: number, rotation: Rotation, pad = 6): MinimapFrame {
  const c = size / 2;
  // 地図の中心から見た、回した後の (x − y, x + y − size) の大きい方。90 度回しても入れ替わるだけなので、向きによらない
  let reach = 1;
  for (const p of outline) reach = Math.max(reach, Math.abs(p.x - p.y), Math.abs(p.x + p.y - 2 * c));
  return { size, box, rotation, scale: (box / 2 - pad) / reach };
}

/** 地図の点を、ミニマップの画素へ */
export function toMinimap(f: MinimapFrame, p: P2): { mx: number; my: number } {
  const v = rotate(p, f.rotation, f.size);
  return { mx: f.box / 2 + (v.x - v.y) * f.scale, my: f.box / 2 + (v.x + v.y - f.size) * f.scale };
}

/** ミニマップの画素を、地図の点へ（地図の外は端に寄せる） */
export function fromMinimap(f: MinimapFrame, mx: number, my: number): P2 {
  const u = (mx - f.box / 2) / f.scale;
  const w = (my - f.box / 2) / f.scale + f.size;
  const p = unrotate({ x: (u + w) / 2, y: (w - u) / 2 }, f.rotation, f.size);
  return { x: Math.max(0, Math.min(f.size, p.x)), y: Math.max(0, Math.min(f.size, p.y)) };
}

/* ---------- 今の視野 ---------- */

/** 今の視野の枠（画面の四隅の下にある地面を、左上・右上・右下・左下の順に） */
export function viewOutline(f: MinimapFrame, cam: Camera, vp: Viewport): { mx: number; my: number }[] {
  return [[0, 0], [vp.width, 0], [vp.width, vp.height], [0, vp.height]].map(([sx = 0, sy = 0]) => toMinimap(f, screenToWorld(cam, vp, { sx, sy }, f.size)));
}

/* ---------- 下絵の印 ---------- */

/** 地図の下絵（島の形・道路・区画・施設の点）を描き直す要るかを見分ける印。都市の日付が進んだだけでは変わらない */
export function minimapKey(city: Pick<City, 'roads' | 'zones' | 'facilities' | 'revealed'>, f: MinimapFrame): string {
  const facilities = city.facilities.map((x) => `${x.id}:${x.state}`).join(',');
  const zones = city.zones.map((z) => `${z.id}:${String(z.cells.length)}`).join(',');
  const revealed = city.revealed.map((r) => `${String(r.x)},${String(r.y)},${String(r.w)}`).join(',');
  return `${String(f.box)}|${String(f.rotation)}|${city.roads.map((r) => r.id).join(',')}|${zones}|${facilities}|${revealed}`;
}
