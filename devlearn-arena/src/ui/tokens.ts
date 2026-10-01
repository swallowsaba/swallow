/**
 * 見た目の値（docs/visual-design.md 2・3 章）。
 *
 * 画面の部品・CSS・都市の描画・SVG の色と文字の大きさは、全てここから引く。
 * 画面の部品に生の色を書かない（src/ui/__tests__/visual-rules.test.ts が見張る）。
 */

export const hud = {
  bg: 'rgba(10, 20, 36, 0.86)',
  bgStrong: 'rgba(10, 20, 36, 0.95)',
  line: 'rgba(255, 214, 107, 0.55)',
  text: '#eef2f6',
  textSub: '#9fb0c6',
} as const;

export const accent = {
  gold: '#f2b632',
  goldLight: '#ffd66b',
} as const;

export const state = {
  ok: '#3ae08a',
  warn: '#e8b923',
  bad: '#e04a3a',
  info: '#5cc1ff',
} as const;

/** 分野の色（施設の差し色・知識グラフ・スキル）。3.2 */
export const domain = {
  found: '#9aa9b5',
  linux: '#1f7a4d',
  net: '#1a6fd6',
  web: '#7a3fd0',
  sec: '#c0392b',
  git: '#e0457b',
  mon: '#e8b923',
  trouble: '#ff8a7a',
  cicd: '#f07b2d',
  ctr: '#2fa89b',
  docker: '#2496ed',
  k8s: '#326ce5',
  db: '#8a6a3e',
  cloud: '#5cc1ff',
  devops: '#8cc63f',
  lab: '#f2b632',
} as const;

/** 都市の色。3.3 */
export const city = {
  grass: '#7a9a52',
  grassDark: '#6b8c47',
  paving: '#8b8c88',
  curb: '#6f706c',
  lineWhite: '#e8e2d2',
  water: '#4f7fa3',
  shallow: '#5a8cb2',
  sand: '#d9cfa8',
  groundSide: '#3d5526',
  wallStone: '#c9c2b3',
  wallGlass: '#8fa7ba',
  roofTile: '#9a4d3e',
  windowLit: '#ffcf7a',
  tree1: '#3f5f2c',
  tree2: '#4f7236',
  tree3: '#5f8540',
} as const;

/** 面の明るさ（docs/visual-design.md 5 章）。上面 1.0〜1.1・左面 0.8・右面 0.6 */
export const faceLight = {
  top: 1.0,
  left: 0.8,
  right: 0.6,
} as const;

/** 使ってよい文字の大きさ（px）。2 章。これ以外はテストで落とす */
export const FONT_SIZES = [12, 13, 14, 16, 18, 22, 28, 36, 48] as const;
export type FontSize = (typeof FONT_SIZES)[number];

export const fontFamily = {
  heading: '"M PLUS 1", "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif',
  body: '"Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif',
  number: '"Barlow Condensed", "Roboto Condensed", "Arial Narrow", sans-serif',
  mono: '"JetBrains Mono", "Noto Sans Mono", Consolas, "Noto Sans JP", monospace',
} as const;

/** 窓の影（4 章） */
export const shadow = {
  window: '0 10px 26px rgba(0, 0, 0, 0.45)',
} as const;

/** 透明（色の値としてだけ使う） */
export const transparent = 'rgba(0, 0, 0, 0)';

/**
 * CSS から var(--名前) で引けるように、tokens を CSS の変数に並べる。
 * CSS ファイルに生の色を書かないための橋渡し。
 */
export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {
    '--hud-bg': hud.bg,
    '--hud-bg-strong': hud.bgStrong,
    '--hud-line': hud.line,
    '--hud-text': hud.text,
    '--hud-text-sub': hud.textSub,
    '--gold': accent.gold,
    '--gold-light': accent.goldLight,
    '--ok': state.ok,
    '--warn': state.warn,
    '--bad': state.bad,
    '--info': state.info,
    '--navy': rgbaOf(hud.bg, 1),
    '--shadow-window': shadow.window,
    '--transparent': transparent,
    '--font-heading': fontFamily.heading,
    '--font-body': fontFamily.body,
    '--font-number': fontFamily.number,
    '--font-mono': fontFamily.mono,
  };
  for (const size of FONT_SIZES) vars[`--fs-${String(size)}`] = `${String(size)}px`;
  for (const [id, color] of Object.entries(domain)) vars[`--domain-${id}`] = color;
  return vars;
}

/* ---------- 色の計算（tokens の色から明るさを変えた色を作る） ---------- */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** '#rrggbb' か 'rgba(r, g, b, a)' を読む */
export function parseColor(color: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex?.[1]) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(color);
  if (rgba) {
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: rgba[4] === undefined ? 1 : Number(rgba[4]) };
  }
  throw new Error(`色を読めない: ${color}`);
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

export function formatColor({ r, g, b, a }: Rgb): string {
  if (a >= 1) {
    const n = (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b);
    return `#${n.toString(16).padStart(6, '0')}`;
  }
  return `rgba(${String(clamp255(r))}, ${String(clamp255(g))}, ${String(clamp255(b))}, ${String(Math.round(a * 1000) / 1000)})`;
}

/** 明るさを factor 倍にする（面の陰影） */
export function shade(color: string, factor: number): string {
  const c = parseColor(color);
  return formatColor({ r: c.r * factor, g: c.g * factor, b: c.b * factor, a: c.a });
}

/** 2 つの色を t（0〜1）で混ぜる */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  return formatColor({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t,
    a: x.a + (y.a - x.a) * t,
  });
}

/** 不透明度を変える */
export function rgbaOf(color: string, alpha: number): string {
  const c = parseColor(color);
  return formatColor({ ...c, a: alpha });
}
