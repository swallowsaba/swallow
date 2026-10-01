import { city, mix, shade } from '@/ui/tokens';
import type { Part, Poly, Shape, V3 } from './mesh';

/**
 * 建物の部品（凸な立体）を作る道具。
 * 全て敷地の座標（マス）で、x・y は地面、z は高さ。色は tokens から引いた色を渡す。
 */

export interface BoxSpec {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  /** 側面の色 */
  wall: string;
  /** 上面の色（省くと側面と同じ） */
  top?: string;
}

/** 4 つの側面と上面を持つ箱 */
export function boxShapes(b: BoxSpec): Poly[] {
  const { x0, y0, z0, x1, y1, z1 } = b;
  const top = b.top ?? b.wall;
  return [
    // 法線が外を向くように、外から見て反時計回り
    { kind: 'poly', pts: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], color: b.wall }, // +x
    { kind: 'poly', pts: [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], color: b.wall }, // +y
    { kind: 'poly', pts: [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], color: b.wall }, // -x
    { kind: 'poly', pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], color: b.wall }, // -y
    { kind: 'poly', pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], color: top },
  ];
}

export function part(shapes: Shape[], min: V3, max: V3): Part {
  return { shapes, min, max };
}

export function box(b: BoxSpec, extra: Shape[] = []): Part {
  return part([...boxShapes(b), ...extra], [b.x0, b.y0, b.z0], [b.x1, b.y1, b.z1]);
}

/* ---------- 屋根 ---------- */

export interface GableSpec {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 軒の高さ */
  z: number;
  /** 棟までの高さ */
  rise: number;
  /** 棟の向き */
  ridge: 'x' | 'y';
  roof: string;
  /** 妻壁の色 */
  wall: string;
  /** 軒の出 */
  eave?: number;
}

/** 切妻屋根（2 面の勾配と 2 つの妻壁） */
export function gableRoof(g: GableSpec): Part {
  const e = g.eave ?? 0.08;
  const top = g.z + g.rise;
  const shapes: Shape[] = [];
  if (g.ridge === 'x') {
    const my = (g.y0 + g.y1) / 2;
    const xa = g.x0 - e;
    const xb = g.x1 + e;
    shapes.push(
      { kind: 'poly', pts: [[xa, g.y0 - e, g.z - e * 0.6], [xb, g.y0 - e, g.z - e * 0.6], [xb, my, top], [xa, my, top]], color: g.roof },
      { kind: 'poly', pts: [[xb, g.y1 + e, g.z - e * 0.6], [xa, g.y1 + e, g.z - e * 0.6], [xa, my, top], [xb, my, top]], color: g.roof },
      { kind: 'poly', pts: [[g.x1, g.y0, g.z], [g.x1, g.y1, g.z], [g.x1, my, top - e * 0.5]], color: g.wall },
      { kind: 'poly', pts: [[g.x0, g.y1, g.z], [g.x0, g.y0, g.z], [g.x0, my, top - e * 0.5]], color: g.wall },
    );
  } else {
    const mx = (g.x0 + g.x1) / 2;
    const ya = g.y0 - e;
    const yb = g.y1 + e;
    shapes.push(
      { kind: 'poly', pts: [[g.x0 - e, yb, g.z - e * 0.6], [g.x0 - e, ya, g.z - e * 0.6], [mx, ya, top], [mx, yb, top]], color: g.roof },
      { kind: 'poly', pts: [[g.x1 + e, ya, g.z - e * 0.6], [g.x1 + e, yb, g.z - e * 0.6], [mx, yb, top], [mx, ya, top]], color: g.roof },
      { kind: 'poly', pts: [[g.x1, g.y1, g.z], [g.x0, g.y1, g.z], [mx, g.y1, top - e * 0.5]], color: g.wall },
      { kind: 'poly', pts: [[g.x0, g.y0, g.z], [g.x1, g.y0, g.z], [mx, g.y0, top - e * 0.5]], color: g.wall },
    );
  }
  // 屋根の筋（瓦の段）。勾配の面に沿った細い帯
  const lines = roofLines(g, e, top);
  return part([...shapes, ...lines], [g.x0 - e, g.y0 - e, g.z - e], [g.x1 + e, g.y1 + e, top]);
}

function roofLines(g: GableSpec, e: number, top: number): Shape[] {
  const out: Shape[] = [];
  const dark = shade(g.roof, 0.82);
  const steps = 3;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / (steps + 1);
    const z = g.z - e * 0.6 + (top - (g.z - e * 0.6)) * t;
    const th = 0.012;
    if (g.ridge === 'x') {
      const my = (g.y0 + g.y1) / 2;
      const yf = g.y1 + e + (my - (g.y1 + e)) * t;
      const yb = g.y0 - e + (my - (g.y0 - e)) * t;
      out.push({ kind: 'poly', pts: [[g.x1 + e, yf, z], [g.x0 - e, yf, z], [g.x0 - e, yf - th, z + th], [g.x1 + e, yf - th, z + th]], color: dark, layer: 1, double: true });
      out.push({ kind: 'poly', pts: [[g.x0 - e, yb, z], [g.x1 + e, yb, z], [g.x1 + e, yb + th, z + th], [g.x0 - e, yb + th, z + th]], color: dark, layer: 1 });
    } else {
      const mx = (g.x0 + g.x1) / 2;
      const xf = g.x1 + e + (mx - (g.x1 + e)) * t;
      const xb = g.x0 - e + (mx - (g.x0 - e)) * t;
      out.push({ kind: 'poly', pts: [[xf, g.y0 - e, z], [xf, g.y1 + e, z], [xf - th, g.y1 + e, z + th], [xf - th, g.y0 - e, z + th]], color: dark, layer: 1, double: true });
      out.push({ kind: 'poly', pts: [[xb, g.y1 + e, z], [xb, g.y0 - e, z], [xb + th, g.y0 - e, z + th], [xb + th, g.y1 + e, z + th]], color: dark, layer: 1 });
    }
  }
  return out;
}

/** 寄棟屋根（4 面の勾配） */
export function hipRoof(x0: number, y0: number, x1: number, y1: number, z: number, rise: number, roof: string, eave = 0.08): Part {
  const xa = x0 - eave, xb = x1 + eave, ya = y0 - eave, yb = y1 + eave;
  const zl = z - eave * 0.5;
  const top = z + rise;
  const w = xb - xa;
  const d = yb - ya;
  const inset = Math.min(w, d) / 2;
  const r0: V3 = w >= d ? [xa + inset, (ya + yb) / 2, top] : [(xa + xb) / 2, ya + inset, top];
  const r1: V3 = w >= d ? [xb - inset, (ya + yb) / 2, top] : [(xa + xb) / 2, yb - inset, top];
  const shapes: Shape[] = w >= d
    ? [
        { kind: 'poly', pts: [[xa, ya, zl], [xb, ya, zl], r1, r0], color: roof },
        { kind: 'poly', pts: [[xb, yb, zl], [xa, yb, zl], r0, r1], color: roof },
        { kind: 'poly', pts: [[xb, ya, zl], [xb, yb, zl], r1], color: roof },
        { kind: 'poly', pts: [[xa, yb, zl], [xa, ya, zl], r0], color: roof },
      ]
    : [
        { kind: 'poly', pts: [[xb, ya, zl], [xb, yb, zl], r1, r0], color: roof },
        { kind: 'poly', pts: [[xa, yb, zl], [xa, ya, zl], r0, r1], color: roof },
        { kind: 'poly', pts: [[xb, yb, zl], [xa, yb, zl], r1], color: roof },
        { kind: 'poly', pts: [[xa, ya, zl], [xb, ya, zl], r0], color: roof },
      ];
  return part(shapes, [xa, ya, zl], [xb, yb, top]);
}

/** 平屋根の縁（パラペット）。4 本の細い箱 */
export function parapet(x0: number, y0: number, x1: number, y1: number, z: number, h: number, color: string, t = 0.05): Part[] {
  const top = mix(color, city.lineWhite, 0.25);
  return [
    box({ x0, y0, z0: z, x1, y1: y0 + t, z1: z + h, wall: color, top }),
    box({ x0, y0: y1 - t, z0: z, x1, y1, z1: z + h, wall: color, top }),
    box({ x0, y0: y0 + t, z0: z, x1: x0 + t, y1: y1 - t, z1: z + h, wall: color, top }),
    box({ x0: x1 - t, y0: y0 + t, z0: z, x1, y1: y1 - t, z1: z + h, wall: color, top }),
  ];
}

/* ---------- 窓・扉 ---------- */

export type Side = '+x' | '-x' | '+y' | '-y';

/** 面の上の矩形（u は面に沿う向き、v は高さ）を、面から少し浮かせた多角形にする */
export function onFace(b: { x0: number; y0: number; x1: number; y1: number }, side: Side, u0: number, u1: number, v0: number, v1: number, out = 0.006): V3[] {
  switch (side) {
    case '+x':
      return [[b.x1 + out, b.y0 + u0, v0], [b.x1 + out, b.y0 + u1, v0], [b.x1 + out, b.y0 + u1, v1], [b.x1 + out, b.y0 + u0, v1]];
    case '-x':
      return [[b.x0 - out, b.y1 - u0, v0], [b.x0 - out, b.y1 - u1, v0], [b.x0 - out, b.y1 - u1, v1], [b.x0 - out, b.y1 - u0, v1]];
    case '+y':
      return [[b.x1 - u0, b.y1 + out, v0], [b.x1 - u1, b.y1 + out, v0], [b.x1 - u1, b.y1 + out, v1], [b.x1 - u0, b.y1 + out, v1]];
    case '-y':
      return [[b.x0 + u0, b.y0 - out, v0], [b.x0 + u1, b.y0 - out, v0], [b.x0 + u1, b.y0 - out, v1], [b.x0 + u0, b.y0 - out, v1]];
  }
}

export function faceLength(b: { x0: number; y0: number; x1: number; y1: number }, side: Side): number {
  return side === '+x' || side === '-x' ? b.y1 - b.y0 : b.x1 - b.x0;
}

export interface WindowSpec {
  /** 階の高さ */
  floor: number;
  /** 下から何階分に窓を付けるか */
  floors: number;
  /** 1 階の床の高さ */
  base: number;
  /** 窓の幅と、面に沿った間隔 */
  width: number;
  pitch: number;
  /** 窓の高さ（階の高さに対する比） */
  height: number;
  /** 灯りの割合（0.3〜0.5）。docs/visual-design.md 5 章 */
  litRatio: number;
  /** 0〜1 を返す、場所ごとに決まる値 */
  noise: (a: number, b: number, c: number) => number;
  glass?: string;
  /** 窓の枠（窓より一回り大きい暗い板） */
  frame?: string;
  /** 窓を付けない区間（扉など）。面に沿った範囲 */
  skip?: { side: Side; u0: number; u1: number; floor: number }[];
}

const SIDES: Side[] = ['+x', '-x', '+y', '-y'];

/** 箱の 4 面に、面の傾きに沿った窓を並べる */
export function windows(b: { x0: number; y0: number; x1: number; y1: number }, spec: WindowSpec): Shape[] {
  const out: Shape[] = [];
  const glass = spec.glass ?? city.wallGlass;
  SIDES.forEach((side, si) => {
    const len = faceLength(b, side);
    const count = Math.max(1, Math.floor((len - 0.1) / spec.pitch));
    const margin = (len - count * spec.pitch) / 2;
    for (let f = 0; f < spec.floors; f += 1) {
      const v0 = spec.base + f * spec.floor + spec.floor * (1 - spec.height) * 0.55;
      const v1 = v0 + spec.floor * spec.height;
      for (let i = 0; i < count; i += 1) {
        const u0 = margin + i * spec.pitch + (spec.pitch - spec.width) / 2;
        const u1 = u0 + spec.width;
        if (spec.skip?.some((s) => s.side === side && s.floor === f && u1 > s.u0 && u0 < s.u1)) continue;
        const lit = spec.noise(si, f, i) < spec.litRatio;
        if (spec.frame) out.push({ kind: 'poly', pts: onFace(b, side, u0 - 0.018, u1 + 0.018, v0 - 0.02, v1 + 0.02, 0.004), color: spec.frame, layer: 1 });
        const reflect = mix(glass, city.lineWhite, 0.09 * Math.floor(spec.noise(si + 7, f, i) * 3));
        out.push({ kind: 'poly', pts: onFace(b, side, u0, u1, v0, v1), color: lit ? city.windowLit : reflect, lit, layer: 2 });
        // 反射の斜めの筋（灯りの無い窓だけ）
        if (!lit && spec.width > 0.1) {
          const m = (u0 + u1) / 2;
          out.push({ kind: 'poly', pts: onFace(b, side, u0 + 0.02, m, v1 - (v1 - v0) * 0.45, v1 - 0.02, 0.008), color: mix(reflect, city.lineWhite, 0.35), layer: 3 });
        }
      }
    }
  });
  return out;
}

/** 扉（暗い板と、上の庇） */
export function door(b: { x0: number; y0: number; x1: number; y1: number }, side: Side, u: number, width: number, height: number, color: string, canopy: string): Part[] {
  const panel: Shape = { kind: 'poly', pts: onFace(b, side, u, u + width, 0, height), color, layer: 1 };
  const glassPane: Shape = { kind: 'poly', pts: onFace(b, side, u + width * 0.18, u + width * 0.82, height * 0.35, height * 0.9, 0.009), color: mix(color, city.wallGlass, 0.45), layer: 2 };
  const depth = 0.12;
  const z = height + 0.03;
  let c: BoxSpec;
  switch (side) {
    case '+x': c = { x0: b.x1, y0: b.y0 + u - 0.05, z0: z, x1: b.x1 + depth, y1: b.y0 + u + width + 0.05, z1: z + 0.035, wall: canopy }; break;
    case '-x': c = { x0: b.x0 - depth, y0: b.y1 - u - width - 0.05, z0: z, x1: b.x0, y1: b.y1 - u + 0.05, z1: z + 0.035, wall: canopy }; break;
    case '+y': c = { x0: b.x1 - u - width - 0.05, y0: b.y1, z0: z, x1: b.x1 - u + 0.05, y1: b.y1 + depth, z1: z + 0.035, wall: canopy }; break;
    case '-y': c = { x0: b.x0 + u - 0.05, y0: b.y0 - depth, z0: z, x1: b.x0 + u + width + 0.05, y1: b.y0, z1: z + 0.035, wall: canopy }; break;
  }
  return [
    // 扉は壁に貼る板。壁の部品と同じ場所の薄い部品にして、壁の後に描かせる
    part([panel, glassPane], [Math.min(...panel.pts.map((p) => p[0])), Math.min(...panel.pts.map((p) => p[1])), 0], [Math.max(...panel.pts.map((p) => p[0])), Math.max(...panel.pts.map((p) => p[1])), height]),
    box(c),
  ];
}

/* ---------- 周辺の物 ---------- */

/** 広葉樹（幹と、3 段の明るさの葉の塊） */
export function broadleafTree(x: number, y: number, scale: number, variant: number): Part {
  const h = 0.28 * scale;
  const r = 0.26 * scale;
  const leaf = [city.tree1, city.tree2, city.tree3];
  const base = leaf[variant % 3] as string;
  const trunk = mix(city.roofTile, city.groundSide, 0.55);
  const t = 0.035 * scale;
  return part(
    [
      ...boxShapes({ x0: x - t, y0: y - t, z0: 0, x1: x + t, y1: y + t, z1: h, wall: trunk }),
      { kind: 'blob', center: [x, y, h + r * 0.75], r, color: shade(base, 0.8) },
      { kind: 'blob', center: [x - r * 0.25, y + r * 0.1, h + r * 1.05], r: r * 0.78, color: base },
      { kind: 'blob', center: [x - r * 0.35, y - r * 0.05, h + r * 1.35], r: r * 0.48, color: mix(base, city.grass, 0.35) },
      { kind: 'blob', center: [x - r * 0.42, y - r * 0.1, h + r * 1.52], r: r * 0.22, color: mix(base, city.sand, 0.25) },
    ],
    [x - r, y - r, 0],
    [x + r, y + r, h + r * 2],
  );
}

/** 針葉樹（3 段の円錐を、左右の明るさを変えた板で描く） */
export function conifer(x: number, y: number, scale: number): Part {
  const shapes: Shape[] = [];
  const trunk = mix(city.roofTile, city.groundSide, 0.55);
  const t = 0.03 * scale;
  shapes.push(...boxShapes({ x0: x - t, y0: y - t, z0: 0, x1: x + t, y1: y + t, z1: 0.16 * scale, wall: trunk }));
  const tiers = 3;
  for (let i = 0; i < tiers; i += 1) {
    const z0 = (0.12 + i * 0.2) * scale;
    const r = (0.24 - i * 0.055) * scale;
    const apex: V3 = [x, y, z0 + 0.36 * scale];
    // 見る人に向いた 2 面（左は明るく、右は暗く）と、奥の 2 面
    const ring: V3[] = [[x + r, y, z0], [x, y + r, z0], [x - r, y, z0], [x, y - r, z0]];
    for (let k = 0; k < 4; k += 1) {
      const a = ring[k] as V3;
      const b = ring[(k + 1) % 4] as V3;
      shapes.push({ kind: 'poly', pts: [a, b, apex], color: city.tree1 });
    }
  }
  return part(shapes, [x - 0.24 * scale, y - 0.24 * scale, 0], [x + 0.24 * scale, y + 0.24 * scale, 0.9 * scale]);
}

/** 植え込み（低い箱に葉の塊） */
export function hedge(x0: number, y0: number, x1: number, y1: number): Part {
  const shapes: Shape[] = [...boxShapes({ x0, y0, z0: 0, x1, y1, z1: 0.08, wall: shade(city.tree2, 0.9), top: city.tree3 })];
  const along = x1 - x0 > y1 - y0;
  const len = along ? x1 - x0 : y1 - y0;
  const n = Math.max(1, Math.round(len / 0.14));
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    const cx = along ? x0 + (x1 - x0) * t : (x0 + x1) / 2;
    const cy = along ? (y0 + y1) / 2 : y0 + (y1 - y0) * t;
    shapes.push({ kind: 'blob', center: [cx, cy, 0.1], r: 0.07, color: i % 2 ? city.tree2 : city.tree3, layer: 1 });
  }
  return part(shapes, [x0, y0, 0], [x1, y1, 0.16]);
}

/** 街灯（柱と腕と灯り） */
export function streetLamp(x: number, y: number, arm: Side): Part[] {
  const pole = mix(city.curb, city.lineWhite, 0.1);
  const h = 0.55;
  const t = 0.014;
  const dir: Record<Side, [number, number]> = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };
  const [dx, dy] = dir[arm];
  const ax = x + dx * 0.1;
  const ay = y + dy * 0.1;
  return [
    box({ x0: x - t, y0: y - t, z0: 0, x1: x + t, y1: y + t, z1: h, wall: pole }),
    box({ x0: Math.min(x, ax) - t, y0: Math.min(y, ay) - t, z0: h - 0.02, x1: Math.max(x, ax) + t, y1: Math.max(y, ay) + t, z1: h, wall: pole }),
    part([{ kind: 'blob', center: [ax, ay, h - 0.035], r: 0.03, squash: 0.7, color: city.windowLit, lit: true }], [ax - 0.03, ay - 0.03, h - 0.06], [ax + 0.03, ay + 0.03, h - 0.01]),
  ];
}

/** 屋上の空調機（箱と、上の丸いファン） */
export function rooftopUnit(x: number, y: number, z: number, s = 1): Part {
  const body = mix(city.wallStone, city.curb, 0.35);
  const w = 0.16 * s;
  return box({ x0: x, y0: y, z0: z, x1: x + w, y1: y + w * 0.8, z1: z + 0.09 * s, wall: body, top: mix(body, city.lineWhite, 0.2) }, [
    { kind: 'blob', center: [x + w / 2, y + w * 0.4, z + 0.092 * s], r: w * 0.32, squash: 0.5, color: shade(body, 0.55), layer: 1 },
  ]);
}

/** 看板（壁から突き出た薄い板と、自分で光る文字の帯） */
export function signBoard(b: { x0: number; y0: number; x1: number; y1: number }, side: Side, u0: number, u1: number, v0: number, v1: number, color: string): Part {
  const board: Shape = { kind: 'poly', pts: onFace(b, side, u0, u1, v0, v1, 0.012), color, layer: 1 };
  const strip: Shape = {
    kind: 'poly',
    pts: onFace(b, side, u0 + (u1 - u0) * 0.12, u1 - (u1 - u0) * 0.12, v0 + (v1 - v0) * 0.38, v0 + (v1 - v0) * 0.62, 0.016),
    color: mix(color, city.lineWhite, 0.75),
    lit: true,
    layer: 2,
  };
  const pts = board.kind === 'poly' ? board.pts : [];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return part([board, strip], [Math.min(...xs), Math.min(...ys), v0], [Math.max(...xs), Math.max(...ys), v1]);
}

/** 地面に貼る板（敷地の舗装・芝）。Model.ground に入れる */
export function pad(x0: number, y0: number, x1: number, y1: number, color: string): Poly {
  return { kind: 'poly', pts: [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], color };
}

/** 角柱（円柱の近似）。sides 面の側面と上面 */
export function prism(cx: number, cy: number, r: number, z0: number, z1: number, wall: string, top?: string, sides = 12): Part {
  const ring: [number, number][] = [];
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const shapes: Shape[] = [];
  for (let i = 0; i < sides; i += 1) {
    const [ax, ay] = ring[i] as [number, number];
    const [bx, by] = ring[(i + 1) % sides] as [number, number];
    shapes.push({ kind: 'poly', pts: [[ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]], color: wall });
  }
  shapes.push({ kind: 'poly', pts: ring.map(([x, y]) => [x, y, z1] as V3), color: top ?? wall });
  return part(shapes, [cx - r, cy - r, z0], [cx + r, cy + r, z1]);
}

/** 角錐台（下が r0、上が r1 の四角い塔の芯） */
export function frustum(cx: number, cy: number, r0: number, r1: number, z0: number, z1: number, wall: string, top?: string): Part {
  const lo: V3[] = [[cx + r0, cy - r0, z0], [cx + r0, cy + r0, z0], [cx - r0, cy + r0, z0], [cx - r0, cy - r0, z0]];
  const hi: V3[] = [[cx + r1, cy - r1, z1], [cx + r1, cy + r1, z1], [cx - r1, cy + r1, z1], [cx - r1, cy - r1, z1]];
  const shapes: Shape[] = [];
  for (let i = 0; i < 4; i += 1) {
    shapes.push({ kind: 'poly', pts: [lo[i] as V3, lo[(i + 1) % 4] as V3, hi[(i + 1) % 4] as V3, hi[i] as V3], color: wall });
  }
  if (r1 > 0) shapes.push({ kind: 'poly', pts: hi, color: top ?? wall });
  return part(shapes, [cx - r0, cy - r0, z0], [cx + r0, cy + r0, z1]);
}

/** 四角錐の屋根（塔の頂） */
export function pyramidRoof(x0: number, y0: number, x1: number, y1: number, z: number, rise: number, roof: string, eave = 0.04): Part {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const a: V3[] = [[x1 + eave, y0 - eave, z], [x1 + eave, y1 + eave, z], [x0 - eave, y1 + eave, z], [x0 - eave, y0 - eave, z]];
  const apex: V3 = [cx, cy, z + rise];
  const shapes: Shape[] = [];
  for (let i = 0; i < 4; i += 1) shapes.push({ kind: 'poly', pts: [a[i] as V3, a[(i + 1) % 4] as V3, apex], color: roof });
  return part(shapes, [x0 - eave, y0 - eave, z], [x1 + eave, y1 + eave, z + rise]);
}

/** 細い棒（2 点を結ぶ、断面が四角の棒）。鉄塔の部材・手すり・旗竿 */
export function rod(a: V3, b: V3, t: number, color: string, layer = 0): Part {
  // 棒の向きに直交する 2 本の軸
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const d: V3 = [dx / len, dy / len, dz / len];
  const ref: V3 = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(d, ref));
  const v = norm(cross(d, u));
  const h = t / 2;
  const corner = (p: V3, su: number, sv: number): V3 => [p[0] + (u[0] * su + v[0] * sv) * h, p[1] + (u[1] * su + v[1] * sv) * h, p[2] + (u[2] * su + v[2] * sv) * h];
  const quads: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const shapes: Shape[] = [];
  for (let i = 0; i < 4; i += 1) {
    const [su0, sv0] = quads[i] as [number, number];
    const [su1, sv1] = quads[(i + 1) % 4] as [number, number];
    shapes.push({ kind: 'poly', pts: [corner(a, su0, sv0), corner(a, su1, sv1), corner(b, su1, sv1), corner(b, su0, sv0)], color, layer, thin: t < 0.025 });
  }
  const xs = [a[0], b[0]], ys = [a[1], b[1]], zs = [a[2], b[2]];
  return part(shapes, [Math.min(...xs) - h, Math.min(...ys) - h, Math.min(...zs) - h], [Math.max(...xs) + h, Math.max(...ys) + h, Math.max(...zs) + h]);
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** 柵（細い柱と横木）。敷地の縁に沿って */
export function fence(a: [number, number], b: [number, number], h: number, color: string, gap = 0.18): Part[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / gap));
  const parts: Part[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    parts.push(rod([x, y, 0], [x, y, h], 0.014, color));
  }
  parts.push(rod([a[0], a[1], h * 0.85], [b[0], b[1], h * 0.85], 0.012, color));
  parts.push(rod([a[0], a[1], h * 0.4], [b[0], b[1], h * 0.4], 0.01, color));
  return parts;
}

/** 面に貼る円（時計の文字盤・丸い看板）。n 角形で近似する */
export function faceDisc(b: { x0: number; y0: number; x1: number; y1: number }, side: Side, uc: number, vc: number, r: number, color: string, layer = 1, n = 16, out = 0.008): Poly {
  const pts: V3[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const u = uc + Math.cos(a) * r;
    const v = vc + Math.sin(a) * r;
    const q = onFace(b, side, u, u, v, v, out)[0] as V3;
    pts.push(q);
  }
  // (u, v) を反時計回りに回るので、法線は onFace の面と同じ外向きになる
  return { kind: 'poly', pts, color, layer };
}

/** 地面に貼る多角形（運動場の線など） */
export function groundPoly(pts: [number, number][], color: string): Poly {
  return { kind: 'poly', pts: pts.map(([x, y]) => [x, y, 0] as V3), color };
}

/** 地面に貼る楕円の輪（トラックの白線） */
export function groundRing(cx: number, cy: number, rx: number, ry: number, width: number, color: string, n = 20): Poly[] {
  const out: Poly[] = [];
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    out.push(groundPoly([
      [cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry],
      [cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry],
      [cx + Math.cos(a1) * (rx - width), cy + Math.sin(a1) * (ry - width)],
      [cx + Math.cos(a0) * (rx - width), cy + Math.sin(a0) * (ry - width)],
    ], color));
  }
  return out;
}
