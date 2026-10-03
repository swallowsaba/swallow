import { accent, city as cityColors, domain as domainColors, fontFamily, hud, mix, rgbaOf, state } from '@/ui/tokens';
import { FACILITY_DEFS } from '../facilities';
import { layoutLabels, type LabelRequest, type Obstacle, type ScreenRect } from '../labels';
import type { Overlay, OverlayKind } from '../overlay';
import { boxOutline, pickAt } from '../pick';
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
import { agentSvg, allAgentSvgs, allFacilitySvgs, facilityAsset, facilitySvg, SpriteCache } from './sprites';

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

/** 選んでいる物（施設か区画の建物） */
export interface Selection {
  kind: 'facility' | 'building';
  id: string;
}

export interface RenderStats {
  fps: number;
  frames: number;
  drawnObjects: number;
  agents: number;
  /** 置けた名札の数と、置きたかった数 */
  labels: number;
  labelsWanted: number;
}

export class CityRenderer {
  readonly size = MAP_SIZE;
  camera: Camera;
  stats: RenderStats = { fps: 0, frames: 0, drawnObjects: 0, agents: 0, labels: 0, labelsWanted: 0 };
  /** 最後に描いた名札（撮影と確かめの道具が読む） */
  lastLabels: { id: string; x: number; y: number; width: number; height: number }[] = [];
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
  private order: {
    rotation: Rotation;
    list: number[];
    boxes: DepthBox[];
    position: Int32Array;
    grid: Map<number, number[]>;
    /** 拡大率 1 の、立体の画面の上の範囲（x0, y0, x1, y1 の並び） */
    rects: Float64Array;
    /** 拡大率 1 の、立体の画面の上の輪郭 */
    outlines: { sx: number; sy: number }[][];
  } | null = null;
  /** 名札を置かない画面の端（情報パネルを開いている時の右など） */
  private labelInsets = { right: 8 };
  private labelBlocks: ScreenRect[] = [];
  private selection: Selection | null = null;
  /** 変化のあった場所の光の輪（docs/city-design.md 5 章）。until は performance.now() の時刻 */
  private highlight: { at: Point; size: Point; until: number } | null = null;
  private overlay: { kind: OverlayKind; data: Overlay } | null = null;
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

  setSelection(selection: Selection | null): void {
    this.selection = selection;
    this.dirty = true;
  }

  /** 変化のあった場所を、光の輪でしばらく示す（ms ミリ秒） */
  setHighlight(at: Point, size: Point, ms = 6000): void {
    this.highlight = { at, size, until: performance.now() + ms };
    this.dirty = true;
  }

  setLabelInsets(insets: { right: number }): void {
    this.labelInsets = insets;
    this.dirty = true;
  }

  /** 名札を置かない画面の上の範囲（都市の上に重ねた知らせなど。画素） */
  setLabelBlocks(blocks: ScreenRect[]): void {
    const key = JSON.stringify(blocks);
    if (key === JSON.stringify(this.labelBlocks)) return;
    this.labelBlocks = blocks;
    this.dirty = true;
  }

  setOverlay(overlay: { kind: OverlayKind; data: Overlay } | null): void {
    this.overlay = overlay;
    this.dirty = true;
  }

  /** 道路の網と車（表示切替の交通が使う） */
  traffic(): { net: Network; agents: Agent[] } {
    return { net: this.net, agents: this.agents };
  }

  /** 画面の点の下にある、選べる物（施設と区画の建物）。一番手前の物 */
  objectAt(sx: number, sy: number): Selection | null {
    const order = this.sortedObjects();
    const o = this.layerOrigin();
    const point = { sx: (sx - o.x) / this.camera.zoom, sy: (sy - o.y) / this.camera.zoom };
    const candidates: { index: number; box: DepthBox; position: number }[] = [];
    this.objects.forEach((obj, index) => {
      if (!obj.select) return;
      const r = order.rects;
      if (point.sx < (r[index * 4] as number) || point.sx > (r[index * 4 + 2] as number) || point.sy < (r[index * 4 + 1] as number) || point.sy > (r[index * 4 + 3] as number)) return;
      candidates.push({ index, box: order.boxes[index] as DepthBox, position: order.position[index] as number });
    });
    const hit = pickAt(candidates, point);
    const obj = hit >= 0 ? this.objects[(candidates[hit] as { index: number }).index] : undefined;
    return obj?.select ?? null;
  }

  /** 地図の点を画面の中央に持ってくる */
  focusOn(x: number, y: number): void {
    this.camera = { ...this.camera, focus: { x: Math.max(0, Math.min(this.size, x)), y: Math.max(0, Math.min(this.size, y)) } };
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
    const rects = new Float64Array(boxes.length * 4);
    const outlines: { sx: number; sy: number }[][] = [];
    boxes.forEach((b, i) => {
      const outline = boxOutline(b);
      outlines.push(outline);
      rects[i * 4] = Math.min(...outline.map((p) => p.sx));
      rects[i * 4 + 1] = Math.min(...outline.map((p) => p.sy));
      rects[i * 4 + 2] = Math.max(...outline.map((p) => p.sx));
      rects[i * 4 + 3] = Math.max(...outline.map((p) => p.sy));
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
    this.order = { rotation, list, boxes, position, grid, rects, outlines };
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
    this.drawSelectionBase(o);
    this.drawHighlight(o);
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
        const asset = facilityAsset(obj.source.type, obj.source.level);
        sprite = asset ? this.sprites.facility(asset.key, asset.svg, rot, this.camera.zoom) : null;
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
    this.drawOverlay(o);
    this.drawPreview(o);
    this.drawLabels(o, order);
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

  /** 選んでいる物の足元（金の枠。docs/visual-design.md 1 章: 光は選択などの意味のある所だけ） */
  private drawSelectionBase(o: { x: number; y: number }): void {
    const sel = this.selection;
    if (!sel) return;
    const obj = this.objects.find((x) => x.select?.id === sel.id);
    if (!obj) return;
    const ctx = this.ctx;
    const s = this.space();
    const pad = 0.06;
    const pts = [{ x: obj.x - pad, y: obj.y - pad }, { x: obj.x + obj.w + pad, y: obj.y - pad }, { x: obj.x + obj.w + pad, y: obj.y + obj.d + pad }, { x: obj.x - pad, y: obj.y + obj.d + pad }];
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = toLayer(s, p);
      if (i === 0) ctx.moveTo(o.x + x, o.y + y);
      else ctx.lineTo(o.x + x, o.y + y);
    });
    ctx.closePath();
    ctx.fillStyle = rgbaOf(accent.gold, 0.28);
    ctx.fill();
    ctx.strokeStyle = accent.goldLight;
    ctx.lineWidth = Math.max(2, 2.5 * this.camera.zoom);
    ctx.stroke();
  }

  /** 変化のあった場所の足元に、広がっては消える金の輪を描く（意味のある所だけを光らせる） */
  private drawHighlight(o: { x: number; y: number }): void {
    const h = this.highlight;
    if (!h) return;
    const now = performance.now();
    if (now > h.until) {
      this.highlight = null;
      return;
    }
    // 輪が動いている間は描き直し続ける
    this.dirty = true;
    const ctx = this.ctx;
    const s = this.space();
    const [cx, cy] = toLayer(s, h.at);
    // 敷地の角（少し外側）までの横の幅を、輪の半径にする
    const half = Math.max(h.size.x, h.size.y) / 2 + 0.8;
    const radius = Math.max(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => Math.abs(toLayer(s, { x: h.at.x + (dx ?? 0) * half, y: h.at.y + (dy ?? 0) * half })[0] - cx)));
    const fade = Math.min(1, (h.until - now) / 1000);
    for (let k = 0; k < 2; k += 1) {
      const t = ((now / 1600 + k / 2) % 1);
      const r = radius * (0.8 + t * 0.5);
      ctx.beginPath();
      ctx.ellipse(o.x + cx, o.y + cy, r, r / 2, 0, 0, Math.PI * 2);
      ctx.strokeStyle = rgbaOf(accent.goldLight, (1 - t) * 0.9 * fade);
      ctx.lineWidth = Math.max(2, 3 * this.camera.zoom);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(o.x + cx, o.y + cy, radius * 0.8, radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = rgbaOf(accent.gold, 0.18 * fade);
    ctx.fill();
  }

  /** 表示の切り替え（学習の進み・人口・交通・発展段階を色で重ねる） */
  private drawOverlay(o: { x: number; y: number }): void {
    const ov = this.overlay;
    if (!ov) return;
    const ctx = this.ctx;
    const s = this.space();
    const poly = (pts: readonly { x: number; y: number }[]): void => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [x, y] = toLayer(s, p);
        if (i === 0) ctx.moveTo(o.x + x, o.y + y);
        else ctx.lineTo(o.x + x, o.y + y);
      });
      ctx.closePath();
    };
    const rect = (r: { x: number; y: number; w: number; h: number }): { x: number; y: number }[] => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
    if (ov.data.kind === 'areas') {
      if (ov.data.next) {
        poly(rect(ov.data.next));
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = state.info;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      poly(rect(ov.data.current));
      ctx.fillStyle = rgbaOf(accent.gold, 0.12);
      ctx.fill();
      ctx.strokeStyle = accent.gold;
      ctx.lineWidth = 3;
      ctx.stroke();
      return;
    }
    if (ov.data.kind === 'paths') {
      // 道路の線に沿って、道路の幅の 6 割ほどの太さで塗る（1 マスの道路の幅は拡大率 1 で約 28 画素）
      // 区切りの所で半透明の線が重ならないように、端は切りっぱなしにする
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, 17 * this.camera.zoom);
      for (const p of ov.data.paths) {
        ctx.beginPath();
        p.pts.forEach((q, i) => {
          const [x, y] = toLayer(s, q);
          if (i === 0) ctx.moveTo(o.x + x, o.y + y);
          else ctx.lineTo(o.x + x, o.y + y);
        });
        ctx.strokeStyle = rgbaOf(overlayColor(ov.kind, p.value), 0.75);
        ctx.stroke();
      }
      return;
    }
    for (const c of ov.data.cells) {
      poly([{ x: c.x + 0.05, y: c.y + 0.05 }, { x: c.x + 0.95, y: c.y + 0.05 }, { x: c.x + 0.95, y: c.y + 0.95 }, { x: c.x + 0.05, y: c.y + 0.95 }]);
      ctx.fillStyle = rgbaOf(overlayColor(ov.kind, c.value), 0.62);
      ctx.fill();
    }
  }

  /**
   * 施設の名札（docs/ui-design.md 8 章）。互いに重ならず、建物を隠さない。
   * 重なりそうならずらして引き出し線で結び、置けなければ間引く（src/city/labels.ts）。
   */
  private drawLabels(o: { x: number; y: number }, order: NonNullable<CityRenderer['order']>): void {
    const ctx = this.ctx;
    const { width, height } = this.viewport;
    const zoom = this.camera.zoom;
    const nameFont = `700 13px ${fontFamily.body}`;
    const numFont = `700 13px ${fontFamily.number}`;
    const requests: LabelRequest[] = [];
    const obstacles: Obstacle[] = [...this.labelBlocks];
    const info = new Map<string, { name: string; level: string; color: string }>();
    const r = order.rects;
    this.objects.forEach((obj, index) => {
      if (!obj.select) return;
      const x0 = o.x + (r[index * 4] as number) * zoom;
      const y0 = o.y + (r[index * 4 + 1] as number) * zoom;
      const x1 = o.x + (r[index * 4 + 2] as number) * zoom;
      const y1 = o.y + (r[index * 4 + 3] as number) * zoom;
      if (x1 < 0 || x0 > width || y1 < 0 || y0 > height) return;
      // 建物の立体の輪郭（敷地の地面は含めない）
      obstacles.push((order.outlines[index] ?? []).map((p) => ({ x: o.x + p.sx * zoom, y: o.y + p.sy * zoom })));
      if (obj.select.kind !== 'facility' || obj.source.kind !== 'facility') return;
      const def = FACILITY_DEFS[obj.source.type];
      if (def.group !== 'facility') return;
      ctx.font = nameFont;
      const nameW = ctx.measureText(def.name).width;
      ctx.font = numFont;
      const lv = `Lv${String(obj.source.level)}`;
      const lvW = ctx.measureText(lv).width;
      const box = order.boxes[index] as DepthBox;
      const top = project({ x: (box.min[0] + box.max[0]) / 2, y: (box.min[1] + box.max[1]) / 2, z: box.max[2] });
      requests.push({
        id: obj.select.id,
        ax: o.x + top.sx * zoom,
        ay: o.y + top.sy * zoom,
        width: Math.ceil(nameW + lvW + 30),
        height: 24,
        priority: (this.selection?.id === obj.select.id ? 100 : 0) + def.w * def.d,
      });
      info.set(obj.select.id, { name: def.name, level: lv, color: def.domain ? domainColors[def.domain] : accent.gold });
    });
    const placed = layoutLabels(requests, obstacles, { width, height, top: 56, bottom: 96, left: 8, right: this.labelInsets.right });
    this.stats.labels = placed.length;
    this.stats.labelsWanted = requests.length;
    this.lastLabels = placed.map((p) => ({ id: p.id, x: p.x, y: p.y, width: p.width, height: p.height }));
    for (const p of placed) {
      const meta = info.get(p.id);
      if (!meta) continue;
      const selected = this.selection?.id === p.id;
      // 引き出し線と、指す点
      if (p.leader) {
        ctx.strokeStyle = hud.line;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x + p.width / 2, p.y + p.height);
        ctx.lineTo(p.ax, p.ay);
        ctx.stroke();
        ctx.fillStyle = accent.gold;
        ctx.beginPath();
        ctx.arc(p.ax, p.ay, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // 札（角を斜めに切った暗い板と、分野の色の帯）
      const cut = 6;
      ctx.beginPath();
      ctx.moveTo(p.x + cut, p.y);
      ctx.lineTo(p.x + p.width, p.y);
      ctx.lineTo(p.x + p.width - cut, p.y + p.height);
      ctx.lineTo(p.x, p.y + p.height);
      ctx.closePath();
      ctx.fillStyle = selected ? accent.gold : hud.bgStrong;
      ctx.fill();
      ctx.strokeStyle = selected ? accent.goldLight : hud.line;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = meta.color;
      ctx.fillRect(p.x + cut + 2, p.y + 6, 4, p.height - 12);
      ctx.textBaseline = 'middle';
      ctx.font = nameFont;
      ctx.fillStyle = selected ? rgbaOf(hud.bg, 1) : hud.text;
      ctx.fillText(meta.name, p.x + cut + 11, p.y + p.height / 2 + 1);
      ctx.font = numFont;
      ctx.fillStyle = selected ? rgbaOf(hud.bg, 1) : accent.goldLight;
      ctx.fillText(meta.level, p.x + p.width - cut - 6 - ctx.measureText(meta.level).width, p.y + p.height / 2 + 1);
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

/** 表示の切り替えの色（弱い → 強い） */
function overlayColor(kind: OverlayKind, v: number): string {
  switch (kind) {
    case 'learning':
      return mix(hud.textSub, state.ok, v);
    case 'population':
      return mix(state.info, accent.gold, v);
    case 'traffic':
      return v < 0.5 ? mix(state.ok, state.warn, v * 2) : mix(state.warn, state.bad, (v - 0.5) * 2);
    case 'stage':
      return accent.gold;
  }
}
