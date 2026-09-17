import type { BuildingKind } from '@/content/city';
import type { MissionTrack } from '@/engines/lesson/types';

/**
 * 斜め見下ろし（等角投影）の描画の部品。面ごとの陰影と輪郭線で立体に見せる。
 */

export const TRACK_ACCENT: Record<MissionTrack, string> = {
  kernel: '#3f9a6e',
  git: '#e0703a',
  github: '#7a63d6',
  k8s: '#2f82d6',
  net: '#d9a52b',
};

/** 1 マスの幅と高さ（px）、高さ 1 あたりの px */
export const TW = 48;
export const TH = 24;
export const HU = 22;

/** 等角投影：マス座標（x, y, 高さ z）→ 地図上の px */
export function project(x: number, y: number, z = 0): { sx: number; sy: number } {
  return { sx: (x - y) * (TW / 2), sy: (x + y) * (TH / 2) - z * HU };
}

/** 地図上の px → 地面のマス座標 */
export function unproject(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TW / 2);
  const b = sy / (TH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/* ---------------- 色 ---------------- */

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const f = (c: number): number => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  // 16 進で返す（重ねて shade できるように）
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export const OUTLINE = 'rgba(38,42,52,0.55)';
export const CAR_COLORS = ['#d94f3d', '#f4f4f4', '#2f5d9a', '#2a2a2a', '#e3b33b', '#7a8c99', '#3e8c5a'];
export const pick = <T>(list: readonly T[], seed: number): T => list[seed % list.length] as T;

/* ---------------- 描画の部品 ---------------- */

export type Ctx = CanvasRenderingContext2D;

export function poly(ctx: Ctx, pts: readonly { sx: number; sy: number }[], fill: string, stroke: string | null = OUTLINE, width = 1): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.sx, p.sy);
    else ctx.lineTo(p.sx, p.sy);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke !== null) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

export function diamond(ctx: Ctx, x: number, y: number, fill: string, stroke: string | null = null, inset = 0): void {
  poly(
    ctx,
    [project(x + inset, y + inset), project(x + 1 - inset, y + inset), project(x + 1 - inset, y + 1 - inset), project(x + inset, y + 1 - inset)],
    fill,
    stroke,
  );
}

/** 箱。(x, y) から w×d マス、高さ z から h */
export function box(ctx: Ctx, x: number, y: number, w: number, d: number, h: number, color: string, z = 0): void {
  const P = (px: number, py: number, pz: number) => project(px, py, pz);
  // 左手前の面（y+d 側）
  poly(ctx, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], shade(color, -0.22));
  // 右手前の面（x+w 側）
  poly(ctx, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], shade(color, -0.08));
  // 上面
  poly(ctx, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], shade(color, 0.12));
}

/** 窓の帯（手前の 2 面に横線） */
export function windows(ctx: Ctx, x: number, y: number, w: number, d: number, h: number, step: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  for (let z = step; z < h - step * 0.4; z += step) {
    const a = project(x + 0.06, y + d, z);
    const b = project(x + w - 0.06, y + d, z);
    const c = project(x + w, y + d - 0.06, z);
    const e = project(x + w, y + 0.06, z);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.moveTo(c.sx, c.sy);
    ctx.lineTo(e.sx, e.sy);
    ctx.stroke();
  }
}

/** 切妻屋根。棟は x 方向 */
export function gable(ctx: Ctx, x: number, y: number, w: number, d: number, z: number, rise: number, color: string): void {
  const P = (px: number, py: number, pz: number) => project(px, py, pz);
  const mid = y + d / 2;
  // 奥の斜面の見える部分 → 手前の斜面 → 妻（x+w 側の三角）の順に重ねる
  poly(ctx, [P(x, y, z), P(x + w, y, z), P(x + w, mid, z + rise), P(x, mid, z + rise)], shade(color, 0.08));
  poly(ctx, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, mid, z + rise), P(x, mid, z + rise)], shade(color, -0.1));
  poly(ctx, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, mid, z + rise)], shade(color, -0.3));
}

/** 円柱（タンク・煙突） */
export function cylinder(ctx: Ctx, cx: number, cy: number, r: number, h: number, color: string, z = 0): void {
  const base = project(cx, cy, z);
  const top = project(cx, cy, z + h);
  const rx = r * TW * 0.72;
  const ry = r * TH * 0.72;
  ctx.beginPath();
  ctx.moveTo(base.sx - rx, base.sy);
  ctx.lineTo(top.sx - rx, top.sy);
  ctx.ellipse(top.sx, top.sy, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(base.sx + rx, base.sy);
  ctx.ellipse(base.sx, base.sy, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  const grad = ctx.createLinearGradient(base.sx - rx, 0, base.sx + rx, 0);
  grad.addColorStop(0, shade(color, -0.28));
  grad.addColorStop(0.6, shade(color, -0.02));
  grad.addColorStop(1, shade(color, -0.15));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(top.sx, top.sy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = shade(color, 0.18);
  ctx.fill();
  ctx.stroke();
}

export function tree(ctx: Ctx, x: number, y: number, seed: number, size = 1): void {
  const p = project(x, y);
  const s = size * (0.8 + (seed % 40) / 100);
  ctx.beginPath();
  ctx.ellipse(p.sx + 3 * s, p.sy + 1, 9 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30,50,20,0.28)';
  ctx.fill();
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(p.sx - 1.5 * s, p.sy - 9 * s, 3 * s, 9 * s);
  const hue = 100 + ((seed >>> 4) % 30);
  ctx.beginPath();
  ctx.arc(p.sx, p.sy - 15 * s, 9 * s, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${String(hue)}, 42%, ${String(30 + ((seed >>> 8) % 8))}%)`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,40,20,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.sx - 3 * s, p.sy - 18 * s, 4 * s, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${String(hue)}, 50%, 55%, 0.55)`;
  ctx.fill();
}

export function lamp(ctx: Ctx, x: number, y: number): void {
  const b = project(x, y);
  const t = project(x, y, 1.1);
  ctx.strokeStyle = '#3d4450';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(b.sx, b.sy);
  ctx.lineTo(t.sx, t.sy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(t.sx, t.sy, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = '#fff1b8';
  ctx.fill();
}

/* ---------------- 施設 ---------------- */

export function facilityBuilding(ctx: Ctx, kind: BuildingKind, accent: string, fx: number, fy: number, ratio: number, build: number): void {
  const k = Math.max(0.15, Math.min(1, build));
  const wall = '#f1ebdf';
  const glass = '#9cc3dc';
  // 広場
  box(ctx, fx + 0.05, fy + 0.05, 1.9, 1.9, 0.06, '#d9d0bd');
  const B = (x: number, y: number, w: number, d: number, h: number, color: string, z = 0) => {
    box(ctx, fx + x, fy + y, w, d, h * k, color, z * k);
  };
  switch (kind) {
    case 'hall':
    case 'library':
      B(0.25, 0.4, 1.5, 1.2, 1.0, kind === 'hall' ? wall : '#e9dfc8');
      if (k >= 1) {
        gable(ctx, fx + 0.2, fy + 0.35, 1.6, 1.3, 1.0, 0.45, accent);
        for (let i = 0; i < 5; i += 1) cylinder(ctx, fx + 0.35 + i * 0.3, fy + 1.72, 0.04, 0.8, '#ffffff');
      }
      break;
    case 'office':
    case 'castle':
      B(0.35, 0.35, 1.3, 1.3, 1.0, wall);
      B(0.55, 0.55, 0.9, 0.9, kind === 'castle' ? 2.6 : 3.2, glass, 1.0);
      if (k >= 1) {
        windows(ctx, fx + 0.55, fy + 0.55, 0.9, 0.9, (kind === 'castle' ? 2.6 : 3.2), 0.3, 'rgba(255,255,255,0.6)');
        box(ctx, fx + 0.5, fy + 0.5, 1.0, 1.0, 0.15, accent, 1.0 + (kind === 'castle' ? 2.6 : 3.2));
      }
      break;
    case 'house':
      B(0.35, 0.45, 1.3, 1.1, 0.9, wall);
      if (k >= 1) gable(ctx, fx + 0.3, fy + 0.4, 1.4, 1.2, 0.9, 0.55, accent);
      break;
    case 'warehouse':
      B(0.15, 0.35, 1.7, 1.3, 0.9, '#cfc6b2');
      if (k >= 1) gable(ctx, fx + 0.1, fy + 0.3, 1.8, 1.4, 0.9, 0.4, accent);
      break;
    case 'workshop':
    case 'factory':
      B(0.15, 0.5, 1.7, 1.2, 0.8, '#c3bba9');
      if (k >= 1) {
        for (let i = 0; i < 3; i += 1) gable(ctx, fx + 0.15 + i * 0.57, fy + 0.5, 0.57, 1.2, 0.8, 0.3, accent);
        cylinder(ctx, fx + 0.45, fy + 0.3, 0.1, 1.9, '#8d8a84');
        if (kind === 'factory') cylinder(ctx, fx + 0.85, fy + 0.3, 0.1, 2.2, accent);
      }
      break;
    case 'station':
      B(0.1, 0.8, 1.8, 0.7, 0.3, '#bdb8ae');
      B(0.5, 0.2, 1.0, 0.6, 1.0, wall);
      if (k >= 1) {
        box(ctx, fx + 0.1, fy + 0.75, 1.8, 0.8, 0.08, accent, 1.0);
        gable(ctx, fx + 0.45, fy + 0.15, 1.1, 0.7, 1.0, 0.35, accent);
      }
      break;
    case 'bridge':
      B(0.1, 0.8, 1.8, 0.45, 0.15, '#9c9a94', 0.7);
      if (k >= 1) {
        for (const x of [0.2, 1.7]) box(ctx, fx + x, fy + 0.85, 0.12, 0.35, 1.6, accent);
        box(ctx, fx + 0.2, fy + 0.85, 1.62, 0.35, 0.12, accent, 1.6);
      }
      break;
    case 'tower':
      B(0.2, 1.0, 0.8, 0.7, 0.7, wall);
      if (k >= 1) {
        cylinder(ctx, fx + 1.3, fy + 0.8, 0.14, 3.6, '#d8dde2');
        cylinder(ctx, fx + 1.3, fy + 0.8, 0.22, 0.25, accent, 3.6);
      } else {
        cylinder(ctx, fx + 1.3, fy + 0.8, 0.14, 3.6 * k, '#d8dde2');
      }
      break;
    case 'post':
      B(0.3, 0.4, 1.4, 1.2, 0.95, wall);
      if (k >= 1) {
        box(ctx, fx + 0.25, fy + 0.35, 1.5, 1.3, 0.14, '#c8453a', 0.95);
        box(ctx, fx + 1.75, fy + 1.5, 0.08, 0.08, 1.7, '#888888');
        box(ctx, fx + 1.83, fy + 1.5, 0.35, 0.03, 0.22, accent, 1.45);
      }
      break;
    case 'gate':
      B(0.2, 0.8, 0.3, 0.4, 1.5, wall);
      B(1.5, 0.8, 0.3, 0.4, 1.5, wall);
      if (k >= 1) box(ctx, fx + 0.2, fy + 0.8, 1.6, 0.4, 0.3, accent, 1.5);
      B(0.7, 0.1, 0.6, 0.5, 0.7, glass);
      break;
    case 'farm':
      box(ctx, fx + 0.1, fy + 0.1, 1.2, 1.8, 0.05, '#8fbf4a');
      cylinder(ctx, fx + 1.55, fy + 0.5, 0.25, 1.4 * k, wall);
      if (k >= 1) cylinder(ctx, fx + 1.55, fy + 0.5, 0.27, 0.15, accent, 1.4);
      break;
    case 'lab':
      B(0.3, 0.4, 1.4, 1.2, 0.9, '#f5f5f2');
      if (k >= 1) {
        box(ctx, fx + 0.28, fy + 0.38, 1.44, 1.24, 0.12, accent, 0.45);
        cylinder(ctx, fx + 1.0, fy + 1.0, 0.38, 0.35, glass, 0.9);
      }
      break;
  }
  if (build < 1) {
    // 工事中：足場とクレーン
    ctx.strokeStyle = '#e0a526';
    ctx.lineWidth = 1.5;
    for (const [x, y] of [
      [0.2, 0.2],
      [1.8, 0.2],
      [1.8, 1.8],
      [0.2, 1.8],
    ] as const) {
      const a = project(fx + x, fy + y);
      const b = project(fx + x, fy + y, 1.6);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }
    const m0 = project(fx + 1.85, fy + 0.15);
    const m1 = project(fx + 1.85, fy + 0.15, 3.4);
    const j1 = project(fx + 0.2, fy + 0.15, 3.4);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(m0.sx, m0.sy);
    ctx.lineTo(m1.sx, m1.sy);
    ctx.lineTo(j1.sx, j1.sy);
    ctx.stroke();
    ctx.lineWidth = 1;
    const hook = project(fx + 0.9, fy + 0.15, 3.4);
    const load = project(fx + 0.9, fy + 0.15, 1.2 + 1.6 * k);
    ctx.beginPath();
    ctx.moveTo(hook.sx, hook.sy);
    ctx.lineTo(load.sx, load.sy);
    ctx.stroke();
  } else if (ratio >= 1) {
    const p = project(fx + 1, fy + 1, 4.2);
    ctx.font = '700 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd24a';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeText('★', p.sx, p.sy);
    ctx.fillText('★', p.sx, p.sy);
  }
}
