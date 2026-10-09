import { accent, hud, rgbaOf } from './tokens';

/**
 * 読み込み中の演出（docs/ui-design.md 9 章: 都市の輪郭が描かれていく。2 秒以内）。
 *
 * 本体の JavaScript が届く前から出すため、index.html に直接書き込む（vite.config.ts の bootScreen）。
 * 地面 → 道路 → 建物 → 窓と木、の順に線を引き、BOOT_SECONDS で描き終える。
 * 文字は出さない（フォントは本体と一緒に届くので、標準のフォントで出てしまう）。読み上げには aria-label で伝える。
 * 動きを減らす設定（保存の写し）と、OS の「視差効果を減らす」では、描き終えた絵をそのまま出す。
 * 都市が描けたら（body の data-city-ready）、0.3 秒で薄れて消える（src/main.tsx）。
 */

/** 描き終えるまでの秒数（2 秒以内） */
export const BOOT_SECONDS = 1.8;

/** 保存の写し（src/save/idb.ts） */
const SETTINGS_KEY = 'devlearn-arena:settings';

type Pt = readonly [number, number];
/** 区画の座標（x 東・y 南・z 上）を画面の座標へ。地面は 10×10 の区画 */
const iso = (x: number, y: number, z = 0): Pt => [240 + (x - y) * 20, 60 + (x + y) * 10 - z * 12];
const fmt = (p: Pt): string => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
const line = (...pts: Pt[]): string => `M${pts.map(fmt).join('L')}`;

interface Stroke { d: string; at: number; dur: number; kind: 'ground' | 'road' | 'build' | 'detail' | 'mass' }

/** 箱の見える辺（上の面の 4 辺・手前の 3 本の縦の辺・手前の 2 辺の足元） */
function box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): string {
  const top = [iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)] as const;
  return [
    `${line(...top)}Z`,
    line(iso(x0, y1, z1), iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y0, z0), iso(x1, y0, z1)),
    line(iso(x1, y1, z1), iso(x1, y1, z0)),
  ].join('');
}

/** 寄棟の屋根（棟と 4 本の隅棟） */
function hipRoof(x0: number, y0: number, x1: number, y1: number, z: number, rise: number): string {
  const my = (y0 + y1) / 2;
  const a = iso(x0 + 0.35, my, z + rise);
  const b = iso(x1 - 0.35, my, z + rise);
  return line(a, b) + line(iso(x0, y0, z), a, iso(x0, y1, z)) + line(iso(x1, y0, z), b, iso(x1, y1, z));
}

/** 手前の 2 面の窓（階ごとの短い線） */
function windows(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): string {
  let d = '';
  for (let z = z0 + 0.6; z < z1 - 0.3; z += 0.8) {
    for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.45) d += line(iso(x, y1, z), iso(x + 0.2, y1, z));
    for (let y = y0 + 0.3; y < y1 - 0.2; y += 0.45) d += line(iso(x1, y, z), iso(x1, y + 0.2, z));
  }
  return d;
}

/** 木（幹と、丸い葉の輪郭） */
function tree(x: number, y: number): string {
  const [sx, sy] = iso(x, y);
  return `M${fmt([sx, sy])}L${fmt([sx, sy - 6])}M${fmt([sx - 5, sy - 10])}a5 5 0 1 0 10 0a5 5 0 1 0 -10 0`;
}

/** 点の集まりを囲む凸の多角形（建物の影絵。後ろの線を隠す） */
function hull(points: Pt[]): string {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]): Pt[] => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2] as Pt, out[out.length - 1] as Pt, p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return `${line(...half(pts), ...half([...pts].reverse()))}Z`;
}

const corners = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): Pt[] =>
  [z0, z1].flatMap((z) => [iso(x0, y0, z), iso(x1, y0, z), iso(x1, y1, z), iso(x0, y1, z)]);

/** 線を引く順（秒）。全てが BOOT_SECONDS までに描き終わる。並びは奥から手前（手前の建物が奥の線を隠す） */
export function bootStrokes(): Stroke[] {
  const s: Stroke[] = [];
  // 地面の縁と区画の線
  s.push({ d: `${line(iso(0, 0), iso(10, 0), iso(10, 10), iso(0, 10))}Z`, at: 0, dur: 0.5, kind: 'ground' });
  for (const k of [2.5, 7.5]) s.push({ d: line(iso(k, 0), iso(k, 10)) + line(iso(0, k), iso(10, k)), at: 0.2, dur: 0.4, kind: 'detail' });
  // 道路（2 本の大通り。両側の縁）
  for (const c of [4.6, 5.4]) s.push({ d: line(iso(c, 0), iso(c, 10)) + line(iso(0, c), iso(10, c)), at: 0.35, dur: 0.45, kind: 'road' });
  // 建物（区画ごとに高さと屋根の形を変える）と木
  const blocks: { f: [number, number, number, number]; h: number; roof: 'flat' | 'step' | 'hip' }[] = [
    { f: [1, 1, 3.2, 3], h: 2.2, roof: 'hip' },
    { f: [6.2, 1, 8.6, 3.4], h: 4.6, roof: 'step' },
    { f: [3.4, 1.2, 4.1, 2.4], h: 1.2, roof: 'flat' },
    { f: [1.2, 6.2, 3.6, 8.4], h: 3.2, roof: 'flat' },
    { f: [8.8, 6.2, 9.8, 7.6], h: 1.6, roof: 'hip' },
    { f: [6.4, 6.4, 8.2, 8.8], h: 6.4, roof: 'step' },
  ];
  const trees: Pt[] = [[0.6, 4.2], [2, 4], [3.8, 4.1], [6, 4.2], [8.4, 3.9], [4.2, 6.6], [4, 8.6], [9.3, 9.2]];
  const items: { depth: number; strokes: Stroke[] }[] = blocks.map((b, i) => {
    const [x0, y0, x1, y1] = b.f;
    const at = 0.6 + i * 0.1;
    const pts = corners(x0, y0, x1, y1, 0, b.h);
    let d = box(x0, y0, x1, y1, 0, b.h);
    if (b.roof === 'hip') {
      d += hipRoof(x0, y0, x1, y1, b.h, 1.1);
      pts.push(iso(x0 + 0.35, (y0 + y1) / 2, b.h + 1.1), iso(x1 - 0.35, (y0 + y1) / 2, b.h + 1.1));
    }
    if (b.roof === 'step') {
      d += box(x0 + 0.5, y0 + 0.5, x1 - 0.5, y1 - 0.5, b.h, b.h + 1.2);
      pts.push(...corners(x0 + 0.5, y0 + 0.5, x1 - 0.5, y1 - 0.5, b.h, b.h + 1.2));
    }
    if (b.roof === 'flat') d += `${line(iso(x0 + 0.15, y0 + 0.15, b.h), iso(x1 - 0.15, y0 + 0.15, b.h), iso(x1 - 0.15, y1 - 0.15, b.h), iso(x0 + 0.15, y1 - 0.15, b.h))}Z`;
    return {
      depth: x1 + y1,
      strokes: [
        { d: hull(pts), at, dur: 0.3, kind: 'mass' },
        { d, at, dur: 0.5, kind: 'build' },
        { d: windows(x0, y0, x1, y1, 0, b.h), at: at + 0.45, dur: 0.25, kind: 'detail' },
      ],
    };
  });
  for (const [x, y] of trees) items.push({ depth: x + y, strokes: [{ d: tree(x, y), at: 1.3, dur: 0.5, kind: 'detail' }] });
  for (const it of items.sort((a, b) => a.depth - b.depth)) s.push(...it.strokes);
  return s;
}

/** index.html の #root の前に置く、読み込み中の演出（style・絵・設定を読む小さな script） */
export function bootMarkup(): string {
  const navy = rgbaOf(hud.bg, 1);
  const color = { ground: hud.line, road: accent.gold, build: accent.goldLight, detail: rgbaOf(accent.goldLight, 0.55) };
  const timing = (st: Stroke): string => `animation-delay:${String(st.at)}s;animation-duration:${String(st.dur)}s`;
  const paths = bootStrokes()
    .map((st) => (st.kind === 'mass'
      ? `<path class="mass" d="${st.d}" style="${timing(st)}"/>`
      : `<path d="${st.d}" pathLength="1" stroke="${color[st.kind]}" style="${timing(st)}"/>`))
    .join('');
  const css = [
    `#boot{position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:${navy};transition:opacity .3s}`,
    '#boot.is-done{opacity:0;pointer-events:none}',
    '#boot svg{width:min(56vw,640px);height:auto;overflow:visible}',
    '#boot path{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;animation-name:boot-draw;animation-timing-function:ease-out;animation-fill-mode:forwards}',
    `#boot path.mass{fill:${navy};stroke:none;stroke-dasharray:none;opacity:0;animation-name:boot-show}`,
    '@keyframes boot-draw{to{stroke-dashoffset:0}}',
    '@keyframes boot-show{to{opacity:1}}',
    ':root[data-motion=reduced] #boot path{animation:none;stroke-dashoffset:0;opacity:1}',
    ':root[data-motion=reduced] #boot{transition:none}',
    '@media (prefers-reduced-motion:reduce){#boot path{animation:none;stroke-dashoffset:0;opacity:1}}',
  ].join('');
  // 動きを減らす設定は、本体より先に保存の写しから読む（読めなければ、そのまま動かす）
  const script = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||'null');if(s&&s.reduceMotion)document.documentElement.dataset.motion='reduced'}catch(e){}`;
  return `<style>${css}</style><script>${script}</script>`
    + `<div id="boot" role="status" aria-label="都市を読み込んでいる"><svg viewBox="0 0 480 300" aria-hidden="true">${paths}</svg></div>`;
}

/** 都市が描けたら、読み込み中の演出を薄れさせて消す（動きを減らす設定では、すぐ消す） */
export function finishBoot(doc: Document = document): void {
  const el = doc.getElementById('boot');
  if (!el || el.classList.contains('is-done')) return;
  el.classList.add('is-done');
  const reduced = doc.documentElement.dataset.motion === 'reduced';
  if (reduced) el.remove();
  else window.setTimeout(() => el.remove(), 300);
}
