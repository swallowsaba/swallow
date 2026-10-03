import type { Drawing, DrawOp } from './mesh';
import { clockwise, dropHidden, groupOps } from './svgCompact';

/**
 * 描く命令の列を SVG にする（施設の素材を作る道具が使う）。
 *
 * 1 つの施設の 1 つのレベル = 1 つの SVG（docs/visual-design.md 5 章）。
 * 正面から見た姿（回転 0）を本体に描き、裏から見た姿（回転 2）を <defs> の中の
 * <g id="back"> に持つ。左右を映せば、90 度ごとの 4 つの向きが全て正しく描ける。
 * 原点は接地の中心。30KB に収めるため、隠れて見えない面を省き、同じ色の多角形を 1 つの path にまとめ（src/city/generate/svgCompact.ts）、
 * 多角形は相対座標で書き、色は class にまとめる。
 */

const round = (v: number): number => Math.round(v * 10) / 10;
const num = (v: number): string => {
  const s = String(round(v));
  return s.startsWith('0.') ? s.slice(1) : s.startsWith('-0.') ? `-${s.slice(2)}` : s;
};

/** 数の並びを、区切りを詰めて書く（負の数の前は区切りが要らない） */
function joinNums(values: number[]): string {
  let out = '';
  for (const v of values) {
    const s = num(v);
    if (out === '' || s.startsWith('-')) out += s;
    else if (s.startsWith('.') && /\.\d*$/.test(out.split(/[ -]/).pop() ?? '')) out += s;
    else out += ` ${s}`;
  }
  return out;
}

/**
 * 多角形を path の文字列にする。from（前の多角形の始点）があれば、そこからの相対で始める（まとめた path の 2 つ目から）。
 * 縦の辺は v、横の辺は h で短く書く
 */
function pathData(pts: number[], from?: [number, number]): string {
  let x = round(pts[0] as number);
  let y = round(pts[1] as number);
  let out = from ? `m${joinNums([x - from[0], y - from[1]])}` : `M${joinNums([x, y])}`;
  let cmd = '';
  let args: number[] = [];
  const flush = (): void => {
    if (cmd) out += cmd + joinNums(args);
    args = [];
  };
  for (let i = 2; i < pts.length; i += 2) {
    const nx = round(pts[i] as number);
    const ny = round(pts[i + 1] as number);
    const dx = round(nx - x);
    const dy = round(ny - y);
    const [c, a] = dx === 0 ? ['v', [dy]] : dy === 0 ? ['h', [dx]] : ['l', [dx, dy]];
    if (c !== cmd) {
      flush();
      cmd = c;
    }
    args.push(...a);
    x = nx;
    y = ny;
  }
  flush();
  return `${out}z`;
}

/** まとめた多角形を 1 つの path の文字列にする */
function multiPathData(polys: number[][]): string {
  let d = '';
  let from: [number, number] | undefined;
  for (const pts of polys) {
    d += pathData(pts, from);
    from = [round(pts[0] as number), round(pts[1] as number)];
  }
  return d;
}

function viewBoxOf(d: Drawing): { x: number; y: number; w: number; h: number } {
  const pad = 2;
  const b = d.bounds;
  const x = Math.floor(b.minX - pad);
  const y = Math.floor(b.minY - pad);
  return { x, y, w: Math.ceil(b.maxX + pad) - x, h: Math.ceil(b.maxY + pad) - y };
}

function body(ops: readonly DrawOp[], classOf: (fill: string) => string): string {
  return ops
    .map((op) => {
      const alpha = op.alpha !== undefined && op.alpha < 1 ? ` fill-opacity="${num(op.alpha)}"` : '';
      const cls = classOf(op.fill);
      if (op.kind === 'ellipse') {
        return `<ellipse class="${cls}" cx="${num(op.cx)}" cy="${num(op.cy)}" rx="${num(op.rx)}" ry="${num(op.ry)}"${alpha}/>`;
      }
      return `<path class="${cls}" d="${pathData(op.pts)}"${alpha}/>`;
    })
    .join('');
}

/** 隠れた面を省き、同じ色の多角形を 1 つの path にまとめて書く（施設・車・人の SVG） */
function compactBody(ops: readonly DrawOp[], classOf: (fill: string) => string): string {
  return groupOps(dropHidden(ops))
    .map((g) => {
      const first = g.ops[0] as DrawOp;
      if (g.ops.length === 1 || first.kind === 'ellipse') return body(g.ops, classOf);
      const d = multiPathData(g.ops.flatMap((op) => (op.kind === 'poly' ? [clockwise(op.pts)] : [])));
      return `<path class="${classOf(g.fill)}" d="${d}"/>`;
    })
    .join('');
}

export function drawingToSvg(front: Drawing, back: Drawing, title: string, created: string, source = 'src/city/generate/facilityModels.ts'): string {
  // 色を class にまとめる（よく使う色ほど短い名前）
  const counts = new Map<string, number>();
  for (const op of [...front.ops, ...back.ops]) counts.set(op.fill, (counts.get(op.fill) ?? 0) + 1);
  const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const names = new Map<string, string>();
  colors.forEach((c, i) => names.set(c, className(i)));
  const classOf = (fill: string): string => names.get(fill) ?? 'a';
  const style = colors.map((c) => `.${classOf(c)}{fill:${c}}`).join('');
  const vf = viewBoxOf(front);
  const vb = viewBoxOf(back);
  return [
    `<!-- ${title}。自作（本プロジェクト）。作成日 ${created}。tools/build-facility-svgs.mts が ${source} から生成 -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${String(vf.x)} ${String(vf.y)} ${String(vf.w)} ${String(vf.h)}" width="${String(vf.w)}" height="${String(vf.h)}">`,
    `<title>${title}</title>`,
    `<style>${style}</style>`,
    `<g id="front">${compactBody(front.ops, classOf)}</g>`,
    `<defs><g id="back" data-viewbox="${String(vb.x)} ${String(vb.y)} ${String(vb.w)} ${String(vb.h)}">${compactBody(back.ops, classOf)}</g></defs>`,
    '</svg>',
    '',
  ].join('\n');
}

/** 1 つの姿だけの SVG（施設の中の景色。tools/build-facility-svgs.mts が src/city/generate/interiors.ts から作る） */
export function singleViewSvg(d: Drawing, title: string, created: string, source: string): string {
  const counts = new Map<string, number>();
  for (const op of d.ops) counts.set(op.fill, (counts.get(op.fill) ?? 0) + 1);
  const names = new Map<string, string>();
  [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([c], i) => names.set(c, className(i)));
  const classOf = (fill: string): string => names.get(fill) ?? 'a';
  const style = [...names.entries()].map(([c, n]) => `.${n}{fill:${c}}`).join('');
  const v = viewBoxOf(d);
  return [
    `<!-- ${title}。自作（本プロジェクト）。作成日 ${created}。tools/build-facility-svgs.mts が ${source} から生成 -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${String(v.x)} ${String(v.y)} ${String(v.w)} ${String(v.h)}" width="${String(v.w)}" height="${String(v.h)}">`,
    `<title>${title}</title>`,
    `<style>${style}</style>`,
    `<g>${body(d.ops, classOf)}</g>`,
    '</svg>',
    '',
  ].join('\n');
}

function className(i: number): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return i < 26 ? (letters[i] as string) : `${letters[Math.floor(i / 26) - 1] as string}${letters[i % 26] as string}`;
}

export interface SvgView {
  viewBox: { x: number; y: number; w: number; h: number };
  /** 単独で画像にできる SVG の文字列 */
  svg: string;
}

/** SVG から、正面（front）か裏（back）の姿を取り出す */
export function svgView(svg: string, view: 'front' | 'back'): SvgView {
  const style = /<style>[\s\S]*?<\/style>/.exec(svg)?.[0] ?? '';
  if (view === 'front') {
    const m = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
    const g = /<g id="front">([\s\S]*?)<\/g>/.exec(svg);
    if (!m || !g) throw new Error('正面の姿が無い SVG');
    const vb = { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
    return { viewBox: vb, svg: wrap(vb, style, g[1] ?? '') };
  }
  const g = /<g id="back" data-viewbox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)">([\s\S]*?)<\/g>/.exec(svg);
  if (!g) throw new Error('裏の姿が無い SVG');
  const vb = { x: Number(g[1]), y: Number(g[2]), w: Number(g[3]), h: Number(g[4]) };
  return { viewBox: vb, svg: wrap(vb, style, g[5] ?? '') };
}

function wrap(vb: SvgView['viewBox'], style: string, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${String(vb.x)} ${String(vb.y)} ${String(vb.w)} ${String(vb.h)}" width="${String(vb.w)}" height="${String(vb.h)}">${style}${inner}</svg>`;
}

/**
 * 回転（建物の向きとカメラの向きを足した 0〜3）から、使う姿と左右の映しを決める。
 * 正面の姿は入口が +y、裏の姿は入口が −y。映すと x と y が入れ替わる。
 */
export function viewForRotation(rotation: 0 | 1 | 2 | 3): { view: 'front' | 'back'; mirrored: boolean } {
  switch (rotation) {
    case 0:
      return { view: 'front', mirrored: false };
    case 1:
      return { view: 'back', mirrored: true };
    case 2:
      return { view: 'back', mirrored: false };
    case 3:
      return { view: 'front', mirrored: true };
  }
}
