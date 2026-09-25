import type { CityLayout, Vec2 } from './model';

/**
 * 塞がれた道の、断たれている所。
 *
 * 道路（ケーブル）は建物の中心どうしを結んでいるので、大半は建物の足元に隠れる。
 * 通れなくなったことが見えるよう、2 つの建物の外壁のちょうど間に柵を立てる。
 * ここは three に触れない純粋な計算。
 */
export interface Cut {
  /** 塞がれた道の id */
  id: string;
  /** 柵を立てる所 */
  at: Vec2;
  /** 道の向き（ラジアン）。柵はこれと直角に立つ */
  angle: number;
  /** 柵の幅。道より少し広くして、道を塞いでいると分かるようにする */
  width: number;
}

/** 道の幅に足す分。柵が道からはみ出して見えるように */
const OVERHANG = 6;

/** 塞がれた道ごとに、柵を立てる所を返す */
export function cutsOf(layout: CityLayout): Cut[] {
  const half = new Map(
    layout.buildings.map((b) => [b.id, Math.max(b.params.footprint.w, b.params.footprint.d) / 2]),
  );
  return layout.links
    .filter((link) => link.blocked)
    .map((link) => {
      const dx = link.b.x - link.a.x;
      const dz = link.b.z - link.a.z;
      const span = Math.hypot(dx, dz);
      const nearA = Math.min(half.get(link.from) ?? 0, span / 2);
      const nearB = Math.min(half.get(link.to) ?? 0, span / 2);
      // 両方の外壁から等しく離れた所。重なっているときは真ん中
      const along = span < 1e-6 ? 0 : (nearA + (span - nearB)) / 2 / span;
      const road = layout.roads.roads.find((r) => r.id === `road:link:${link.id}`);
      return {
        id: link.id,
        at: { x: link.a.x + dx * along, z: link.a.z + dz * along },
        angle: Math.atan2(dx, dz),
        width: (road?.width ?? 4) + OVERHANG,
      };
    });
}
