import { meshModel, type DrawOp, type Model } from '../generate/mesh';
import { svgView, viewForRotation } from '../generate/svg';
import type { Rotation } from '../projection';
import type { FacilityType } from '../types';

/**
 * 建物の絵を、拡大率ごとに一度だけ画像にして使い回す（docs/architecture.md 4 章）。
 */

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** 画像の中での接地の中心（CSS 画素） */
  ox: number;
  oy: number;
  /** CSS 画素での大きさ */
  w: number;
  h: number;
}

export function drawOps(ctx: CanvasRenderingContext2D, ops: readonly DrawOp[]): void {
  for (const op of ops) {
    ctx.globalAlpha = op.alpha ?? 1;
    ctx.fillStyle = op.fill;
    ctx.beginPath();
    if (op.kind === 'ellipse') {
      ctx.ellipse(op.cx, op.cy, op.rx, op.ry, 0, 0, Math.PI * 2);
    } else {
      ctx.moveTo(op.pts[0] as number, op.pts[1] as number);
      for (let i = 2; i < op.pts.length; i += 2) ctx.lineTo(op.pts[i] as number, op.pts[i + 1] as number);
      ctx.closePath();
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// 施設の SVG（src/city/assets/facilities/<施設>/lv<N>.svg）
const SVG_FILES = import.meta.glob('../assets/facilities/*/lv*.svg', { query: '?raw', import: 'default', eager: true });

/**
 * 施設のそのレベルの絵。そのレベルの SVG が無ければ、下のレベルの絵を使う。
 * key は実際に使う SVG のもの（読み込みの準備 allFacilitySvgs と同じ名前）
 */
export function facilityAsset(type: FacilityType, level: number): { key: string; svg: string } | null {
  for (let lv = level; lv >= 1; lv -= 1) {
    const text = SVG_FILES[`../assets/facilities/${type}/lv${String(lv)}.svg`];
    if (typeof text === 'string') return { key: `${type}:${String(lv)}`, svg: text };
  }
  return null;
}

export function facilitySvg(type: FacilityType, level: number): string | null {
  return facilityAsset(type, level)?.svg ?? null;
}

// 車と人の SVG（src/city/assets/agents/<car|person>-<N>.svg）
const AGENT_FILES = import.meta.glob('../assets/agents/*.svg', { query: '?raw', import: 'default', eager: true });

export function agentSvg(name: string): string | null {
  const text = AGENT_FILES[`../assets/agents/${name}.svg`];
  return typeof text === 'string' ? text : null;
}

export function allAgentSvgs(): { key: string; svg: string }[] {
  const out: { key: string; svg: string }[] = [];
  for (const [path, text] of Object.entries(AGENT_FILES)) {
    const m = /agents\/([a-z]+-\d)\.svg$/.exec(path);
    if (m && typeof text === 'string') out.push({ key: `agent:${m[1] as string}`, svg: text });
  }
  return out;
}

/** 全ての施設の SVG（読み込みの準備に使う） */
export function allFacilitySvgs(): { key: string; svg: string }[] {
  const out: { key: string; svg: string }[] = [];
  for (const [path, text] of Object.entries(SVG_FILES)) {
    const m = /facilities\/([a-z]+)\/lv(\d)\.svg$/.exec(path);
    if (m && typeof text === 'string') out.push({ key: `${m[1] as string}:${m[2] as string}`, svg: text });
  }
  return out;
}

export class SpriteCache {
  private readonly sprites = new Map<string, Sprite>();
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly loading = new Map<string, Promise<void>>();

  constructor(private readonly dpr: number) {}

  clear(): void {
    this.sprites.clear();
  }

  /** 模型の絵 */
  model(key: string, model: () => Model, rotation: Rotation, zoom: number): Sprite {
    const id = `${key}|${String(rotation)}|${String(zoom)}`;
    const hit = this.sprites.get(id);
    if (hit) return hit;
    const drawing = meshModel(model(), rotation);
    const b = drawing.bounds;
    const pad = 2;
    const w = Math.ceil((b.maxX - b.minX) * zoom + pad * 2);
    const h = Math.ceil((b.maxY - b.minY) * zoom + pad * 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * this.dpr));
    canvas.height = Math.max(1, Math.ceil(h * this.dpr));
    const ctx = canvas.getContext('2d');
    const ox = -b.minX * zoom + pad;
    const oy = -b.minY * zoom + pad;
    if (ctx) {
      ctx.setTransform(this.dpr * zoom, 0, 0, this.dpr * zoom, ox * this.dpr, oy * this.dpr);
      drawOps(ctx, drawing.ops);
    }
    const sprite = { canvas, ox, oy, w, h };
    this.sprites.set(id, sprite);
    return sprite;
  }

  /** 施設の SVG を読み込む（正面と裏の姿の両方。全部読み終えたら解決する） */
  preload(svgs: { key: string; svg: string }[]): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const { key, svg } of svgs) {
      for (const view of ['front', 'back'] as const) jobs.push(this.loadImage(`${key}:${view}`, svgView(svg, view).svg));
    }
    return Promise.all(jobs).then(() => undefined);
  }

  private loadImage(key: string, svg: string): Promise<void> {
    const existing = this.loading.get(key);
    if (existing) return existing;
    const p = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(key, img);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    this.loading.set(key, p);
    return p;
  }

  /**
   * 施設の SVG の絵。正面と裏の姿を、左右の映しと組み合わせて 4 つの向きにする
   * （src/city/generate/svg.ts の viewForRotation）。
   */
  facility(key: string, svg: string, rotation: Rotation, zoom: number): Sprite | null {
    const { view, mirrored } = viewForRotation(rotation);
    const id = `svg:${key}|${view}|${mirrored ? 'm' : 'n'}|${String(zoom)}`;
    const hit = this.sprites.get(id);
    if (hit) return hit;
    const img = this.images.get(`${key}:${view}`);
    if (!img) return null;
    const vb = svgView(svg, view).viewBox;
    const w = Math.ceil(vb.w * zoom);
    const h = Math.ceil(vb.h * zoom);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * this.dpr));
    canvas.height = Math.max(1, Math.ceil(h * this.dpr));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (mirrored) ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    const ox = mirrored ? w + vb.x * zoom : -vb.x * zoom;
    const sprite = { canvas, ox, oy: -vb.y * zoom, w, h };
    this.sprites.set(id, sprite);
    return sprite;
  }
}
