import type { BuildingKind } from '@/content/city';
import {
  applyTool, facilityRadius, hash, HIGHWAY_ROW, idx, SIZE, toolArea,
  type CityAnalysis, type CitySave, type FacilityInfo, type Point, type Tool, type ToolResult,
} from '@/engines/city/sim';
import type { MissionTrack } from '@/engines/lesson/types';

/**
 * 市長の街の地図。canvas に等角投影（斜め見下ろし）で描く 2D の街。
 * 面ごとの陰影と輪郭線で立体に見せる。動かない街は画面外の canvas に描いて使い回し、
 * 車・吹き出し・下見・看板だけを毎フレーム描く。
 */

export interface FacilityView {
  id: string;
  name: string;
  kind: BuildingKind;
  /** 稼働率 0..1（いま取り組んでいる手順の進みも含む） */
  ratio: number;
  /** 建物の出来上がり 0..1。最初の任務を終えると 1 */
  build: number;
}

export interface MapInput {
  track: MissionTrack;
  terrain: string;
  save: CitySave;
  analysis: CityAnalysis;
  facilities: readonly FacilityView[];
  infos: readonly FacilityInfo[];
}

export interface MapCallbacks {
  onApply: (from: Point, to: Point) => void;
  onInspect: (point: Point) => void;
  describe: (result: ToolResult, tool: Tool) => string;
}

export interface CityMap {
  update: (input: MapInput) => void;
  setTool: (tool: Tool, placing: string | null) => void;
  setSelected: (facilityId: string | null) => void;
  lookAt: (facilityId: string) => void;
  /** 施設（無ければ街の真ん中）の上に、浮かび上がる吹き出しを出す */
  effect: (facilityId: string | null, text: string, color: string) => void;
  zoomBy: (factor: number) => void;
  fit: () => void;
  dispose: () => void;
}

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
const HU = 22;
/** 街の外に描く野山のマス数 */
const MARGIN = 6;
const TOP_ROOM = 220;

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

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const f = (c: number): number => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  // 16 進で返す（重ねて shade できるように）
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const OUTLINE = 'rgba(38,42,52,0.55)';
const R_COLORS = ['#f2e4cf', '#e8c9a2', '#f4efe6', '#d9b48f', '#e6dccb'];
const R_ROOFS = ['#b5533c', '#7a4f3f', '#566577', '#9c3f33', '#c77b3e'];
const C_COLORS = ['#8fbbe0', '#a9c9e2', '#7fa6c8', '#b8cfe0'];
const I_COLORS = ['#c9bfa8', '#b7b3a8', '#d2c392', '#a9b0b3'];
const CAR_COLORS = ['#d94f3d', '#f4f4f4', '#2f5d9a', '#2a2a2a', '#e3b33b', '#7a8c99', '#3e8c5a'];
const pick = <T>(list: readonly T[], seed: number): T => list[seed % list.length] as T;

/* ---------------- 描画の部品 ---------------- */

type Ctx = CanvasRenderingContext2D;

function poly(ctx: Ctx, pts: readonly { sx: number; sy: number }[], fill: string, stroke: string | null = OUTLINE, width = 1): void {
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

function diamond(ctx: Ctx, x: number, y: number, fill: string, stroke: string | null = null, inset = 0): void {
  poly(
    ctx,
    [project(x + inset, y + inset), project(x + 1 - inset, y + inset), project(x + 1 - inset, y + 1 - inset), project(x + inset, y + 1 - inset)],
    fill,
    stroke,
  );
}

/** 箱。(x, y) から w×d マス、高さ z から h */
function box(ctx: Ctx, x: number, y: number, w: number, d: number, h: number, color: string, z = 0): void {
  const P = (px: number, py: number, pz: number) => project(px, py, pz);
  // 左手前の面（y+d 側）
  poly(ctx, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], shade(color, -0.22));
  // 右手前の面（x+w 側）
  poly(ctx, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], shade(color, -0.08));
  // 上面
  poly(ctx, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], shade(color, 0.12));
}

/** 窓の帯（手前の 2 面に横線） */
function windows(ctx: Ctx, x: number, y: number, w: number, d: number, h: number, step: number, color: string): void {
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
function gable(ctx: Ctx, x: number, y: number, w: number, d: number, z: number, rise: number, color: string): void {
  const P = (px: number, py: number, pz: number) => project(px, py, pz);
  const mid = y + d / 2;
  // 奥の斜面の見える部分 → 手前の斜面 → 妻（x+w 側の三角）の順に重ねる
  poly(ctx, [P(x, y, z), P(x + w, y, z), P(x + w, mid, z + rise), P(x, mid, z + rise)], shade(color, 0.08));
  poly(ctx, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, mid, z + rise), P(x, mid, z + rise)], shade(color, -0.1));
  poly(ctx, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, mid, z + rise)], shade(color, -0.3));
}

/** 円柱（タンク・煙突） */
function cylinder(ctx: Ctx, cx: number, cy: number, r: number, h: number, color: string, z = 0): void {
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

function tree(ctx: Ctx, x: number, y: number, seed: number, size = 1): void {
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

function lamp(ctx: Ctx, x: number, y: number): void {
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

/* ---------------- 建物 ---------------- */

function zoneBuilding(ctx: Ctx, tile: 'R' | 'C' | 'I', level: number, x: number, y: number, seed: number): void {
  const cx = x + 0.5;
  const cy = y + 0.5;
  const place = (w: number, d: number) => ({ bx: cx - w / 2, by: cy - d / 2 });
  if (tile === 'R') {
    const wall = pick(R_COLORS, seed);
    const roof = pick(R_ROOFS, seed >>> 3);
    if (level <= 2) {
      const w = level === 1 ? 0.52 : 0.68;
      const h = level === 1 ? 0.42 : 0.75;
      const { bx, by } = place(w, w);
      box(ctx, bx, by, w, w, h, wall);
      gable(ctx, bx - 0.04, by - 0.04, w + 0.08, w + 0.08, h, 0.35, roof);
      if (level === 1 && seed % 3 === 0) tree(ctx, x + 0.85, y + 0.85, seed, 0.6);
    } else {
      const w = 0.8;
      const h = level === 3 ? 2.1 : 3.8 + (seed % 10) / 10;
      const { bx, by } = place(w, w);
      box(ctx, bx, by, w, w, h, wall);
      windows(ctx, bx, by, w, w, h, 0.35, 'rgba(60,80,100,0.55)');
      box(ctx, bx + 0.15, by + 0.15, 0.5, 0.5, 0.12, shade(roof, -0.2), h);
    }
    return;
  }
  if (tile === 'C') {
    const color = pick(C_COLORS, seed);
    const heights = [0, 0.55, 1.3, 2.9, 5.2];
    const w = level === 1 ? 0.7 : 0.8;
    const h = (heights[level] ?? 1) * (0.9 + (seed % 20) / 100);
    const { bx, by } = place(w, w);
    box(ctx, bx, by, w, w, h, color);
    windows(ctx, bx, by, w, w, h, level <= 2 ? 0.3 : 0.28, 'rgba(255,255,255,0.55)');
    if (level === 1) box(ctx, bx, by + w, w, 0.1, 0.06, pick(['#e0703a', '#d94f3d', '#3e8c5a'], seed), 0.32);
    if (level >= 4) box(ctx, bx + 0.3, by + 0.3, 0.2, 0.2, 0.6, '#d8dde2', h);
    return;
  }
  const color = pick(I_COLORS, seed);
  const w = 0.86;
  const h = [0, 0.5, 0.65, 0.8, 1.0][level] ?? 0.6;
  const { bx, by } = place(w, w);
  box(ctx, bx, by, w, w, h, color);
  gable(ctx, bx, by, w, w, h, 0.22, shade(color, -0.25));
  if (level >= 2) cylinder(ctx, bx + 0.2, by + 0.2, 0.07, 0.9 + level * 0.25, '#8d8a84', h * 0.5);
  if (level >= 3) cylinder(ctx, cx + 0.3, cy - 0.25, 0.14, 0.45, '#d9dee2');
}

/** 施設の建物。2×2 マス。build が 1 未満なら工事中で、背が伸びていく */
function facilityBuilding(ctx: Ctx, kind: BuildingKind, accent: string, fx: number, fy: number, ratio: number, build: number): void {
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

/* ---------------- 動かない街を描く ---------------- */

export const STATIC_BOUNDS = (() => {
  const left = project(-MARGIN, SIZE + MARGIN).sx;
  const right = project(SIZE + MARGIN, -MARGIN).sx;
  const top = project(-MARGIN, -MARGIN).sy - TOP_ROOM;
  const bottom = project(SIZE + MARGIN, SIZE + MARGIN).sy;
  return { left, top, width: right - left, height: bottom - top };
})();

export function drawCity(ctx: Ctx, input: MapInput, zoneReach: boolean): void {
  const { terrain, save, analysis } = input;
  const tileAt = (x: number, y: number): string => (x >= 0 && y >= 0 && x < SIZE && y < SIZE ? save.tiles[idx(x, y)] ?? '.' : '');
  const isRoad = (x: number, y: number): boolean => tileAt(x, y) === 'r' || (y === HIGHWAY_ROW && x < 0);

  // 地面（街の外の野山も）
  for (let y = -MARGIN; y < SIZE + MARGIN; y += 1) {
    for (let x = -MARGIN; x < SIZE + MARGIN; x += 1) {
      const outside = x < 0 || y < 0 || x >= SIZE || y >= SIZE;
      const checker = (x + y) % 2 === 0;
      if (outside) {
        diamond(ctx, x, y, isRoad(x, y) ? '#6f757c' : checker ? '#5f9a43' : '#5a933f');
        continue;
      }
      const i = idx(x, y);
      const tile = save.tiles[i];
      let fill = checker ? '#76b24f' : '#6fab49';
      if (terrain[i] === 'w') fill = checker ? '#4c9bcb' : '#4896c6';
      if (tile === 'r') fill = '#80868d';
      else if (tile === 'p') fill = '#8ccc62';
      else if (tile === 'F') fill = '#d9d0bd';
      else if (tile === 'R' || tile === 'C' || tile === 'I') {
        const built = Number(save.levels[i]) > 0;
        fill = built ? '#cfc8b8' : tile === 'R' ? '#a5dd8a' : tile === 'C' ? '#9ccaf0' : '#f0dc86';
      }
      diamond(ctx, x, y, fill, tile === 'R' || tile === 'C' || tile === 'I' ? 'rgba(255,255,255,0.45)' : null, tile === 'R' || tile === 'C' || tile === 'I' ? 0.04 : 0);
      if (zoneReach && analysis.access[i] === 1 && tile === '.' && terrain[i] !== 'w') {
        diamond(ctx, x, y, 'rgba(255,255,255,0.22)');
      }
    }
  }
  // 街の境界
  poly(ctx, [project(0, 0), project(SIZE, 0), project(SIZE, SIZE), project(0, SIZE)], 'rgba(0,0,0,0)', 'rgba(255,255,255,0.35)', 2);

  // 道：中央線と縁石
  for (let y = -MARGIN; y < SIZE + MARGIN; y += 1) {
    for (let x = -MARGIN; x < SIZE + MARGIN; x += 1) {
      if (!isRoad(x, y)) continue;
      const c = project(x + 0.5, y + 0.5);
      const edges = [
        [1, 0, project(x + 1, y + 0.5)],
        [-1, 0, project(x, y + 0.5)],
        [0, 1, project(x + 0.5, y + 1)],
        [0, -1, project(x + 0.5, y)],
      ] as const;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      for (const [dx, dy, e] of edges) {
        if (!isRoad(x + dx, y + dy)) continue;
        ctx.beginPath();
        ctx.moveTo(c.sx, c.sy);
        ctx.lineTo(e.sx, e.sy);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = '#d9d3c4';
      ctx.lineWidth = 2;
      const corners = [project(x, y), project(x + 1, y), project(x + 1, y + 1), project(x, y + 1)];
      const sides: [number, number, number, number][] = [
        [0, -1, 0, 1],
        [1, 0, 1, 2],
        [0, 1, 2, 3],
        [-1, 0, 3, 0],
      ];
      for (const [dx, dy, a, b] of sides) {
        if (isRoad(x + dx, y + dy)) continue;
        const pa = corners[a];
        const pb = corners[b];
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(pa.sx, pa.sy);
        ctx.lineTo(pb.sx, pb.sy);
        ctx.stroke();
      }
    }
  }

  // 立っているもの。奥（x+y が小さい）から順に描く
  const items: { key: number; draw: () => void }[] = [];
  const accent = TRACK_ACCENT[input.track];
  for (let y = -MARGIN; y < SIZE + MARGIN; y += 1) {
    for (let x = -MARGIN; x < SIZE + MARGIN; x += 1) {
      const seed = hash(11, x, y);
      const outside = x < 0 || y < 0 || x >= SIZE || y >= SIZE;
      if (outside) {
        if (!isRoad(x, y) && seed % 5 === 0) items.push({ key: x + y + 0.5, draw: () => { tree(ctx, x + 0.5, y + 0.5, seed); } });
        continue;
      }
      const i = idx(x, y);
      const tile = save.tiles[i];
      if (tile === '.' && terrain[i] === 't') {
        const n = 1 + (seed % 3);
        for (let k = 0; k < n; k += 1) {
          const s = hash(seed, k);
          const tx = x + 0.25 + (s % 50) / 100;
          const ty = y + 0.25 + ((s >>> 7) % 50) / 100;
          items.push({ key: tx + ty, draw: () => { tree(ctx, tx, ty, s); } });
        }
      } else if (tile === 'p') {
        items.push({ key: x + y + 0.5, draw: () => {
          diamond(ctx, x, y, '#e8dcc0', null, 0.38);
          tree(ctx, x + 0.25, y + 0.3, seed, 0.9);
          tree(ctx, x + 0.75, y + 0.35, seed >>> 3, 0.8);
          tree(ctx, x + 0.4, y + 0.8, seed >>> 6, 0.85);
        } });
      } else if (tile === 'r') {
        const straight = (isRoad(x - 1, y) && isRoad(x + 1, y) && !isRoad(x, y - 1) && !isRoad(x, y + 1)) || (isRoad(x, y - 1) && isRoad(x, y + 1) && !isRoad(x - 1, y) && !isRoad(x + 1, y));
        if (straight && (x + y) % 3 === 0 && terrain[i] !== 'w') items.push({ key: x + y + 1, draw: () => { lamp(ctx, x + 0.95, y + 0.95); } });
      } else if (tile === 'R' || tile === 'C' || tile === 'I') {
        const level = Number(save.levels[i]);
        if (level > 0) items.push({ key: x + y + 1, draw: () => { zoneBuilding(ctx, tile, level, x, y, seed); } });
      }
    }
  }
  for (const placed of save.facilities) {
    const view = input.facilities.find((f) => f.id === placed.id);
    if (!view) continue;
    items.push({ key: placed.x + placed.y + 3, draw: () => { facilityBuilding(ctx, view.kind, accent, placed.x, placed.y, view.ratio, view.build); } });
  }
  items.sort((a, b) => a.key - b.key);
  for (const item of items) item.draw();
}

/* ---------------- 画面の地図 ---------------- */

interface Car {
  from: number;
  to: number;
  t: number;
  speed: number;
  step: number;
  color: string;
}

interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
}

export function createCityMap(host: HTMLElement, callbacks: MapCallbacks): CityMap {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  canvas.tabIndex = 0;
  host.appendChild(canvas);
  const ctxOrNull = canvas.getContext('2d');
  if (!ctxOrNull) throw new Error('canvas 2d is unavailable');
  const ctx: Ctx = ctxOrNull;

  const layer = document.createElement('canvas');
  const layerCtxOrNull = layer.getContext('2d');
  if (!layerCtxOrNull) throw new Error('canvas 2d is unavailable');
  const layerCtx: Ctx = layerCtxOrNull;
  let layerScale = 0;
  let layerDirty = true;

  let input: MapInput | null = null;
  let tool: Tool = 'inspect';
  let placing: string | null = null;
  let selected: string | null = null;
  let cars: Car[] = [];
  const pops: Pop[] = [];

  const view = { x: 0, y: 0, zoom: 1 };
  let userMoved = false;
  let width = 1;
  let height = 1;
  const dpr = (): number => Math.min(2, window.devicePixelRatio || 1);

  /** 触られるまでは、作ったところ（無ければ幹線道路の入口）が画面いっぱいに映るように寄せる */
  function fit(): void {
    let minX = 0;
    let minY = HIGHWAY_ROW - 4;
    let maxX = 10;
    let maxY = HIGHWAY_ROW + 4;
    if (input) {
      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          if (input.save.tiles[idx(x, y)] === '.') continue;
          minX = Math.min(minX, x - 3);
          minY = Math.min(minY, y - 3);
          maxX = Math.max(maxX, x + 4);
          maxY = Math.max(maxY, y + 4);
        }
      }
    }
    const spanX = Math.max(14, maxX - minX);
    const spanY = Math.max(14, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const w = (spanX + spanY) * (TW / 2);
    const h = (spanX + spanY) * (TH / 2) + 80;
    const zoom = Math.max(0.35, Math.min((width - 40) / w, (height - 230) / h, 1.8));
    view.zoom = zoom;
    const center = project(cx, cy, 1);
    view.x = width / 2 - center.sx * zoom;
    view.y = 110 + (height - 230) / 2 - center.sy * zoom;
  }

  function resize(): void {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    canvas.width = Math.round(width * dpr());
    canvas.height = Math.round(height * dpr());
    if (!userMoved) fit();
  }
  resize();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(host);

  function renderLayer(): void {
    if (!input) return;
    const scale = Math.max(0.5, Math.min(2, view.zoom * dpr()));
    layer.width = Math.ceil(STATIC_BOUNDS.width * scale);
    layer.height = Math.ceil(STATIC_BOUNDS.height * scale);
    layerCtx.setTransform(scale, 0, 0, scale, -STATIC_BOUNDS.left * scale, -STATIC_BOUNDS.top * scale);
    layerCtx.clearRect(STATIC_BOUNDS.left, STATIC_BOUNDS.top, STATIC_BOUNDS.width, STATIC_BOUNDS.height);
    drawCity(layerCtx, input, tool === 'res' || tool === 'com' || tool === 'ind');
    layerScale = scale;
    layerDirty = false;
  }
  let zoomTimer = 0;
  const scheduleSharpen = (): void => {
    window.clearTimeout(zoomTimer);
    zoomTimer = window.setTimeout(() => {
      layerDirty = true;
    }, 180);
  };

  /* ---------- 車 ---------- */
  function resetCars(): void {
    if (!input) return;
    const { save, analysis } = input;
    const roads: number[] = [];
    for (let i = 0; i < SIZE * SIZE; i += 1) if (analysis.connected[i] === 1) roads.push(i);
    const want = Math.min(70, Math.floor(roads.length / 2), 2 + Math.floor(analysis.population / 12));
    const next: Car[] = [];
    for (let k = 0; k < want; k += 1) {
      const old = cars[k];
      if (old && save.tiles[old.from] === 'r' && save.tiles[old.to] === 'r') {
        next.push(old);
        continue;
      }
      const from = roads[hash(k, 5) % Math.max(1, roads.length)] ?? idx(0, HIGHWAY_ROW);
      next.push({ from, to: from, t: 1, speed: 0.9 + (hash(k, 9) % 80) / 100, step: k * 31, color: pick(CAR_COLORS, hash(k, 3)) });
    }
    cars = next;
  }

  function drawCars(dt: number): void {
    if (!input) return;
    const tiles = input.save.tiles;
    for (const car of cars) {
      car.t += dt * car.speed;
      if (car.t >= 1) {
        const x = car.to % SIZE;
        const y = Math.floor(car.to / SIZE);
        const options = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
          .map(([dx = 0, dy = 0]) => ({ x: x + dx, y: y + dy }))
          .filter((p) => p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE && tiles[idx(p.x, p.y)] === 'r')
          .map((p) => idx(p.x, p.y));
        const forward = options.filter((o) => o !== car.from);
        const choices = forward.length > 0 ? forward : options;
        car.step += 1;
        car.from = car.to;
        car.to = choices[hash(car.step, car.to) % Math.max(1, choices.length)] ?? car.to;
        car.t = 0;
      }
      const ax = car.from % SIZE;
      const ay = Math.floor(car.from / SIZE);
      const bx = car.to % SIZE;
      const by = Math.floor(car.to / SIZE);
      const dx = bx - ax;
      const dy = by - ay;
      const px = ax + dx * car.t + 0.5 + dy * 0.18 - 0.11;
      const py = ay + dy * car.t + 0.5 - dx * 0.18 - 0.11;
      box(ctx, px, py, 0.22, 0.22, 0.16, car.color);
    }
  }

  /* ---------- 下見と吹き出し ---------- */
  let hover: Point | null = null;
  let dragFrom: Point | null = null;
  let previewText = '';
  let previewBad = false;

  function drawOverlay(now: number): void {
    if (!input) return;
    // 施設の範囲
    const ringId = placing ?? selected;
    const ringAt: Point | null =
      tool === 'facility' && placing !== null && hover !== null
        ? hover
        : ringId === null
          ? null
          : (input.save.facilities.find((f) => f.id === ringId) ?? null);
    if (ringAt && ringId !== null) {
      const v = input.facilities.find((f) => f.id === ringId);
      const r = facilityRadius(v?.ratio ?? 0);
      ctx.beginPath();
      for (let k = 0; k <= 48; k += 1) {
        const a = (k / 48) * Math.PI * 2;
        const p = project(ringAt.x + 1 + Math.cos(a) * r, ringAt.y + 1 + Math.sin(a) * r);
        if (k === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      }
      ctx.fillStyle = 'rgba(255,210,74,0.16)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(224,165,38,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // 道具の下見
    if (tool !== 'inspect' && hover !== null) {
      const from = dragFrom ?? hover;
      const area = toolArea(tool, from, hover);
      const tint = previewBad
        ? 'rgba(224,72,58,0.5)'
        : tool === 'road' ? 'rgba(235,240,245,0.55)'
          : tool === 'res' ? 'rgba(95,211,90,0.55)'
            : tool === 'com' ? 'rgba(74,163,240,0.55)'
              : tool === 'ind' ? 'rgba(240,197,58,0.55)'
                : tool === 'bulldoze' ? 'rgba(255,107,74,0.5)'
                  : 'rgba(126,227,122,0.55)';
      for (const p of area) diamond(ctx, p.x, p.y, tint, 'rgba(255,255,255,0.8)');
      if (tool === 'facility' && placing !== null) {
        const v = input.facilities.find((f) => f.id === placing);
        if (v) {
          ctx.globalAlpha = 0.7;
          facilityBuilding(ctx, v.kind, TRACK_ACCENT[input.track], hover.x, hover.y, 0, 1);
          ctx.globalAlpha = 1;
        }
      }
    } else if (hover !== null) {
      diamond(ctx, hover.x, hover.y, 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.9)');
    }
    // 施設の看板
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const placed of input.save.facilities) {
      const v = input.facilities.find((f) => f.id === placed.id);
      if (!v) continue;
      const p = project(placed.x + 1, placed.y + 1, 2.6 + (v.build >= 1 ? 1 : 0));
      const label = `${v.build < 1 ? '🏗 ' : v.ratio >= 1 ? '★ ' : ''}${v.name}`;
      const w = ctx.measureText(label).width + 14;
      ctx.fillStyle = '#fbf3df';
      ctx.strokeStyle = '#3b2a1a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(p.sx - w / 2, p.sy - 10, w, 20, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2b2118';
      ctx.fillText(label, p.sx, p.sy + 1);
      ctx.beginPath();
      ctx.moveTo(p.sx, p.sy + 10);
      ctx.lineTo(p.sx, p.sy + 22);
      ctx.stroke();
    }
    // 出来事の吹き出し
    for (let k = pops.length - 1; k >= 0; k -= 1) {
      const pop = pops[k];
      if (!pop) continue;
      const age = (now - pop.born) / 2600;
      if (age >= 1) {
        pops.splice(k, 1);
        continue;
      }
      const p = project(pop.x, pop.y, 3 + age * 3);
      ctx.globalAlpha = age < 0.8 ? 1 : (1 - age) / 0.2;
      ctx.font = '800 14px system-ui, sans-serif';
      const w = ctx.measureText(pop.text).width + 16;
      ctx.fillStyle = pop.color;
      ctx.beginPath();
      ctx.roundRect(p.sx - w / 2, p.sy - 12, w, 24, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(pop.text, p.sx, p.sy + 1);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- 操作 ---------- */
  function tileAt(event: PointerEvent | WheelEvent): Point | null {
    const rect = canvas.getBoundingClientRect();
    const sx = (event.clientX - rect.left - view.x) / view.zoom;
    const sy = (event.clientY - rect.top - view.y) / view.zoom;
    const g = unproject(sx, sy);
    const x = Math.floor(g.x);
    const y = Math.floor(g.y);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
    return { x, y };
  }

  function updatePreview(): void {
    if (!input || hover === null || tool === 'inspect') {
      previewText = '';
      previewBad = false;
      return;
    }
    const result = applyTool(input.save, input.terrain, tool, dragFrom ?? hover, hover, input.infos, placing ?? undefined);
    previewBad = result.error !== undefined && result.error !== 'nothing';
    previewText = callbacks.describe(result, tool);
  }

  let panning: { x: number; y: number; vx: number; vy: number } | null = null;
  let downAt: { x: number; y: number } | null = null;
  let pointer = { x: 0, y: 0 };

  const onDown = (event: PointerEvent): void => {
    canvas.setPointerCapture(event.pointerId);
    downAt = { x: event.clientX, y: event.clientY };
    if (event.button === 0 && tool !== 'inspect') {
      dragFrom = tileAt(event);
      updatePreview();
      return;
    }
    panning = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
  };
  const onMove = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (panning) {
      view.x = panning.vx + event.clientX - panning.x;
      view.y = panning.vy + event.clientY - panning.y;
      userMoved = true;
      return;
    }
    const p = tileAt(event);
    if (p?.x !== hover?.x || p?.y !== hover?.y) {
      hover = p;
      updatePreview();
    }
  };
  const onUp = (event: PointerEvent): void => {
    const moved = downAt !== null && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 5;
    downAt = null;
    if (panning) {
      panning = null;
      if (!moved && tool === 'inspect' && event.button === 0) {
        const p = tileAt(event);
        if (p) callbacks.onInspect(p);
      }
      return;
    }
    if (dragFrom !== null) {
      const p = tileAt(event);
      if (p) callbacks.onApply(dragFrom, p);
      dragFrom = null;
      updatePreview();
    }
  };
  const onLeave = (): void => {
    if (dragFrom === null) hover = null;
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAround(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top);
  };
  const onContext = (event: Event): void => {
    event.preventDefault();
  };
  function zoomAround(factor: number, px: number, py: number): void {
    const next = Math.max(0.3, Math.min(3, view.zoom * factor));
    const k = next / view.zoom;
    view.x = px - (px - view.x) * k;
    view.y = py - (py - view.y) * k;
    view.zoom = next;
    userMoved = true;
    scheduleSharpen();
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContext);

  /* ---------- 毎フレーム ---------- */
  let frame = 0;
  let last = performance.now();
  const loop = (now: number): void => {
    frame = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (layerDirty) renderLayer();
    const d = dpr();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#5a933f';
    ctx.fillRect(0, 0, width, height);
    if (layerScale > 0) {
      const k = view.zoom / layerScale;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        layer,
        view.x + STATIC_BOUNDS.left * view.zoom,
        view.y + STATIC_BOUNDS.top * view.zoom,
        layer.width * k,
        layer.height * k,
      );
    }
    ctx.setTransform(d * view.zoom, 0, 0, d * view.zoom, d * view.x, d * view.y);
    drawCars(dt);
    drawOverlay(now);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    if (previewText !== '' && hover !== null) {
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(previewText).width + 14;
      ctx.fillStyle = 'rgba(20,28,36,0.88)';
      ctx.beginPath();
      ctx.roundRect(pointer.x + 14, pointer.y + 12, w, 22, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(previewText, pointer.x + 21, pointer.y + 23);
    }
  };
  frame = requestAnimationFrame(loop);

  return {
    update(next) {
      const first = input === null;
      input = next;
      layerDirty = true;
      if (!userMoved && first) fit();
      resetCars();
      updatePreview();
    },
    setTool(nextTool, nextPlacing) {
      const zoneChanged = (tool === 'res' || tool === 'com' || tool === 'ind') !== (nextTool === 'res' || nextTool === 'com' || nextTool === 'ind');
      tool = nextTool;
      placing = nextPlacing;
      dragFrom = null;
      if (zoneChanged) layerDirty = true;
      updatePreview();
      canvas.style.cursor = tool === 'inspect' ? 'grab' : 'crosshair';
    },
    setSelected(id) {
      selected = id;
    },
    lookAt(id) {
      const placed = input?.save.facilities.find((f) => f.id === id);
      if (!placed) return;
      const p = project(placed.x + 1, placed.y + 1);
      view.x = width / 2 - p.sx * view.zoom;
      view.y = height / 2 - p.sy * view.zoom;
      userMoved = true;
    },
    effect(facilityId, text, color) {
      const placed = facilityId === null ? undefined : input?.save.facilities.find((f) => f.id === facilityId);
      // 地図にまだ無い施設の出来事は、住民の声の欄にだけ出す
      if (!placed) return;
      const offset = pops.length * 0.6;
      pops.push({
        x: placed.x + 1 - offset,
        y: placed.y + 1 - offset,
        text,
        color,
        born: performance.now(),
      });
    },
    zoomBy(factor) {
      zoomAround(factor, width / 2, height / 2);
    },
    fit() {
      userMoved = false;
      fit();
      scheduleSharpen();
    },
    dispose() {
      cancelAnimationFrame(frame);
      window.clearTimeout(zoomTimer);
      observer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.remove();
    },
  };
}
