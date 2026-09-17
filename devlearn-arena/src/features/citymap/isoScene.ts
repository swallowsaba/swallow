import type { BuildingKind } from '@/content/city';
import { TONE_COLOR, type Scene, type SceneBuilding, type SceneItem, type Tone } from '@/engines/cityscape';
import type { MissionTrack } from '@/engines/lesson/types';
import { drawMoodFace } from '@/visual/game/faceCanvas';
import { MOOD_OF_VOICE } from '@/visual/game/faces';
import {
  box, cylinder, diamond, facilityBuilding, gable, HU, lamp, poly, project, shade, TH, TRACK_ACCENT, tree, TW, unproject, windows,
  type Ctx,
} from './isoDraw';

/**
 * カテゴリの街の地図。上の通りに市民施設（学んで建てた施設）、その下に「現場」（いまの任務の状態を見立てた街）を描く。
 * 動かないもの（地面・道・建物）は画面外の canvas に描いて使い回し、線の流れ・看板・印・吹き出しは毎フレーム描く。
 */

export type Voice = 'complaint' | 'waiting' | 'praise' | null;

export interface CivicView {
  id: string;
  name: string;
  kind: BuildingKind;
  ratio: number;
  build: number;
  learned: boolean;
  voice: Voice;
  /** いま対応している施設 */
  current: boolean;
}

export interface SceneMapInput {
  track: MissionTrack;
  scene: Scene;
  civic: readonly CivicView[];
  /** 街の育ち。理解度の正解で家が増え、コマンドの手順で家が高くなる */
  growth: TownGrowth;
}

export interface TownGrowth {
  /** 理解度の問題に正解した数 = 家の数 */
  houses: number;
  /** コマンドで通した手順の数 = 積み上げた階 */
  floors: number;
}

export interface SceneMapCallbacks {
  /** 押したもの。現場のものは item の id、市民施設は `civic:<id>`、何も無ければ null */
  onSelect: (id: string | null) => void;
}

export interface SceneMap {
  update: (input: SceneMapInput) => void;
  setSelected: (id: string | null) => void;
  effect: (facilityId: string | null, text: string, color: string) => void;
  zoomBy: (factor: number) => void;
  fit: () => void;
  dispose: () => void;
}

/** 市民施設の通りと、住宅街と、現場の位置 */
export const CIVIC_STEP = 4;
/** 住宅街の始まり */
export const TOWN_Y = 5;
const TOWN_ROW = 2.4;
const TOWN_PER_ROW = 10;
const MARGIN = 5;

export function townRows(growth: TownGrowth): number {
  return Math.max(1, Math.ceil(growth.houses / TOWN_PER_ROW));
}

/** 現場（いまの任務の街）が始まる行。住宅街が広がるほど下がる */
export function siteYOf(input: SceneMapInput): number {
  return TOWN_Y + townRows(input.growth) * TOWN_ROW + 2;
}

/** 家ごとの階数。積み上げた階を家に均等に配る */
export function houseLevels(growth: TownGrowth): number[] {
  const houses = Math.max(0, growth.houses);
  if (houses === 0) return [];
  const base = Math.floor(growth.floors / houses);
  const extra = growth.floors % houses;
  return Array.from({ length: houses }, (_, i) => Math.min(5, 1 + base + (i < extra ? 1 : 0)));
}

const civicX = (i: number): number => i * CIVIC_STEP;

/** 地図全体の大きさ（マス） */
export function mapSize(input: SceneMapInput): { w: number; h: number } {
  return { w: Math.max(input.civic.length * CIVIC_STEP, input.scene.width, TOWN_PER_ROW * 2) + 1, h: siteYOf(input) + input.scene.height + 1 };
}

/* ---------------- 建物の見立て ---------------- */

const FLOOR = 0.45;

function drawRooms(ctx: Ctx, b: SceneBuilding, x: number, y: number, h: number): void {
  const rooms = b.rooms ?? [];
  if (rooms.length === 0) return;
  const cols = 2;
  rooms.forEach((room, i) => {
    const floor = Math.floor(i / cols);
    const col = i % cols;
    const z0 = floor * FLOOR + 0.08;
    const z1 = z0 + FLOOR * 0.72;
    if (z1 > h) return;
    const xa = x + (b.w * (col + 0.12)) / cols;
    const xb = x + (b.w * (col + 0.88)) / cols;
    const yy = y + b.d;
    const fill = b.style === 'dark' ? shade(room.color, -0.6) : room.color;
    poly(ctx, [project(xa, yy, z0), project(xb, yy, z0), project(xb, yy, z1), project(xa, yy, z1)], fill, room.tone ? TONE_COLOR[room.tone] : 'rgba(0,0,0,0.35)', room.tone ? 2.5 : 1);
    if (room.tone === 'bad') {
      const c = project((xa + xb) / 2, yy, (z0 + z1) / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 9px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', c.sx, c.sy);
    }
  });
}

function roof(ctx: Ctx, b: SceneBuilding, x: number, y: number, h: number, color: string): void {
  if (b.roof === 'gable') {
    gable(ctx, x - 0.05, y - 0.05, b.w + 0.1, b.d + 0.1, h, Math.min(0.6, 0.25 * b.d), shade(color, -0.35));
  } else if (b.roof === 'dome') {
    cylinder(ctx, x + b.w / 2, y + b.d / 2, Math.min(b.w, b.d) * 0.32, 0.25, shade(color, -0.2), h);
  } else if (b.roof === 'hall') {
    box(ctx, x - 0.05, y - 0.05, b.w + 0.1, b.d + 0.1, 0.12, '#c9b48a', h);
    gable(ctx, x + b.w * 0.2, y + b.d * 0.55, b.w * 0.6, b.d * 0.45, h + 0.12, 0.4, '#b8553f');
    for (let i = 0; i < 4; i += 1) cylinder(ctx, x + b.w * (0.18 + i * 0.21), y + b.d + 0.12, 0.05, Math.max(0.3, h * 0.8), '#ffffff');
  } else {
    box(ctx, x + 0.1, y + 0.1, b.w - 0.2, b.d - 0.2, 0.08, shade(color, -0.25), h);
  }
}

export function drawBuilding(ctx: Ctx, b: SceneBuilding, x: number, y: number): void {
  const h = Math.max(1, b.floors) * FLOOR;
  switch (b.style) {
    case 'blueprint': {
      poly(ctx, [project(x, y), project(x + b.w, y), project(x + b.w, y + b.d), project(x, y + b.d)], 'rgba(70,140,230,0.55)', '#ffffff', 1.5);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k += 1) {
        const a = project(x + (b.w * k) / 4, y);
        const c = project(x + (b.w * k) / 4, y + b.d);
        const e = project(x, y + (b.d * k) / 4);
        const f = project(x + b.w, y + (b.d * k) / 4);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(c.sx, c.sy);
        ctx.moveTo(e.sx, e.sy);
        ctx.lineTo(f.sx, f.sy);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // 家の形の線
      const p1 = project(x + b.w * 0.25, y + b.d * 0.25, 0.02);
      const p2 = project(x + b.w * 0.75, y + b.d * 0.25, 0.02);
      const p3 = project(x + b.w * 0.75, y + b.d * 0.75, 0.02);
      const p4 = project(x + b.w * 0.25, y + b.d * 0.75, 0.02);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.lineTo(p3.sx, p3.sy);
      ctx.lineTo(p4.sx, p4.sy);
      ctx.closePath();
      ctx.stroke();
      return;
    }
    case 'frame': {
      poly(ctx, [project(x, y), project(x + b.w, y), project(x + b.w, y + b.d), project(x, y + b.d)], 'rgba(242,178,51,0.25)', null);
      ctx.strokeStyle = '#c98a1a';
      ctx.lineWidth = 2.5;
      const corners: [number, number][] = [
        [x, y],
        [x + b.w, y],
        [x + b.w, y + b.d],
        [x, y + b.d],
      ];
      for (const [cx, cy] of corners) {
        const a = project(cx, cy);
        const c = project(cx, cy, h);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(c.sx, c.sy);
        ctx.stroke();
      }
      ctx.lineWidth = 2;
      for (let z = FLOOR; z <= h + 0.001; z += FLOOR) {
        ctx.beginPath();
        corners.forEach(([cx, cy], i) => {
          const p = project(cx, cy, z);
          if (i === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        });
        ctx.closePath();
        ctx.stroke();
      }
      // 筋交い
      ctx.lineWidth = 1.2;
      const d1 = project(x, y + b.d, 0);
      const d2 = project(x + b.w, y + b.d, h);
      ctx.beginPath();
      ctx.moveTo(d1.sx, d1.sy);
      ctx.lineTo(d2.sx, d2.sy);
      ctx.stroke();
      return;
    }
    case 'scaffold': {
      const low = h * 0.55;
      box(ctx, x + 0.1, y + 0.1, b.w - 0.2, b.d - 0.2, low, shade(b.color, -0.05));
      ctx.strokeStyle = '#e0a526';
      ctx.lineWidth = 1.6;
      const posts: [number, number][] = [
        [x, y + b.d],
        [x + b.w / 2, y + b.d],
        [x + b.w, y + b.d],
        [x + b.w, y + b.d / 2],
        [x + b.w, y],
      ];
      for (const [px, py] of posts) {
        const a = project(px, py);
        const c = project(px, py, h);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(c.sx, c.sy);
        ctx.stroke();
      }
      for (let z = FLOOR * 0.8; z < h; z += FLOOR * 0.8) {
        const a = project(x, y + b.d, z);
        const c = project(x + b.w, y + b.d, z);
        const e = project(x + b.w, y, z);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(c.sx, c.sy);
        ctx.lineTo(e.sx, e.sy);
        ctx.stroke();
      }
      // 養生シート
      poly(ctx, [project(x + b.w * 0.1, y + b.d, low), project(x + b.w * 0.6, y + b.d, low), project(x + b.w * 0.6, y + b.d, h * 0.95), project(x + b.w * 0.1, y + b.d, h * 0.95)], 'rgba(90,166,233,0.55)', null);
      return;
    }
    case 'ruin': {
      box(ctx, x + 0.1, y + 0.2, b.w * 0.5, b.d * 0.35, 0.3, '#9a958c');
      box(ctx, x + b.w * 0.55, y + b.d * 0.5, b.w * 0.35, b.d * 0.4, 0.18, '#aaa59b');
      box(ctx, x + b.w * 0.2, y + b.d * 0.65, b.w * 0.25, b.d * 0.25, 0.12, '#8c877e');
      return;
    }
    case 'tent': {
      const apex = project(x + b.w / 2, y + b.d / 2, 0.9);
      poly(ctx, [project(x, y + b.d), project(x + b.w, y + b.d), apex], shade(b.color, -0.15));
      poly(ctx, [project(x + b.w, y), project(x + b.w, y + b.d), apex], shade(b.color, 0.05));
      return;
    }
    default: {
      const color = b.style === 'dark' ? shade(b.color, -0.5) : b.color;
      ctx.save();
      if (b.style === 'ghost') ctx.globalAlpha = 0.35;
      box(ctx, x, y, b.w, b.d, h, color);
      if ((b.rooms ?? []).length === 0 && b.floors >= 2 && b.roof !== 'gable') {
        windows(ctx, x, y, b.w, b.d, h, FLOOR, b.style === 'dark' ? 'rgba(20,20,30,0.6)' : 'rgba(60,80,110,0.45)');
      }
      drawRooms(ctx, b, x, y, h);
      roof(ctx, b, x, y, h, color);
      ctx.restore();
    }
  }
}

function roadColors(kind: string): { fill: string; edge: string } {
  if (kind === 'plan') return { fill: '#d8c9a3', edge: '#b59d6a' };
  if (kind === 'blocked') return { fill: '#7b7f85', edge: '#e0483a' };
  if (kind === 'main') return { fill: '#6f757c', edge: '#d9d3c4' };
  return { fill: '#868c93', edge: '#d9d3c4' };
}

/** 動かないもの（地面・道・区画・建物・市民施設）を描く */
export function drawStatic(ctx: Ctx, input: SceneMapInput): void {
  const { scene, civic, track } = input;
  const SITE_Y = siteYOf(input);
  const { w, h } = mapSize(input);
  for (let y = -MARGIN; y < h + MARGIN; y += 1) {
    for (let x = -MARGIN; x < w + MARGIN; x += 1) {
      const inside = x >= -1 && y >= -1 && x < w + 1 && y < h + 1;
      const checker = (x + y) % 2 === 0;
      diamond(ctx, x, y, inside ? (checker ? '#76b24f' : '#6fab49') : checker ? '#5f9a43' : '#5a933f');
    }
  }
  // 市民施設の通り
  for (let x = -1; x < w + 1; x += 1) diamond(ctx, x, 3, '#6f757c');
  for (let x = -1; x < w + 1; x += 2) {
    const a = project(x + 0.2, 3.5);
    const b = project(x + 0.8, 3.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
  // 現場の区切り
  poly(ctx, [project(-0.5, SITE_Y - 0.6), project(w + 0.5, SITE_Y - 0.6), project(w + 0.5, h + 0.5), project(-0.5, h + 0.5)], 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.55)', 2);

  const at = (x: number, y: number) => ({ x, y: y + SITE_Y });
  // 区画と道
  for (const item of scene.items) {
    if (item.type === 'plot') {
      const p = at(item.x, item.y);
      poly(ctx, [project(p.x, p.y), project(p.x + item.w, p.y), project(p.x + item.w, p.y + item.d), project(p.x, p.y + item.d)], `${TONE_COLOR[item.tone]}33`, `${TONE_COLOR[item.tone]}cc`, 1.5);
    } else if (item.type === 'road') {
      const cells = new Set(item.cells.map((c) => `${String(c.x)},${String(c.y)}`));
      const colors = roadColors(item.kind);
      for (const c of item.cells) {
        const p = at(c.x, c.y);
        diamond(ctx, p.x, p.y, colors.fill);
        const sides: [number, number, [number, number], [number, number]][] = [
          [0, -1, [0, 0], [1, 0]],
          [1, 0, [1, 0], [1, 1]],
          [0, 1, [1, 1], [0, 1]],
          [-1, 0, [0, 1], [0, 0]],
        ];
        ctx.strokeStyle = colors.edge;
        ctx.lineWidth = item.kind === 'blocked' ? 2.5 : 1.5;
        if (item.kind === 'plan' || item.kind === 'blocked') ctx.setLineDash([4, 3]);
        for (const [dx, dy, a, b] of sides) {
          if (cells.has(`${String(c.x + dx)},${String(c.y + dy)}`)) continue;
          const pa = project(p.x + a[0], p.y + a[1]);
          const pb = project(p.x + b[0], p.y + b[1]);
          ctx.beginPath();
          ctx.moveTo(pa.sx, pa.sy);
          ctx.lineTo(pb.sx, pb.sy);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
  }

  // 住宅街（理解度で増え、コマンドで高くなる）
  const levels = houseLevels(input.growth);
  const townEnd = TOWN_Y + townRows(input.growth) * TOWN_ROW;
  for (let y = TOWN_Y - 0.6; y < townEnd; y += TOWN_ROW) {
    for (let x = -0.5; x < TOWN_PER_ROW * 2 + 0.5; x += 1) diamond(ctx, x, y + 1.4, '#868c93');
  }

  // 立っているもの：奥から
  const draws: { key: number; draw: () => void }[] = [];
  const HOUSE_COLORS = ['#f2e4cf', '#e8c9a2', '#f4efe6', '#d9b48f', '#e6dccb'];
  const HOUSE_ROOFS = ['#b5533c', '#7a4f3f', '#566577', '#9c3f33', '#c77b3e'];
  levels.forEach((level, i) => {
    const hx = (i % TOWN_PER_ROW) * 2;
    const hy = TOWN_Y + Math.floor(i / TOWN_PER_ROW) * TOWN_ROW;
    const wall = HOUSE_COLORS[i % HOUSE_COLORS.length] ?? '#f2e4cf';
    const roofColor = HOUSE_ROOFS[i % HOUSE_ROOFS.length] ?? '#b5533c';
    draws.push({ key: hx + hy + 1, draw: () => {
      const h = 0.4 + (level - 1) * 0.42;
      box(ctx, hx + 0.25, hy + 0.2, 1.2, 1.2, h, wall);
      if (level <= 2) gable(ctx, hx + 0.2, hy + 0.15, 1.3, 1.3, h, 0.35, roofColor);
      else {
        windows(ctx, hx + 0.25, hy + 0.2, 1.2, 1.2, h, 0.42, 'rgba(60,80,110,0.5)');
        box(ctx, hx + 0.4, hy + 0.35, 0.9, 0.9, 0.1, roofColor, h);
      }
    } });
  });
  const accent = TRACK_ACCENT[track];
  civic.forEach((f, i) => {
    const x = civicX(i);
    if (f.learned) {
      draws.push({ key: x + 2 + 2, draw: () => { facilityBuilding(ctx, f.kind, accent, x, 0.5, f.ratio, f.build); } });
    } else {
      draws.push({ key: x + 1, draw: () => {
        poly(ctx, [project(x + 0.2, 0.7), project(x + 1.8, 0.7), project(x + 1.8, 2.3), project(x + 0.2, 2.3)], 'rgba(160,120,70,0.35)', 'rgba(255,255,255,0.7)', 1);
      } });
    }
    if (i % 2 === 0) draws.push({ key: x + 3.9 + 3, draw: () => { lamp(ctx, x + 3.5, 2.9); } });
  });
  for (let x = -MARGIN; x < w + MARGIN; x += 3) {
    const seed = (x * 7919) >>> 0;
    draws.push({ key: x - MARGIN, draw: () => { tree(ctx, x + 0.5, -2.5 - (seed % 2), seed); } });
    draws.push({ key: x + h + 2, draw: () => { tree(ctx, x + 1, h + 2 + (seed % 2), seed >>> 2); } });
  }
  for (const item of scene.items) {
    if (item.type !== 'building') continue;
    const p = at(item.x, item.y);
    draws.push({ key: p.x + p.y + item.w + item.d, draw: () => { drawBuilding(ctx, item, p.x, p.y); } });
  }
  draws.sort((a, b) => a.key - b.key);
  for (const d of draws) d.draw();
}

/* ---------------- 画面の地図 ---------------- */

interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
}



export function createSceneMap(host: HTMLElement, callbacks: SceneMapCallbacks): SceneMap {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';
  host.appendChild(canvas);
  const ctxOrNull = canvas.getContext('2d');
  if (!ctxOrNull) throw new Error('canvas 2d is unavailable');
  const ctx: Ctx = ctxOrNull;
  const layer = document.createElement('canvas');
  const layerCtxOrNull = layer.getContext('2d');
  if (!layerCtxOrNull) throw new Error('canvas 2d is unavailable');
  const layerCtx: Ctx = layerCtxOrNull;

  let input: SceneMapInput | null = null;
  let selected: string | null = null;
  let hover: string | null = null;
  let layerDirty = true;
  let layerScale = 0;
  let bounds = { left: 0, top: 0, width: 1, height: 1 };
  const pops: Pop[] = [];
  const view = { x: 0, y: 0, zoom: 1 };
  let userMoved = false;
  let width = 1;
  let height = 1;
  const dpr = (): number => Math.min(2, window.devicePixelRatio || 1);

  function computeBounds(): void {
    if (!input) return;
    const { w, h } = mapSize(input);
    const left = project(-MARGIN, h + MARGIN).sx;
    const right = project(w + MARGIN, -MARGIN).sx;
    const top = project(-MARGIN, -MARGIN).sy - 260;
    const bottom = project(w + MARGIN, h + MARGIN).sy;
    bounds = { left, top, width: right - left, height: bottom - top };
  }

  function fit(): void {
    if (!input) return;
    const SITE_Y = siteYOf(input);
    // 現場（いまの任務の街）と、その上の施設の通りの手前側が画面いっぱいに入るように寄せる
    const sw = Math.max(10, Math.min(input.scene.width, 26));
    const sh = Math.max(6, input.scene.height) + SITE_Y;
    const spanW = (sw + sh) * (TW / 2);
    const spanH = (sw + sh) * (TH / 2) + 140;
    const zoom = Math.max(0.5, Math.min((width - 30) / spanW, (height - 230) / spanH, 1.8));
    view.zoom = zoom;
    const focus = project(sw / 2, sh / 2, 1);
    view.x = width / 2 - focus.sx * zoom;
    view.y = 60 + (height - 230) / 2 - focus.sy * zoom;
  }

  function resize(): void {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    canvas.width = Math.round(width * dpr());
    canvas.height = Math.round(height * dpr());
    if (!userMoved) fit();
    layerDirty = true;
  }
  resize();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(host);

  function renderLayer(): void {
    if (!input) return;
    const scale = Math.max(0.5, Math.min(2, view.zoom * dpr()));
    layer.width = Math.max(1, Math.ceil(bounds.width * scale));
    layer.height = Math.max(1, Math.ceil(bounds.height * scale));
    layerCtx.setTransform(scale, 0, 0, scale, -bounds.left * scale, -bounds.top * scale);
    layerCtx.clearRect(bounds.left, bounds.top, bounds.width, bounds.height);
    drawStatic(layerCtx, input);
    layerScale = scale;
    layerDirty = false;
  }
  let sharpenTimer = 0;
  const sharpen = (): void => {
    window.clearTimeout(sharpenTimer);
    sharpenTimer = window.setTimeout(() => {
      layerDirty = true;
    }, 180);
  };

  /* ---------- 押せるもの ---------- */
  interface Hit {
    id: string;
    left: number;
    right: number;
    top: number;
    bottom: number;
  }
  let hits: Hit[] = [];
  function computeHits(): void {
    if (!input) return;
    const SITE_Y = siteYOf(input);
    const list: Hit[] = [];
    input.civic.forEach((f, i) => {
      const x = civicX(i);
      const a = project(x, 2.5);
      const b = project(x + 2, 0.5);
      const top = project(x + 1, 1.5, 3.5).sy;
      list.push({ id: `civic:${f.id}`, left: a.sx, right: b.sx, top, bottom: project(x + 2, 2.5).sy });
    });
    for (const item of input.scene.items) {
      if (item.type === 'building') {
        const x = item.x;
        const y = item.y + SITE_Y;
        const h = item.style === 'blueprint' || item.style === 'ruin' ? 0.3 : Math.max(1, item.floors) * FLOOR + 0.5;
        list.push({ id: item.id, left: project(x, y + item.d).sx, right: project(x + item.w, y).sx, top: project(x, y, h).sy - 4, bottom: project(x + item.w, y + item.d).sy });
      } else if (item.type === 'marker' && item.info) {
        const p = project(item.x, item.y + SITE_Y, 1.2);
        list.push({ id: item.id, left: p.sx - 14, right: p.sx + 14, top: p.sy - 16, bottom: p.sy + 22 });
      } else if (item.type === 'road' && item.info) {
        for (const c of item.cells) {
          const p = project(c.x + 0.5, c.y + SITE_Y + 0.5);
          list.push({ id: item.id, left: p.sx - TW / 3, right: p.sx + TW / 3, top: p.sy - TH / 3, bottom: p.sy + TH / 3 });
        }
      }
    }
    // 手前（下）にあるものを先に当てる
    hits = list.sort((a, b) => b.bottom - a.bottom);
  }

  function hitAt(clientX: number, clientY: number): string | null {
    const rect = canvas.getBoundingClientRect();
    const sx = (clientX - rect.left - view.x) / view.zoom;
    const sy = (clientY - rect.top - view.y) / view.zoom;
    const found = hits.find((h) => sx >= h.left && sx <= h.right && sy >= h.top && sy <= h.bottom);
    return found?.id ?? null;
  }

  /* ---------- 毎フレーム描くもの ---------- */
  const tone = (t: Tone): string => TONE_COLOR[t];

  /** 地図上の位置に、拡大率によらず同じ大きさで描く（文字が読めるように） */
  function inScreen(sx: number, sy: number, draw: (x: number, y: number) => void): void {
    const d = dpr();
    ctx.save();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    draw(view.x + sx * view.zoom, view.y + sy * view.zoom);
    ctx.restore();
  }

  function chip(text: string, wx: number, wy: number, bg: string, fg = '#ffffff', font = '700 12px system-ui, sans-serif'): void {
    inScreen(wx, wy, (sx, sy) => {
      drawChip(text, sx, sy, bg, fg, font);
    });
  }

  function drawChip(text: string, sx: number, sy: number, bg: string, fg: string, font: string): void {
    ctx.font = font;
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(sx - w / 2, sy - 9, w, 18, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, sx, sy + 0.5);
  }

  function drawOverlay(now: number): void {
    if (!input) return;
    const SITE_Y = siteYOf(input);
    const { scene, civic } = input;
    const showLabels = view.zoom >= 0.6;
    // 線（流れるものは点が動く）
    for (const item of scene.items) {
      if (item.type !== 'link') continue;
      const a = project(item.from.x, item.from.y + SITE_Y, 0.08);
      const b = project(item.to.x, item.to.y + SITE_Y, 0.08);
      ctx.strokeStyle = tone(item.tone);
      ctx.lineWidth = 2.5;
      if (item.style === 'dashed') ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
      ctx.setLineDash([]);
      if (item.flow === true) {
        for (let k = 0; k < 3; k += 1) {
          const f = ((now / 1600 + k / 3) % 1 + 1) % 1;
          const px = a.sx + (b.sx - a.sx) * f;
          const py = a.sy + (b.sy - a.sy) * f;
          ctx.fillStyle = tone(item.tone);
          ctx.beginPath();
          ctx.roundRect(px - 5, py - 4, 10, 8, 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    // 建物の印・看板・変わったところ
    for (const item of scene.items) {
      if (item.type === 'building') {
        const x = item.x;
        const y = item.y + SITE_Y;
        const h = item.style === 'blueprint' || item.style === 'ruin' ? 0.2 : Math.max(1, item.floors) * FLOOR + (item.roof === 'gable' ? 0.4 : 0.2);
        const top = project(x + item.w / 2, y + item.d / 2, h);
        const isSel = selected === item.id;
        const isHover = hover === item.id;
        if (item.changed === true) {
          const pulse = 0.5 + 0.5 * Math.sin(now / 250);
          ctx.strokeStyle = `rgba(255,214,74,${String(0.5 + pulse * 0.5)})`;
          ctx.lineWidth = 3;
          const c = project(x + item.w / 2, y + item.d / 2);
          ctx.beginPath();
          ctx.ellipse(c.sx, c.sy, (item.w + item.d) * TW * 0.36, (item.w + item.d) * TH * 0.36, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = '16px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText('✨', top.sx + 16, top.sy - 10 - pulse * 4);
        }
        if (isSel || isHover) {
          const c = project(x + item.w / 2, y + item.d / 2);
          ctx.strokeStyle = isSel ? '#ffd24a' : 'rgba(255,255,255,0.9)';
          ctx.lineWidth = isSel ? 3 : 2;
          ctx.beginPath();
          ctx.ellipse(c.sx, c.sy, (item.w + item.d) * TW * 0.32, (item.w + item.d) * TH * 0.32, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        (item.badges ?? []).forEach((badge, i) => {
          chip(badge.icon, top.sx + (i * 26 - ((item.badges?.length ?? 1) - 1) * 13) / view.zoom, top.sy - 16 / view.zoom, tone(badge.tone));
        });
        if (item.label !== undefined && (showLabels || isSel || isHover)) {
          const base = project(x + item.w / 2, y + item.d, 0);
          chip(item.label.length > 18 ? `${item.label.slice(0, 17)}…` : item.label, base.sx, base.sy + 12 / view.zoom, 'rgba(251,243,223,0.95)', '#2b2118');
        }
      } else if (item.type === 'marker') {
        const base = project(item.x, item.y + SITE_Y);
        const topP = project(item.x, item.y + SITE_Y, 1.1);
        ctx.strokeStyle = '#3d4450';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(base.sx, base.sy);
        ctx.lineTo(topP.sx, topP.sy);
        ctx.stroke();
        inScreen(topP.sx, topP.sy, (sx, sy) => {
          ctx.font = '22px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.icon, sx, sy - 6);
        });
        if (item.label !== undefined && (showLabels || selected === item.id || hover === item.id)) {
          chip(item.label, base.sx, base.sy + 12 / view.zoom, tone(item.tone));
        }
        if (selected === item.id) {
          ctx.strokeStyle = '#ffd24a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(topP.sx, topP.sy - 4, 16, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (item.type === 'plot' && item.label !== undefined) {
        const p = project(item.x + 0.3, item.y + SITE_Y + 0.2);
        const label = item.label;
        inScreen(p.sx, p.sy, (sx, sy) => {
          ctx.font = '700 12px system-ui, sans-serif';
          const w = ctx.measureText(label).width + 12;
          ctx.fillStyle = TONE_COLOR[item.tone];
          ctx.beginPath();
          ctx.roundRect(sx - 4, sy - 22, w, 20, 3);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, sx + 2, sy - 11.5);
        });
      }
    }
    // 市民施設の看板と住民の声
    civic.forEach((f, i) => {
      const x = civicX(i);
      const p = project(x + 1, 1.5, f.learned ? 3.6 : 1.2);
      const label = `${f.build < 1 && f.learned ? '🏗 ' : f.ratio >= 1 ? '★ ' : ''}${f.name}`;
      if (showLabels || f.current || f.voice !== null || selected === `civic:${f.id}`) {
        chip(label, p.sx, p.sy, f.current ? '#e0703a' : f.learned ? 'rgba(251,243,223,0.95)' : 'rgba(80,70,60,0.75)', f.current || !f.learned ? '#ffffff' : '#2b2118');
      }
      if (f.voice !== null) {
        const bob = Math.sin(now / 400 + i) * 3;
        const voice = f.voice;
        inScreen(p.sx, p.sy, (sx, sy) => {
          drawMoodFace(ctx, sx, sy - 34 + bob, 38, MOOD_OF_VOICE[voice]);
        });
      }
      if (selected === `civic:${f.id}` || hover === `civic:${f.id}`) {
        const c = project(x + 1, 1.5);
        ctx.strokeStyle = selected === `civic:${f.id}` ? '#ffd24a' : 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(c.sx, c.sy, TW * 1.3, TH * 1.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
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
      chip(pop.text, p.sx, p.sy, pop.color, '#ffffff', '800 13px system-ui, sans-serif');
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- 操作 ---------- */
  let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
  const onDown = (event: PointerEvent): void => {
    canvas.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false };
    canvas.style.cursor = 'grabbing';
  };
  const onMove = (event: PointerEvent): void => {
    if (drag) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) {
        view.x = drag.vx + dx;
        view.y = drag.vy + dy;
        userMoved = true;
      }
      return;
    }
    const id = hitAt(event.clientX, event.clientY);
    if (id !== hover) {
      hover = id;
      canvas.style.cursor = id === null ? 'grab' : 'pointer';
    }
  };
  const onUp = (event: PointerEvent): void => {
    const wasClick = drag !== null && !drag.moved;
    drag = null;
    canvas.style.cursor = hover === null ? 'grab' : 'pointer';
    if (wasClick) {
      const id = hitAt(event.clientX, event.clientY);
      selected = id;
      callbacks.onSelect(id);
    }
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAround(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top);
  };
  function zoomAround(factor: number, px: number, py: number): void {
    const next = Math.max(0.3, Math.min(3, view.zoom * factor));
    const k = next / view.zoom;
    view.x = px - (px - view.x) * k;
    view.y = py - (py - view.y) * k;
    view.zoom = next;
    userMoved = true;
    sharpen();
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  let frame = 0;
  const loop = (now: number): void => {
    frame = requestAnimationFrame(loop);
    if (!input) return;
    if (layerDirty) renderLayer();
    const d = dpr();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#5a933f';
    ctx.fillRect(0, 0, width, height);
    if (layerScale > 0) {
      const k = view.zoom / layerScale;
      ctx.drawImage(layer, view.x + bounds.left * view.zoom, view.y + bounds.top * view.zoom, layer.width * k, layer.height * k);
    }
    ctx.setTransform(d * view.zoom, 0, 0, d * view.zoom, d * view.x, d * view.y);
    drawOverlay(now);
  };
  frame = requestAnimationFrame(loop);

  return {
    update(next) {
      const first = input === null;
      input = next;
      computeBounds();
      computeHits();
      layerDirty = true;
      if (first && !userMoved) fit();
    },
    setSelected(id) {
      selected = id;
    },
    effect(facilityId, text, color) {
      if (!input) return;
      const SITE_Y = siteYOf(input);
      const i = facilityId === null ? -1 : input.civic.findIndex((f) => f.id === facilityId);
      const x = i >= 0 ? civicX(i) + 1 : input.scene.focus.x;
      const y = i >= 0 ? 1.5 : input.scene.focus.y + SITE_Y;
      const offset = pops.length * 0.5;
      pops.push({ x: x - offset, y: y - offset, text, color, born: performance.now() });
    },
    zoomBy(factor) {
      zoomAround(factor, width / 2, height / 2);
    },
    fit() {
      userMoved = false;
      fit();
      sharpen();
    },
    dispose() {
      cancelAnimationFrame(frame);
      window.clearTimeout(sharpenTimer);
      observer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.remove();
    },
  };
}

/** 押したものの情報を場面から引く */
export function itemById(scene: Scene, id: string | null): SceneItem | undefined {
  return id === null ? undefined : scene.items.find((i) => i.id === id);
}

export { HU, unproject };
