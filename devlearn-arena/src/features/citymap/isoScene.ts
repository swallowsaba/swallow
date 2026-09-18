import type { BuildingKind } from '@/content/city';
import { TONE_COLOR, type PlannedBlock, type PlannedRoad, type Scene, type SceneBuilding, type SceneItem, type Tone, type TownPlan } from '@/engines/cityscape';
import type { MissionTrack } from '@/engines/lesson/types';
import { drawMoodFace } from '@/visual/game/faceCanvas';
import { MOOD_OF_VOICE } from '@/visual/game/faces';
import {
  box, cylinder, diamond, facilityBuilding, gable, HU, lamp, poly, project, shade, TH, TRACK_ACCENT, tree, TW, unproject, windows,
  type Ctx,
} from './isoDraw';
import { townLayout, type TownLayout } from './townLayout';

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

const MARGIN = 6;

export { houseLevels } from './townLayout';

/** 地図全体の大きさ（マス） */
export function mapSize(layout: TownLayout): { w: number; h: number } {
  return { w: layout.width + 1, h: layout.height + 1 };
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

/* ---------------- 街を描く ---------------- */

const GRASS = ['#76b24f', '#6fab49'];
const GRASS_OUT = ['#5f9a43', '#5a933f'];
const ASPHALT = '#6f757c';
const ASPHALT_MAIN = '#787e85';
const KERB = '#cfc8b8';
const PAVING = '#a49c8c';

/** マスの矩形を等角で塗る */
function slab(ctx: Ctx, x: number, y: number, w: number, d: number, fill: string, stroke: string | null = null, width = 1): void {
  poly(ctx, [project(x, y), project(x + w, y), project(x + w, y + d), project(x, y + d)], fill, stroke, width);
}

function dashedLine(ctx: Ctx, from: { sx: number; sy: number }, to: { sx: number; sy: number }, color: string, dash: [number, number], width = 1.4): void {
  ctx.save();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.sx, from.sy);
  ctx.lineTo(to.sx, to.sy);
  ctx.stroke();
  ctx.restore();
}

/** 通り。舗装と縁石、大通りには中央線 */
function drawRoad(ctx: Ctx, road: PlannedRoad, dy: number): void {
  const y = road.y + dy;
  const main = road.kind === 'avenue';
  slab(ctx, road.x, y, road.w, road.d, main ? ASPHALT_MAIN : ASPHALT);
  if (road.axis === 'x') {
    slab(ctx, road.x, y, road.w, 0.22, KERB);
    slab(ctx, road.x, y + road.d - 0.22, road.w, 0.22, KERB);
    dashedLine(ctx, project(road.x + 0.5, y + road.d / 2), project(road.x + road.w - 0.5, y + road.d / 2), 'rgba(255,255,255,0.85)', main ? [8, 7] : [5, 6]);
  } else {
    slab(ctx, road.x, y, 0.22, road.d, KERB);
    slab(ctx, road.x + road.w - 0.22, y, 0.22, road.d, KERB);
    dashedLine(ctx, project(road.x + road.w / 2, y + 0.4), project(road.x + road.w / 2, y + road.d - 0.4), 'rgba(255,255,255,0.75)', [5, 6]);
  }
}

/** 交差点。舗装を継ぎ、横断歩道の縞を引く */
function drawCrossing(ctx: Ctx, c: { x: number; y: number; w: number; d: number }, dy: number): void {
  const y = c.y + dy;
  slab(ctx, c.x, y, c.w, c.d, ASPHALT_MAIN);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  for (let i = 0.25; i < c.w; i += 0.45) {
    const a = project(c.x + i, y + 0.25);
    const b = project(c.x + i, y + 0.85);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
    const e = project(c.x + i, y + c.d - 0.85);
    const f = project(c.x + i, y + c.d - 0.25);
    ctx.beginPath();
    ctx.moveTo(e.sx, e.sy);
    ctx.lineTo(f.sx, f.sy);
    ctx.stroke();
  }
  ctx.restore();
}

/** 更地の区画。縄張りの杭とロープで「これから建つ場所」だと分かるようにする */
function drawVacantLot(ctx: Ctx, x: number, y: number, w: number, d: number): void {
  slab(ctx, x + 0.18, y + 0.18, w - 0.36, d - 0.36, '#b9ae97');
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.2;
  const corners = [
    project(x + 0.18, y + 0.18),
    project(x + w - 0.18, y + 0.18),
    project(x + w - 0.18, y + d - 0.18),
    project(x + 0.18, y + d - 0.18),
  ];
  ctx.beginPath();
  corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy)));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  for (const [cx, cy] of [[x + 0.2, y + 0.2], [x + w - 0.2, y + 0.2], [x + w - 0.2, y + d - 0.2], [x + 0.2, y + d - 0.2]] as const) {
    const a = project(cx, cy);
    const b = project(cx, cy, 0.22);
    ctx.strokeStyle = '#8c8375';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
}

/** 街区。歩道のふちと地面、空いた内側は中庭、空いた区画は更地 */
function drawBlock(ctx: Ctx, block: PlannedBlock, dy: number): void {
  const y = block.y + dy;
  slab(ctx, block.x, y, block.w, block.d, KERB, 'rgba(60,55,45,0.35)', 1);
  slab(ctx, block.x + 0.7, y + 0.7, block.w - 1.4, block.d - 1.4, PAVING);
  if (block.tone) slab(ctx, block.x + 0.7, y + 0.7, block.w - 1.4, block.d - 1.4, `${TONE_COLOR[block.tone]}22`);
  if (block.yard) {
    const yd = block.yard;
    slab(ctx, yd.x, yd.y + dy, yd.w, yd.d, '#7fae54', 'rgba(50,80,40,0.4)', 1);
  }
  for (const lot of block.free) drawVacantLot(ctx, lot.x, lot.y + dy, lot.w, lot.d);
}

interface Draw {
  key: number;
  draw: (ctx: Ctx) => void;
}

/** 街区の内側の庭に木を植える */
function yardTrees(block: PlannedBlock, dy: number): Draw[] {
  if (!block.yard) return [];
  const yd = block.yard;
  const out: Draw[] = [];
  for (let i = 0; i < Math.max(1, Math.floor(yd.w / 2)); i += 1) {
    for (let k = 0; k < Math.max(1, Math.floor(yd.d / 2)); k += 1) {
      const x = yd.x + 0.8 + i * 2;
      const y = yd.y + dy + 0.8 + k * 2;
      const seed = (Math.round(x * 31 + y * 17) * 2654435761) >>> 0;
      out.push({ key: x + y, draw: (ctx: Ctx) => { tree(ctx, x, y, seed, 0.7); } });
    }
  }
  return out;
}

/** 大通りの縁に等間隔で街灯を立てる */
function roadLamps(roads: readonly PlannedRoad[], dy: number): Draw[] {
  const out: Draw[] = [];
  for (const road of roads) {
    if (road.kind !== 'avenue') continue;
    const y = road.y + dy + road.d - 0.35;
    for (let x = road.x + 2; x < road.x + road.w; x += 6) {
      const px = x;
      out.push({ key: px + y, draw: (ctx: Ctx) => { lamp(ctx, px, y); } });
    }
  }
  return out;
}

function roadColors(kind: string): { fill: string; edge: string } {
  if (kind === 'plan') return { fill: '#d8c9a3', edge: '#b59d6a' };
  if (kind === 'blocked') return { fill: '#7b7f85', edge: '#e0483a' };
  if (kind === 'main') return { fill: ASPHALT_MAIN, edge: '#d9d3c4' };
  return { fill: ASPHALT, edge: '#d9d3c4' };
}

/** 割り付け（道・交差点・街区）をまとめて描く */
function drawPlan(ctx: Ctx, plan: TownPlan, dy: number): void {
  for (const road of plan.roads) drawRoad(ctx, road, dy);
  for (const c of plan.crossings) drawCrossing(ctx, c, dy);
  for (const block of plan.blocks) drawBlock(ctx, block, dy);
}

/** 動かないもの（地面・道・街区・建物・市民施設・住宅）を描く */
export function drawStatic(ctx: Ctx, input: SceneMapInput, layout: TownLayout): void {
  const { scene, civic, track } = input;
  const SITE_Y = layout.siteY;
  const { w, h } = mapSize(layout);
  for (let y = -MARGIN; y < h + MARGIN; y += 1) {
    for (let x = -MARGIN; x < w + MARGIN; x += 1) {
      const inside = x >= -1 && y >= -1 && x < w + 1 && y < h + 1;
      const checker = (x + y) % 2 === 0;
      const palette = inside ? GRASS : GRASS_OUT;
      diamond(ctx, x, y, palette[checker ? 0 : 1] ?? GRASS[0] ?? '#76b24f');
    }
  }

  // 上町（市民施設と住宅街）と下町（現場）。大通りで背中合わせにつながる
  drawPlan(ctx, layout.uptown, 0);
  drawPlan(ctx, layout.site, SITE_Y);

  const at = (x: number, y: number) => ({ x, y: y + SITE_Y });
  // 場面が自前で持つ区画と道（特別な区画や通行止め）
  for (const item of scene.items) {
    if (item.type === 'plot') {
      const p = at(item.x, item.y);
      slab(ctx, p.x, p.y, item.w, item.d, `${TONE_COLOR[item.tone]}33`, `${TONE_COLOR[item.tone]}cc`, 1.5);
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

  // 立っているもの：奥から手前へ
  const draws: Draw[] = [];
  const HOUSE_COLORS = ['#f2e4cf', '#e8c9a2', '#f4efe6', '#d9b48f', '#e6dccb'];
  const HOUSE_ROOFS = ['#b5533c', '#7a4f3f', '#566577', '#9c3f33', '#c77b3e'];
  layout.houses.forEach((home, i) => {
    const wall = HOUSE_COLORS[i % HOUSE_COLORS.length] ?? '#f2e4cf';
    const roofColor = HOUSE_ROOFS[i % HOUSE_ROOFS.length] ?? '#b5533c';
    const hx = home.x + 0.3;
    const hy = home.y + 0.3;
    draws.push({
      key: hx + hy + 1,
      draw: (c: Ctx) => {
        const hgt = 0.4 + (home.level - 1) * 0.42;
        box(c, hx, hy, home.w - 0.6, home.d - 0.6, hgt, wall);
        if (home.level <= 2) gable(c, hx - 0.05, hy - 0.05, home.w - 0.5, home.d - 0.5, hgt, 0.35, roofColor);
        else {
          windows(c, hx, hy, home.w - 0.6, home.d - 0.6, hgt, 0.42, 'rgba(60,80,110,0.5)');
          box(c, hx + 0.15, hy + 0.15, home.w - 0.9, home.d - 0.9, 0.1, roofColor, hgt);
        }
      },
    });
  });

  const accent = TRACK_ACCENT[track];
  for (const f of civic) {
    const lot = layout.civicLot.get(f.id);
    if (!lot) continue;
    const { x, y } = lot;
    if (f.learned) {
      draws.push({ key: x + y + 2, draw: (c: Ctx) => { facilityBuilding(c, f.kind, accent, x, y, f.ratio, f.build); } });
    } else {
      draws.push({ key: x + y, draw: (c: Ctx) => { drawVacantLot(c, x, y, lot.w, lot.d); } });
    }
  }

  for (const block of layout.uptown.blocks) draws.push(...yardTrees(block, 0));
  for (const block of layout.site.blocks) draws.push(...yardTrees(block, SITE_Y));
  draws.push(...roadLamps(layout.uptown.roads, 0));
  draws.push(...roadLamps(layout.site.roads, SITE_Y));

  for (let x = -MARGIN; x < w + MARGIN; x += 3) {
    const seed = (x * 7919) >>> 0;
    draws.push({ key: x - MARGIN, draw: (c: Ctx) => { tree(c, x + 0.5, -2.5 - (seed % 2), seed); } });
    draws.push({ key: x + h + 2, draw: (c: Ctx) => { tree(c, x + 1, h + 2 + (seed % 2), seed >>> 2); } });
  }
  for (const item of scene.items) {
    if (item.type !== 'building') continue;
    const p = at(item.x, item.y);
    draws.push({ key: p.x + p.y + item.w + item.d, draw: (c: Ctx) => { drawBuilding(c, item, p.x, p.y); } });
  }
  draws.sort((a, b) => a.key - b.key);
  for (const d of draws) d.draw(ctx);
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
  let layout: TownLayout | null = null;
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
    if (!layout) return;
    const { w, h } = mapSize(layout);
    const left = project(-MARGIN, h + MARGIN).sx;
    const right = project(w + MARGIN, -MARGIN).sx;
    const top = project(-MARGIN, -MARGIN).sy - 260;
    const bottom = project(w + MARGIN, h + MARGIN).sy;
    bounds = { left, top, width: right - left, height: bottom - top };
  }

  function fit(): void {
    if (!input || !layout) return;
    // 街全体（上町の大通りから下町の現場まで）が端まで画面に入るように寄せる
    const sw = Math.max(12, layout.width);
    const sh = Math.max(8, layout.height);
    const spanW = (sw + sh) * (TW / 2);
    const spanH = (sw + sh) * (TH / 2) + 120;
    const zoom = Math.max(0.22, Math.min((width - 40) / spanW, (height - 190) / spanH, 1.8));
    view.zoom = zoom;
    const focus = project(sw / 2, sh / 2, 1);
    view.x = width / 2 - focus.sx * zoom;
    view.y = 70 + (height - 190) / 2 - focus.sy * zoom;
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
    if (layout) drawStatic(layerCtx, input, layout);
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
    if (!input || !layout) return;
    const SITE_Y = layout.siteY;
    const list: Hit[] = [];
    for (const f of input.civic) {
      const lot = layout.civicLot.get(f.id);
      if (!lot) continue;
      const a = project(lot.x, lot.y + lot.d);
      const b = project(lot.x + lot.w, lot.y);
      const top = project(lot.x + lot.w / 2, lot.y + lot.d / 2, 3.5).sy;
      list.push({ id: `civic:${f.id}`, left: a.sx, right: b.sx, top, bottom: project(lot.x + lot.w, lot.y + lot.d).sy });
    }
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
    if (!input || !layout) return;
    const SITE_Y = layout.siteY;
    const plan = layout;
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
    // 街区の名札（この街区が何か）。地図の見出しなので、引いていても必ず出す
    {
      for (const [blockPlan, dy] of [[plan.uptown, 0] as const, [plan.site, SITE_Y] as const]) {
        for (const block of blockPlan.blocks) {
          if (block.label === undefined || block.label === '') continue;
          const at = project(block.x + block.w / 2, block.y + dy);
          const text = block.label.length > 22 ? `${block.label.slice(0, 21)}…` : block.label;
          chip(text, at.sx, at.sy - 4 / view.zoom, block.tone ? tone(block.tone) : 'rgba(44,29,16,0.82)');
        }
      }
    }

    // 市民施設の看板と住民の声
    civic.forEach((f, i) => {
      const lot = plan.civicLot.get(f.id);
      if (!lot) return;
      const cx = lot.x + lot.w / 2;
      const cy = lot.y + lot.d / 2;
      const p = project(cx, cy, f.learned ? 3.6 : 1.2);
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
        const c = project(cx, cy);
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
      layout = townLayout(next);
      computeBounds();
      computeHits();
      layerDirty = true;
      if (first && !userMoved) fit();
    },
    setSelected(id) {
      selected = id;
    },
    effect(facilityId, text, color) {
      if (!input || !layout) return;
      const lot = facilityId === null ? undefined : layout.civicLot.get(facilityId);
      const x = lot ? lot.x + lot.w / 2 : input.scene.focus.x;
      const y = lot ? lot.y + lot.d / 2 : input.scene.focus.y + layout.siteY;
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
