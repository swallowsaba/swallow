/**
 * 等角投影（横 2 : 縦 1）の座標変換（docs/city-design.md 1・7 章）。
 *
 * 格子の座標（x, y はマス、z は高さ）を、画面の座標（ズーム 1 の画素）に移す。
 * 1 マス = 道路 1 本分の幅。回転は 90 度単位で、地図の中心を軸に回す。
 */

/** 1 マスの菱形の幅と高さ（画素） */
export const TILE_W = 64;
export const TILE_H = 32;
/** 高さ 1 の画面上の長さ（画素）。1 マスの立方体の高さが TILE_H になる */
export const Z_UNIT = 32;

export type Rotation = 0 | 1 | 2 | 3;

export interface P2 {
  x: number;
  y: number;
}
export interface P3 {
  x: number;
  y: number;
  z: number;
}
export interface Screen {
  sx: number;
  sy: number;
}

/**
 * 地図の座標を、回転した「見る向き」の座標に移す。
 * size は地図の一辺のマス数。中心 (size/2, size/2) を軸に、rotation × 90 度回す。
 * マス (x, y) の範囲 [x, x+1]×[y, y+1] は、回した後もちょうど 1 マスに重なる。
 */
export function rotate(p: P2, rotation: Rotation, size: number): P2 {
  switch (rotation) {
    case 0:
      return { x: p.x, y: p.y };
    case 1:
      return { x: size - p.y, y: p.x };
    case 2:
      return { x: size - p.x, y: size - p.y };
    case 3:
      return { x: p.y, y: size - p.x };
  }
}

/** rotate の逆 */
export function unrotate(p: P2, rotation: Rotation, size: number): P2 {
  const back = ((4 - rotation) % 4) as Rotation;
  return rotate(p, back, size);
}

/** 見る向きの座標を画面へ（原点は格子の (0,0,0)） */
export function project(p: P3): Screen {
  return {
    sx: (p.x - p.y) * (TILE_W / 2),
    sy: (p.x + p.y) * (TILE_H / 2) - p.z * Z_UNIT,
  };
}

/** 画面の点を、高さ 0 の地面の上の見る向きの座標へ戻す */
export function unproject(s: Screen): P2 {
  const a = s.sx / (TILE_W / 2); // x - y
  const b = s.sy / (TILE_H / 2); // x + y
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * 奥から手前への描画順の鍵。見る向きの x + y が小さいほど奥。
 * 同じなら低い物を先に描く。
 */
export function depthKey(view: P2, z = 0): number {
  return (view.x + view.y) * 1000 + z;
}
