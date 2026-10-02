import { city as cityColors, hud, mix, rgbaOf, state } from '@/ui/tokens';
import { createCamera, pan, rotateCamera, screenToWorld, zoomAt, type Camera, type Viewport } from '../camera';
import type { CellMark } from '../place';
import { constructionStage, SECONDS_PER_DAY } from '../rules';
import { agentPose, agentsOf, roadNetwork, type Agent, type Network } from '../traffic';
import { compareBoxes, depthOrder, type DepthBox } from '../depth';
import { project, rotate, type Rotation } from '../projection';
import { roadShapes, type RoadShape } from '../roadGeometry';
import { buildScene, type SceneObject } from '../scene';
import { MAP_SIZE, generateTerrain, type Terrain } from '../terrain';
import type { City, Facility, FacilityType, Point, Road } from '../types';
import { drawGround, prepareGround, toLayer, type GroundData, type LayerSpace } from './ground';
import { agentSvg, allAgentSvgs, allFacilitySvgs, facilitySvg, SpriteCache } from './sprites';

/**
 * 都市ビューの描画（Canvas 2D）。模型（src/city）を読んで描くだけで、書き換えない。
 * 地面は拡大率と向きごとに区切って画像にし、建物と木は奥から手前の順に絵を置く。
 */

const CHUNK = 512;
const MAX_CHUNKS = 64;

/** 配置の予告（置ける所は緑の枠、置けない所は赤の枠。docs/city-design.md 8 章） */
export interface Preview {
  cells: readonly CellMark[];
  /** 引こうとしている道路の形 */
  roads?: readonly Road[];
  /** 置こうとしている施設の姿 */
  ghost?: { type: FacilityType; origin: Point; rotation: Facility['rotation'] };
  ok: boolean;
}

export interface RenderStats {
  fps: number;
  frames: number;
  drawnObjects: number;
  agents: number;
}

export class CityRenderer {
  readonly size = MAP_SIZE;
  camera: Camera;
  stats: RenderStats = { fps: 0, frames: 0, drawnObjects: 0, agents: 0 };
  /** 準備が終わり、最初の絵を描いたら true */
  ready = false;

  private ctx: CanvasRenderingContext2D;
  private viewport: Viewport = { width: 1, height: 1 };
  private dpr = 1;
  private ground: GroundData;
  private terrain: Terrain;
  private cityState: City;
  private signature = '';
  private objects: SceneObject[];
  private preview: (Preview & { shapes: RoadShape[] }) | null = null;
  private sprites: SpriteCache;
  private chunks = new Map<string, HTMLCanvasElement>();
  private order: { rotation: Rotation; list: number[]; boxes: DepthBox[]; position: Int32Array; grid: Map<number, number[]> } | null = null;
  private net: Network;
  private agents: Agent[];
  private agentsKey = '';
  private raf = 0;
  private dirty = true;
  private frameTimes: number[] = [];
  private onReady: (() => void) | undefined;

  constructor(private readonly canvas: HTMLCanvasElement, cityState: City, onReady?: () => void) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D が使えない');
    this.ctx = ctx;
    this.onReady = onReady;
    this.terrain = generateTerrain(cityState.seed);
    this.cityState = cityState;
    this.ground = prepareGround(this.terrain, roadShapes(cityState.roads));
    this.ground.zones = cityState.zones;
    this.objects = buildScene(cityState, this.terrain);
    this.signature = sceneSignature(cityState);
    this.net = roadNetwork(cityState.roads);
    this.agents = agentsOf(cityState, this.net);
    this.agentsKey = agentsKeyOf(cityState);
    this.camera = createCamera({ x: 48.5, y: 48 }, 1.25, 0);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.sprites = new SpriteCache(this.dpr);
    void this.sprites.preload([...allFacilitySvgs(), ...allAgentSvgs()]).then(() => {
      this.ready = true;
      this.dirty = true;
    });
  }

  resize(width: number, height: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      this.sprites = new SpriteCache(dpr);
      this.chunks.clear();
    }
    this.viewport = { width, height };
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${String(width)}px`;
    this.canvas.style.height = `${String(height)}px`;
    this.dirty = true;
  }

  start(): void {
    const loop = (now: number): void => {
      this.frameTimes.push(now);
      while (this.frameTimes.length > 0 && now - (this.frameTimes[0] as number) > 1000) this.frameTimes.shift();
      this.stats.fps = this.frameTimes.length;
      this.stats.frames += 1;
      if (this.continuous) this.dirty = true;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /* ---------- 都市の変化 ---------- */

  /** 新しい都市の状態を描く。変わった所だけを作り直す */
  setCity(next: City): void {
    const prev = this.cityState;
    if (next === prev) return;
    this.cityState = next;
    let groundChanged = false;
    if (next.roads !== prev.roads) {
      this.ground.roads = roadShapes(next.roads);
      groundChanged = true;
    }
    if (next.zones !== prev.zones) {
      this.ground.zones = next.zones;
      groundChanged = true;
    }
    if (groundChanged) this.chunks.clear();
    if (next.roads !== prev.roads) this.net = roadNetwork(next.roads);
    const key = agentsKeyOf(next);
    if (next.roads !== prev.roads || key !== this.agentsKey) {
      this.agentsKey = key;
      this.agents = agentsOf(next, this.net);
    }
    const signature = sceneSignature(next);
    if (signature !== this.signature) {
      this.signature = signature;
      this.objects = buildScene(next, this.terrain);
      this.order = null;
    }
    this.dirty = true;
  }

  setPreview(preview: Preview | null): void {
    this.preview = preview ? { ...preview, shapes: preview.roads ? roadShapes(preview.roads) : [] } : null;
    this.dirty = true;
  }

  /** 画面の点の下にある地面のマス */
  cellAt(sx: number, sy: number): Point {
    const p = screenToWorld(this.camera, this.viewport, { sx, sy }, this.size);
    return { x: Math.floor(p.x), y: Math.floor(p.y) };
  }

  /** 画面の点の下にある地図の点（曲線の制御点など、マスより細かい位置） */
  pointAt(sx: number, sy: number): Point {
    return screenToWorld(this.camera, this.viewport, { sx, sy }, this.size);
  }

  /* ---------- 操作 ---------- */

  panBy(dx: number, dy: number): void {
    this.camera = pan(this.camera, this.viewport, dx, dy, this.size);
    this.dirty = true;
  }

  zoomBy(steps: number, at?: { sx: number; sy: number }): void {
    const point = at ?? { sx: this.viewport.width / 2, sy: this.viewport.height / 2 };
    this.camera = zoomAt(this.camera, this.viewport, steps, point, this.size);
    this.dirty = true;
  }

  rotateBy(dir: 1 | -1): void {
    this.camera = rotateCamera(this.camera, dir);
    this.dirty = true;
  }

  /* ---------- 描画 ---------- */

  private space(): LayerSpace {
    return { rotation: this.camera.rotation, zoom: this.camera.zoom, size: this.size };
  }

  /** 層の座標の原点が、画面のどこに来るか */
  private layerOrigin(): { x: number; y: number } {
    const f = rotate(this.camera.focus, this.camera.rotation, this.size);
    const p = project({ x: f.x, y: f.y, z: 0 });
    return { x: this.viewport.width / 2 - p.sx * this.camera.zoom, y: this.viewport.height / 2 - p.sy * this.camera.zoom };
  }

  private chunk(i: number, j: number): HTMLCanvasElement {
    const key = `${String(this.camera.rotation)}|${String(this.camera.zoom)}|${String(i)}|${String(j)}`;
    const hit = this.chunks.get(key);
    if (hit) {
      // 最近使った物を後ろへ（古い物から捨てる）
      this.chunks.delete(key);
      this.chunks.set(key, hit);
      return hit;
    }
    const c = document.createElement('canvas');
    c.width = Math.ceil(CHUNK * this.dpr);
    c.height = Math.ceil(CHUNK * this.dpr);
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, -i * CHUNK * this.dpr, -j * CHUNK * this.dpr);
      drawGround(ctx, this.space(), this.ground, { x0: i * CHUNK, y0: j * CHUNK, x1: (i + 1) * CHUNK, y1: (j + 1) * CHUNK });
    }
    this.chunks.set(key, c);
    while (this.chunks.size > MAX_CHUNKS) {
      const oldest = this.chunks.keys().next().value;
      if (oldest === undefined) break;
      this.chunks.delete(oldest);
    }
    return c;
  }

  private sortedObjects(): NonNullable<CityRenderer['order']> {
    const rotation = this.camera.rotation;
    if (this.order?.rotation === rotation) return this.order;
    const boxes: DepthBox[] = this.objects.map((o) => {
      const a = rotate({ x: o.x, y: o.y }, rotation, this.size);
      const b = rotate({ x: o.x + o.w, y: o.y + o.d }, rotation, this.size);
      return {
        min: [Math.min(a.x, b.x), Math.min(a.y, b.y), o.z],
        max: [Math.max(a.x, b.x), Math.max(a.y, b.y), o.z + o.height],
      };
    });
    const list = depthOrder(boxes);
    // 描く順の位置と、見る向きのマスごとの物（車と人を、建物の間の正しい順に差し込むため）
    const position = new Int32Array(boxes.length);
    list.forEach((index, pos) => {
      position[index] = pos;
    });
    const grid = new Map<number, number[]>();
    boxes.forEach((b, index) => {
      for (let x = Math.floor(b.min[0]); x < Math.ceil(b.max[0]); x += 1) {
        for (let y = Math.floor(b.min[1]); y < Math.ceil(b.max[1]); y += 1) {
          const k = y * 1024 + x;
          const cell = grid.get(k);
          if (cell) cell.push(index);
          else grid.set(k, [index]);
        }
      }
    });
    this.order = { rotation, list, boxes, position, grid };
    return this.order;
  }

  /**
   * 車と人の、今の位置と描く順。建物より手前か奥かを近くの物と比べ、
   * 奥にある物の後（一番遅いもの）に差し込む（docs/city-design.md 1 章の層: 建物と木 → 車と人）。
   */
  private placeAgents(order: NonNullable<CityRenderer['order']>): Map<number, { agent: Agent; x: number; y: number; facing: Rotation }[]> {
    const out = new Map<number, { agent: Agent; x: number; y: number; facing: Rotation }[]>();
    const seconds = this.cityState.day * SECONDS_PER_DAY;
    const rotation = this.camera.rotation;
    for (const agent of this.agents) {
      const pose = agentPose(this.net, agent, seconds);
      const r = agent.kind === 'car' ? 0.16 : 0.03;
      const v = rotate({ x: pose.x, y: pose.y }, rotation, this.size);
      const box: DepthBox = { min: [v.x - r, v.y - r, 0], max: [v.x + r, v.y + r, agent.kind === 'car' ? 0.12 : 0.15] };
      let after = -1;
      const cx = Math.floor(v.x);
      const cy = Math.floor(v.y);
      for (let dx = -4; dx <= 1; dx += 1) {
        for (let dy = -4; dy <= 1; dy += 1) {
          for (const index of order.grid.get((cy + dy) * 1024 + cx + dx) ?? []) {
            const pos = order.position[index] as number;
            if (pos <= after) continue;
            if (compareBoxes(order.boxes[index] as DepthBox, box) < 0) after = pos;
          }
        }
      }
      // 地図の向きでの進む向き（0: +y、1: -x、2: -y、3: +x）
      const facing: Rotation = Math.abs(pose.dx) > Math.abs(pose.dy) ? (pose.dx > 0 ? 3 : 1) : pose.dy > 0 ? 0 : 2;
      const list = out.get(after);
      const item = { agent, x: pose.x, y: pose.y, facing };
      if (list) list.push(item);
      else out.set(after, [item]);
    }
    return out;
  }

  private drawAgents(ctx: CanvasRenderingContext2D, o: { x: number; y: number }, items: { agent: Agent; x: number; y: number; facing: Rotation }[] | undefined): void {
    if (!items) return;
    const s = this.space();
    for (const item of items) {
      const name = `${item.agent.kind}-${String(item.agent.variant + 1)}`;
      const svg = agentSvg(name);
      if (!svg) continue;
      const rot = ((item.facing + this.camera.rotation) % 4) as Rotation;
      const sprite = this.sprites.facility(`agent:${name}`, svg, rot, this.camera.zoom);
      if (!sprite) continue;
      const [lx, ly] = toLayer(s, { x: item.x, y: item.y });
      ctx.drawImage(sprite.canvas, Math.round(o.x + lx - sprite.ox), Math.round(o.y + ly - sprite.oy), sprite.w, sprite.h);
    }
  }

  private draw(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const ctx = this.ctx;
    const { width, height } = this.viewport;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 背景（地盤の外の空）
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    const navy = rgbaOf(hud.bg, 1);
    sky.addColorStop(0, mix(navy, state.info, 0.32));
    sky.addColorStop(0.6, mix(navy, cityColors.water, 0.35));
    sky.addColorStop(1, navy);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const o = this.layerOrigin();
    // 地面の区切り
    const i0 = Math.floor(-o.x / CHUNK);
    const i1 = Math.floor((width - o.x) / CHUNK);
    const j0 = Math.floor(-o.y / CHUNK);
    const j1 = Math.floor((height - o.y) / CHUNK);
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        ctx.drawImage(this.chunk(i, j), Math.round(o.x + i * CHUNK), Math.round(o.y + j * CHUNK), CHUNK, CHUNK);
      }
    }

    // 建物と木（奥から手前）
    if (!this.ready) {
      this.drawFog(o);
      return;
    }
    const s = this.space();
    let drawn = 0;
    const order = this.sortedObjects();
    const agents = this.placeAgents(order);
    this.drawAgents(ctx, o, agents.get(-1));
    for (let pos = 0; pos < order.list.length; pos += 1) {
      const index = order.list[pos] as number;
      const obj = this.objects[index] as SceneObject;
      if (pos > 0) this.drawAgents(ctx, o, agents.get(pos - 1));
      const [lx, ly] = toLayer(s, { x: obj.x + obj.w / 2, y: obj.y + obj.d / 2 }, obj.z);
      const sx = o.x + lx;
      const sy = o.y + ly;
      // 見えない物は描かない（建物の絵の大きさの目安で判定）
      const reach = (Math.max(obj.w, obj.d) * 64 + 160) * this.camera.zoom;
      if (sx < -reach || sx > width + reach || sy < -reach || sy > height + reach * 0.5) continue;
      const rot = ((obj.facing + this.camera.rotation) % 4) as Rotation;
      let sprite;
      if (obj.source.kind === 'facility') {
        const key = `${obj.source.type}:${String(obj.source.level)}`;
        const svg = facilitySvg(obj.source.type, obj.source.level);
        sprite = svg ? this.sprites.facility(key, svg, rot, this.camera.zoom) : null;
      } else {
        sprite = this.sprites.model(obj.source.key, obj.source.model, rot, this.camera.zoom);
      }
      if (!sprite) continue;
      ctx.drawImage(sprite.canvas, Math.round(sx - sprite.ox), Math.round(sy - sprite.oy), sprite.w, sprite.h);
      drawn += 1;
    }
    this.drawAgents(ctx, o, agents.get(order.list.length - 1));
    this.stats.drawnObjects = drawn;
    this.stats.agents = this.agents.length;
    this.drawFog(o);
    this.drawPreview(o);
    if (this.onReady) {
      const done = this.onReady;
      this.onReady = undefined;
      done();
    }
  }

  /**
   * 霧（docs/city-design.md 1 章: 発展段階で外側の霧が晴れる）。
   * 晴れた範囲の外を、白く霞んだ半透明の層で覆う。境はぼかす。
   */
  private drawFog(o: { x: number; y: number }): void {
    const ctx = this.ctx;
    const { width, height } = this.viewport;
    const s = this.space();
    const mist = mix(cityColors.lineWhite, hud.textSub, 0.35);
    for (const r of this.cityState.revealed) {
      if (r.w >= this.size && r.h >= this.size) continue;
      const corners = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }]
        .map((p) => toLayer(s, p))
        .map(([x, y]) => [o.x + x, o.y + y] as [number, number]);
      const diamond = (): void => {
        ctx.beginPath();
        corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
      };
      // 外を覆う（全画面の矩形から、晴れた菱形を抜く）
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = rgbaOf(mist, 0.62);
      ctx.fill('evenodd');
      // 境のぼかし（太さを変えた線を、晴れた側にだけ重ねる）
      diamond();
      ctx.clip();
      for (const [w, a] of [[56, 0.1], [32, 0.12], [14, 0.14]] as const) {
        diamond();
        ctx.strokeStyle = rgbaOf(mist, a);
        ctx.lineWidth = w * this.camera.zoom;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** 配置の予告（マスの枠・道路の形・施設の姿） */
  private drawPreview(o: { x: number; y: number }): void {
    const p = this.preview;
    if (!p) return;
    const ctx = this.ctx;
    const s = this.space();
    const poly = (pts: readonly Point[]): void => {
      ctx.beginPath();
      pts.forEach((pt, i) => {
        const [x, y] = toLayer(s, pt);
        if (i === 0) ctx.moveTo(o.x + x, o.y + y);
        else ctx.lineTo(o.x + x, o.y + y);
      });
      ctx.closePath();
    };
    for (const shape of p.shapes) {
      poly(shape.outer);
      ctx.fillStyle = rgbaOf(p.ok ? cityColors.paving : state.bad, p.ok ? 0.75 : 0.45);
      ctx.fill();
    }
    if (p.ghost && p.ok) {
      const svg = facilitySvg(p.ghost.type, 1);
      const rot = ((p.ghost.rotation / 90 + this.camera.rotation) % 4) as Rotation;
      const sprite = svg ? this.sprites.facility(`${p.ghost.type}:1`, svg, rot, this.camera.zoom) : null;
      if (sprite) {
        const cells = p.cells;
        const cx = cells.reduce((a, c) => a + c.x + 0.5, 0) / Math.max(1, cells.length);
        const cy = cells.reduce((a, c) => a + c.y + 0.5, 0) / Math.max(1, cells.length);
        const [lx, ly] = toLayer(s, { x: cx, y: cy });
        ctx.globalAlpha = 0.72;
        ctx.drawImage(sprite.canvas, Math.round(o.x + lx - sprite.ox), Math.round(o.y + ly - sprite.oy), sprite.w, sprite.h);
        ctx.globalAlpha = 1;
      }
    }
    for (const c of p.cells) {
      poly([{ x: c.x + 0.04, y: c.y + 0.04 }, { x: c.x + 0.96, y: c.y + 0.04 }, { x: c.x + 0.96, y: c.y + 0.96 }, { x: c.x + 0.04, y: c.y + 0.96 }]);
      ctx.fillStyle = rgbaOf(c.ok ? state.ok : state.bad, 0.2);
      ctx.fill();
      ctx.strokeStyle = c.ok ? state.ok : state.bad;
      ctx.lineWidth = Math.max(1.5, 2 * this.camera.zoom);
      ctx.stroke();
    }
  }

  /** 次の描画で描き直す（動きのある物ができたら毎回呼ぶ） */
  invalidate(): void {
    this.dirty = true;
  }

  /** 計測用: 毎フレーム描き直させる（車や人が動く Phase 2 からは常に描き直す） */
  setContinuous(on: boolean): void {
    this.continuous = on;
  }
  private continuous = false;

  /** 地図の点の、いまの画面の位置 */
  screenOf(x: number, y: number, z = 0): { sx: number; sy: number } {
    const o = this.layerOrigin();
    const [lx, ly] = toLayer(this.space(), { x, y }, z);
    return { sx: o.x + lx, sy: o.y + ly };
  }
}

/** 描く物が変わったかを見分ける印（道路・区画の建物の段階・施設の段階） */
export function sceneSignature(c: City): string {
  const parts: string[] = [c.roads.map((r) => r.id).join(',')];
  for (const b of c.buildings) parts.push(`${b.id}:${String(b.level)}:${constructionStage(b.builtDay, c.day)}`);
  for (const f of c.facilities) parts.push(`${f.id}:${String(f.level)}:${f.state === 'active' ? 'done' : constructionStage(f.builtDay, c.day)}`);
  return parts.join('|');
}

/** 車と人の数が変わったかを見分ける印 */
function agentsKeyOf(c: City): string {
  return `${String(c.population)}:${String(c.facilities.filter((f) => f.state === 'active').length)}`;
}
