import { city, hud, mix, rgbaOf, shade } from '@/ui/tokens';
import type { Part, Poly, Shape, V3 } from './mesh';
import { box, groundPoly, part, rod } from './shapes';

/**
 * 施設の模型で共有する道具（src/city/generate/facilities/*.ts）。
 */

export const NAVY = rgbaOf(hud.bg, 1);

/** 場所ごとに決まる 0〜1 の値（窓の灯りの揺らぎ） */
export const noiseOf = (seed: number) => (a: number, b: number, c: number): number => {
  const v = Math.sin(seed * 12.9898 + a * 78.233 + b * 37.719 + c * 11.131) * 43758.5453;
  return v - Math.floor(v);
};

/** 半球の屋根（緯度ごとの輪を四角形でつないだ凸な立体） */
export function dome(cx: number, cy: number, r: number, z0: number, color: string, sides = 16, rings = 5): Part {
  const shapes: Shape[] = [];
  const ring = (k: number): V3[] => {
    const phi = (k / rings) * (Math.PI / 2);
    const rr = r * Math.cos(phi);
    const z = z0 + r * Math.sin(phi);
    return Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z] as V3;
    });
  };
  for (let k = 0; k < rings - 1; k += 1) {
    const lo = ring(k);
    const hi = ring(k + 1);
    for (let i = 0; i < sides; i += 1) {
      const j = (i + 1) % sides;
      shapes.push({ kind: 'poly', pts: [lo[i] as V3, lo[j] as V3, hi[j] as V3, hi[i] as V3], color });
    }
  }
  const top = ring(rings - 1);
  shapes.push({ kind: 'poly', pts: top, color: mix(color, city.lineWhite, 0.2) });
  return part(shapes, [cx - r, cy - r, z0], [cx + r, cy + r, z0 + r]);
}

/** 地面に貼る楕円（池・植え込みの縁） */
export function groundEllipse(cx: number, cy: number, rx: number, ry: number, color: string, n = 20): Poly {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return groundPoly(pts, color);
}

/** ベンチ（座面と脚）。向きは x か y に沿う */
export function bench(x: number, y: number, along: 'x' | 'y'): Part[] {
  const seat = mix(city.roofTile, city.sand, 0.4);
  const l = 0.18;
  const w = 0.06;
  const b = along === 'x' ? { x0: x, y0: y, x1: x + l, y1: y + w } : { x0: x, y0: y, x1: x + w, y1: y + l };
  return [box({ ...b, z0: 0.045, z1: 0.065, wall: seat }), box({ ...b, x1: b.x0 + 0.02, y1: b.y0 + 0.02, z0: 0, z1: 0.045, wall: city.curb })];
}

/** 低い塀（敷地の囲い）。a から b まで */
export function lowWall(a: [number, number], b: [number, number], h: number, color: string, t = 0.05): Part {
  const x0 = Math.min(a[0], b[0]) - (a[0] === b[0] ? t / 2 : 0);
  const x1 = Math.max(a[0], b[0]) + (a[0] === b[0] ? t / 2 : 0);
  const y0 = Math.min(a[1], b[1]) - (a[1] === b[1] ? t / 2 : 0);
  const y1 = Math.max(a[1], b[1]) + (a[1] === b[1] ? t / 2 : 0);
  return box({ x0, y0, z0: 0, x1, y1, z1: h, wall: color, top: mix(color, city.lineWhite, 0.25) });
}

/** 面の上の縦の桟（ガラスの壁の目地）。side は +x か +y */
export function mullions(b: { x0: number; y0: number; x1: number; y1: number }, side: '+x' | '+y', z0: number, z1: number, pitch: number, color: string): Poly[] {
  const out: Poly[] = [];
  const len = side === '+x' ? b.y1 - b.y0 : b.x1 - b.x0;
  const n = Math.max(1, Math.round(len / pitch));
  for (let i = 1; i < n; i += 1) {
    const u = (len * i) / n;
    const w = 0.012;
    out.push(side === '+x'
      ? { kind: 'poly', pts: [[b.x1 + 0.008, b.y0 + u - w, z0], [b.x1 + 0.008, b.y0 + u + w, z0], [b.x1 + 0.008, b.y0 + u + w, z1], [b.x1 + 0.008, b.y0 + u - w, z1]], color, layer: 3 }
      : { kind: 'poly', pts: [[b.x1 - u + w, b.y1 + 0.008, z0], [b.x1 - u - w, b.y1 + 0.008, z0], [b.x1 - u - w, b.y1 + 0.008, z1], [b.x1 - u + w, b.y1 + 0.008, z1]], color, layer: 3 });
  }
  return out;
}

/** 横の帯（階の境・差し色の帯）。+x と +y の面に貼る */
export function band(b: { x0: number; y0: number; x1: number; y1: number }, z0: number, z1: number, color: string, layer = 1): Poly[] {
  return [
    { kind: 'poly', pts: [[b.x1 + 0.006, b.y0, z0], [b.x1 + 0.006, b.y1, z0], [b.x1 + 0.006, b.y1, z1], [b.x1 + 0.006, b.y0, z1]], color, layer },
    { kind: 'poly', pts: [[b.x1, b.y1 + 0.006, z0], [b.x0, b.y1 + 0.006, z0], [b.x0, b.y1 + 0.006, z1], [b.x1, b.y1 + 0.006, z1]], color, layer },
  ];
}

/** パラボラアンテナ（柱と皿） */
export function dish(x: number, y: number, z: number, r: number): Part[] {
  return [
    rod([x, y, z], [x, y, z + r * 1.1], 0.02, city.curb),
    part([
      { kind: 'blob', center: [x + r * 0.15, y + r * 0.15, z + r * 1.35], r, squash: 0.55, color: mix(city.lineWhite, city.wallStone, 0.3) },
      { kind: 'blob', center: [x + r * 0.2, y + r * 0.2, z + r * 1.38], r: r * 0.7, squash: 0.5, color: shade(city.wallStone, 0.8), layer: 1 },
    ], [x - r, y - r, z + r * 0.9], [x + r, y + r, z + r * 1.8]),
  ];
}

/** 大きなシャッター（横縞）。+y の面に貼る */
export function shutter(b: { x0: number; y0: number; x1: number; y1: number }, u0: number, u1: number, h: number, color: string): Part {
  const shapes: Poly[] = [];
  const rows = Math.max(3, Math.round(h / 0.045));
  for (let i = 0; i < rows; i += 1) {
    const z0 = 0.01 + (i * (h - 0.01)) / rows;
    const z1 = z0 + ((h - 0.01) / rows) * 0.8;
    shapes.push({ kind: 'poly', pts: [[b.x1 - u0, b.y1 + 0.007, z0], [b.x1 - u1, b.y1 + 0.007, z0], [b.x1 - u1, b.y1 + 0.007, z1], [b.x1 - u0, b.y1 + 0.007, z1]], color: i % 2 ? shade(color, 0.92) : color, layer: 1 });
  }
  return part(shapes, [b.x1 - u1, b.y1, 0], [b.x1 - u0, b.y1 + 0.01, h]);
}

/** 部品を高さ dz だけ持ち上げる（屋上の木・植え込み） */
export function lift(p: Part, dz: number): Part {
  const up = (v: V3): V3 => [v[0], v[1], v[2] + dz];
  const shapes: Shape[] = p.shapes.map((s) => (s.kind === 'poly' ? { ...s, pts: s.pts.map(up) } : { ...s, center: up(s.center) }));
  return part(shapes, up(p.min), up(p.max));
}

/** 太陽光の板（傾いた板と、細い桟）。x0..x1 × y0..y1 の屋上に、南（+y）へ傾けて並べる */
export function solarPanels(x0: number, y0: number, x1: number, y1: number, z: number, rows: number): Part[] {
  const out: Part[] = [];
  const depth = (y1 - y0) / rows;
  const panel = mix(city.wallGlass, NAVY, 0.55);
  for (let r = 0; r < rows; r += 1) {
    const ya = y0 + r * depth + depth * 0.15;
    const yb = ya + depth * 0.7;
    out.push(part([
      { kind: 'poly', pts: [[x1, yb, z + 0.02], [x0, yb, z + 0.02], [x0, ya, z + 0.09], [x1, ya, z + 0.09]], color: panel, double: true },
      { kind: 'poly', pts: [[x1, (ya + yb) / 2 + 0.004, z + 0.06], [x0, (ya + yb) / 2 + 0.004, z + 0.06], [x0, (ya + yb) / 2, z + 0.065], [x1, (ya + yb) / 2, z + 0.065]], color: mix(panel, city.lineWhite, 0.4), layer: 1, double: true },
    ], [x0, ya, z], [x1, yb, z + 0.09]));
  }
  return out;
}

/** 屋上や塔の頂の、分野の色で光る標識灯 */
export function beacon(x: number, y: number, z: number, color: string): Part {
  return part([
    { kind: 'blob', center: [x, y, z + 0.03], r: 0.035, squash: 0.8, color, lit: true },
    { kind: 'blob', center: [x - 0.006, y - 0.006, z + 0.04], r: 0.015, squash: 0.8, color: mix(color, city.lineWhite, 0.6), lit: true, layer: 1 },
  ], [x - 0.035, y - 0.035, z], [x + 0.035, y + 0.035, z + 0.07]);
}
