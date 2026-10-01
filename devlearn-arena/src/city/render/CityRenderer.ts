import { city as cityColors, hud, mix, rgbaOf, state } from '@/ui/tokens';
import { createCamera, pan, rotateCamera, zoomAt, type Camera, type Viewport } from '../camera';
import { depthOrder, type DepthBox } from '../depth';
import { project, rotate, type Rotation } from '../projection';
import { roadShapes } from '../roadGeometry';
import { buildScene, type SceneObject } from '../scene';
import { MAP_SIZE, generateTerrain } from '../terrain';
import type { City } from '../types';
import { drawGround, prepareGround, toLayer, type GroundData, type LayerSpace } from './ground';
import { facilitySvg, SpriteCache } from './sprites';

/**
 * 都市ビューの描画（Canvas 2D）。模型（src/city）を読んで描くだけで、書き換えない。
 * 地面は拡大率と向きごとに区切って画像にし、建物と木は奥から手前の順に絵を置く。
 */

const CHUNK = 512;
const MAX_CHUNKS = 64;

export interface RenderStats {
  fps: number;
  frames: number;
  drawnObjects: number;
}

export class CityRenderer {
  readonly size = MAP_SIZE;
  camera: Camera;
  stats: RenderStats = { fps: 0, frames: 0, drawnObjects: 0 };
  /** 準備が終わり、最初の絵を描いたら true */
  ready = false;

  private ctx: CanvasRenderingContext2D;
  private viewport: Viewport = { width: 1, height: 1 };
  private dpr = 1;
  private ground: GroundData;
  private objects: SceneObject[];
  private sprites: SpriteCache;
  private chunks = new Map<string, HTMLCanvasElement>();
  private order: { rotation: Rotation; list: number[] } | null = null;
  private raf = 0;
  private dirty = true;
  private frameTimes: number[] = [];
  private onReady: (() => void) | undefined;

  constructor(private readonly canvas: HTMLCanvasElement, cityState: City, onReady?: () => void) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D が使えない');
    this.ctx = ctx;
    this.onReady = onReady;
    const terrain = generateTerrain(cityState.seed);
    this.ground = prepareGround(terrain, roadShapes(cityState.roads));
    this.objects = buildScene(cityState, terrain);
    this.camera = createCamera({ x: 48.5, y: 48 }, 1.25, 0);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.sprites = new SpriteCache(this.dpr);
    const svgs: { key: string; svg: string }[] = [];
    for (const o of this.objects) {
      if (o.source.kind !== 'facility') continue;
      const svg = facilitySvg(o.source.type, o.source.level);
      if (svg) svgs.push({ key: `${o.source.type}:${String(o.source.level)}`, svg });
    }
    void this.sprites.preload(svgs).then(() => {
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

  private sortedObjects(): number[] {
    const rotation = this.camera.rotation;
    if (this.order?.rotation === rotation) return this.order.list;
    const boxes: DepthBox[] = this.objects.map((o) => {
      const a = rotate({ x: o.x, y: o.y }, rotation, this.size);
      const b = rotate({ x: o.x + o.w, y: o.y + o.d }, rotation, this.size);
      return {
        min: [Math.min(a.x, b.x), Math.min(a.y, b.y), o.z],
        max: [Math.max(a.x, b.x), Math.max(a.y, b.y), o.z + o.height],
      };
    });
    const list = depthOrder(boxes);
    this.order = { rotation, list };
    return list;
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
    if (!this.ready) return;
    const s = this.space();
    let drawn = 0;
    for (const index of this.sortedObjects()) {
      const obj = this.objects[index] as SceneObject;
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
    this.stats.drawnObjects = drawn;
    if (this.onReady) {
      const done = this.onReady;
      this.onReady = undefined;
      done();
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
