/**
 * レッスンの図（content/figures/<ID>.svg。docs/visual-design.md 6 章）。小さいので最初にまとめて読む。
 * 図の一部（data-part）を押す理解の問題のため、画面には SVG の文字のまま埋め込む。
 */

const files = import.meta.glob<string>('../../content/figures/*.svg', { query: '?raw', import: 'default', eager: true });

const FIGURES = new Map(Object.entries(files).map(([path, svg]) => [path.replace(/^.*\//, '').replace(/\.svg$/, ''), svg]));

/** 図の SVG（無ければ undefined） */
export function figureOf(id: string): string | undefined {
  return FIGURES.get(id);
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** 図の題（<title>。画面の説明に使う）。SVG の文字の参照（&lt; など）は元の字に戻す */
export function figureTitle(id: string): string {
  const raw = /<title>([\s\S]*?)<\/title>/.exec(FIGURES.get(id) ?? '')?.[1]?.trim() ?? '';
  return raw.replace(/&(lt|gt|amp|quot|apos);/g, (_, name: string) => ENTITIES[name] ?? '');
}

/** 押す部分の、押せる面の最小の大きさ（図の座標。理解の「図を押す」） */
export const MIN_HIT = 24;

/** 図の中の箱（図の座標） */
export interface Box { x: number; y: number; w: number; h: number }

/**
 * 押して当たる面（四角・円・楕円。中を塗るか pointer-events="all"）なら、その箱。線・字・塗らない枠は null。
 * attr は要素の属性を読む関数（検証は SVG の文字から、画面は DOM から読む）。groupFillNone は、包む g が fill="none" か
 */
export function areaOf(name: string, attr: (a: string) => string | null, groupFillNone = false): Box | null {
  const fill = attr('fill');
  const painted = fill === null ? !groupFillNone : fill !== 'none';
  if (!painted && attr('pointer-events') !== 'all') return null;
  const n = (a: string): number => Number(attr(a) ?? 0);
  if (name === 'rect') return { x: n('x'), y: n('y'), w: n('width'), h: n('height') };
  if (name === 'circle') return { x: n('cx') - n('r'), y: n('cy') - n('r'), w: n('r') * 2, h: n('r') * 2 };
  if (name === 'ellipse') return { x: n('cx') - n('rx'), y: n('cy') - n('ry'), w: n('rx') * 2, h: n('ry') * 2 };
  return null;
}

/** 押せる面として十分な大きさか */
export const isLargeArea = (b: Box | null): boolean => b !== null && b.w >= MIN_HIT && b.h >= MIN_HIT;

/** 細い部分（押せる面の無い、線と字だけの部分）に敷く、押して当たる箱。部分の箱を、真ん中を中心に 24×24 まで広げる */
export function hitBoxOf(b: Box): Box {
  const w = Math.max(b.w, MIN_HIT);
  const h = Math.max(b.h, MIN_HIT);
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}
