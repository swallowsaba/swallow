/**
 * HUD の色と寸法。`docs/design/hud-mockup.html` の値をそのまま持つ。
 *
 * 画面いっぱいが街で、その上に半透明の板を重ねる。板の色をここに集めて、
 * 部品ごとに濃さがずれないようにする。
 */

export const HUD = {
  /** 街が描けないときの下地 */
  bg: '#0d1117',
  text: '#eef2f6',
  /** 街の上に浮く板 */
  panel: 'rgba(16,20,27,0.9)',
  panelSoft: 'rgba(16,20,27,0.88)',
  /** 端末の柱。ここだけは街を透かさない */
  dock: 'rgba(10,13,17,0.94)',
  bar: 'rgba(16,20,27,0.9)',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.1)',
  fill: 'rgba(255,255,255,0.05)',
  fillSoft: 'rgba(255,255,255,0.04)',
  muted: '#8fa0b2',
  dim: '#6f8196',
  soft: '#c3cdd8',
  accent: '#5cc1ff',
  accentDeep: '#2f8fd8',
  accentText: '#8fc9f2',
  accentFill: 'rgba(47,143,216,0.18)',
  accentEdge: 'rgba(92,193,255,0.4)',
  ok: '#37b37a',
  okText: '#7ee0b0',
  okDone: '#9fdcbf',
  warn: '#f0c35a',
  bad: '#ff8a7a',
  locked: '#5b6675',
  lockedIcon: '#4a5563',
  shadow: '0 10px 30px rgba(0,0,0,0.4)',
  shadowStrong: '0 10px 30px rgba(0,0,0,0.45)',
} as const;

/** 寸法（px）。上の帯の高さ、端末の柱の幅、札の幅 */
export const SIZE = {
  topBar: 56,
  dock: 440,
  task: 330,
  info: 340,
  /** 板の上端。上の帯の下に 16px の余白を取る */
  panelTop: 72,
} as const;

/**
 * 端末の幅。学習者が仕切りを動かして変える（REWORK 3-3）ので、学習画面の根に CSS 変数 --dock で置く。
 * 端末の右に並ぶ板は、これを使って端末の右端から位置を決める。
 */
export const DOCK_WIDTH = `var(--dock, ${String(SIZE.dock)}px)`;

/** 端末の右端から `gap` px 右の位置 */
export function besideDock(gap: number): string {
  return `calc(${DOCK_WIDTH} + ${String(gap)}px)`;
}
