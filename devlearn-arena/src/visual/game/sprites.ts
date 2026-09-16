/**
 * ドット絵を SVG の四角で描く道具。
 * 絵は「1文字＝1ドット」の文字列の並びと、文字→色の対応で表す。'.' は透明。
 * 同じ色が横に続くところは1枚の四角にまとめ、要素の数を抑える。
 */

export type PixelMap = readonly string[];
export type Palette = Readonly<Record<string, string>>;

export interface Run {
  x: number;
  y: number;
  w: number;
  color: string;
}

/** ドット絵を、横に続く同じ色の塊に分ける。テストで形を確かめられるよう純粋関数にしておく */
export function pixelRuns(map: PixelMap, palette: Palette): Run[] {
  const runs: Run[] = [];
  map.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x] ?? '.';
      const color = palette[ch];
      if (ch === '.' || color === undefined) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === ch) end += 1;
      runs.push({ x, y, w: end - x, color });
      x = end;
    }
  });
  return runs;
}

export const spriteSize = (map: PixelMap): { w: number; h: number } => ({
  w: Math.max(0, ...map.map((r) => r.length)),
  h: map.length,
});

/* ---------------- 絵 ---------------- */

export const INK = '#2c1d10';

/** 主人公（学ぶ人）。c が服の色 */
export const HERO: PixelMap = [
  '....kkkk....',
  '..kkhhhhkk..',
  '.khhhhhhhhk.',
  '.khhssssshk.',
  '.kssessessk.',
  '.kssssssssk.',
  '..kssppssk..',
  '...kkkkkk...',
  '..kcccccck..',
  '.kscccccccsk',
  '.kscccccccsk',
  '..kcccccck..',
  '..kbbbbbbk..',
  '..kbbkkbbk..',
  '..kbbk.kbbk.',
  '..kkk...kkk.',
];

export function heroPalette(shirt: string, hair = '#6b3e1f'): Palette {
  return { k: INK, h: hair, s: '#f3c9a0', e: INK, p: '#c0604a', c: shirt, b: '#3b4a6b' };
}

/** 帽子をかぶった係の人。t が帽子 */
export const WORKER: PixelMap = [
  '...tttttt...',
  '..tttttttt..',
  '.kkkkkkkkkk.',
  '.khhssssshk.',
  '.kssessessk.',
  '.kssssssssk.',
  '..kssppssk..',
  '...kkkkkk...',
  '..kcccccck..',
  '.kscccccccsk',
  '.kscccccccsk',
  '..kcccccck..',
  '..kbbbbbbk..',
  '..kbbkkbbk..',
  '..kbbk.kbbk.',
  '..kkk...kkk.',
];

export function workerPalette(shirt: string, hat: string): Palette {
  return { ...heroPalette(shirt, '#4a2f1a'), t: hat };
}

/** スライム（Pod）。g が体、d が影 */
export const SLIME: PixelMap = [
  '.....kkkk.....',
  '...kkggggkk...',
  '..kggwwggggk..',
  '.kggwwggggggk.',
  '.kgwggggggggk.',
  'kggggkggkggggk',
  'kggggkggkggggk',
  'kggggggggggggk',
  'kggggggggggggk',
  'kddggggggggddk',
  '.kddddddddddk.',
  '..kkkkkkkkkk..',
];

export function slimePalette(body: string, shade: string): Palette {
  return { k: INK, g: body, d: shade, w: '#ffffff' };
}

/** 木箱（ファイル） */
export const CRATE: PixelMap = [
  'kkkkkkkkkkkk',
  'kyyyyyyyyyyk',
  'kyoyyyyyyoyk',
  'kyyoyyyyoyyk',
  'kyyyoyyoyyyk',
  'kyyyyooyyyyk',
  'kyyyyooyyyyk',
  'kyyyoyyoyyyk',
  'kyyoyyyyoyyk',
  'kyoyyyyyyoyk',
  'kyyyyyyyyyyk',
  'kkkkkkkkkkkk',
];

export function cratePalette(body = '#d9a441'): Palette {
  return { k: INK, y: body, o: '#8a5a2b' };
}

/** 木 */
export const TREE: PixelMap = [
  '......kkkk......',
  '....kkllggkk....',
  '...kllgggggGk...',
  '..klgggggggGGk..',
  '.klggggggggGGGk.',
  '.kgggggggggGGGk.',
  'kggggggggggGGGGk',
  'kgggggggggGGGGGk',
  '.kgggggggGGGGGk.',
  '..kGGGGGGGGGGk..',
  '...kkkkttkkkk...',
  '......kttk......',
  '......kttk......',
  '.....kkttkk.....',
];

export const TREE_PALETTE: Palette = { k: INK, l: '#9fd67a', g: '#5c9a3c', G: '#3f7a2b', t: '#7a5230' };

/** 草むら */
export const BUSH: PixelMap = ['..kkkk..', '.kllggk.', 'kggggGGk', 'kgggGGGk', '.kkkkkk.'];

/** 花 */
export const FLOWER: PixelMap = ['.r.', 'ryr', '.r.', '.g.'];

/** 手紙（パケット） */
export const LETTER: PixelMap = [
  'kkkkkkkkkkkk',
  'kwkwwwwwwkwk',
  'kwwkwwwwkwwk',
  'kwwwkwwkwwwk',
  'kwwwwkkwwwwk',
  'kwwwwwrrwwwk',
  'kwwwwwrrwwwk',
  'kwwwwwwwwwwk',
  'kkkkkkkkkkkk',
];

export const LETTER_PALETTE: Palette = { k: INK, w: '#fff8e6', r: '#c0392b' };

/** 宝箱（成功したジョブ） */
export const CHEST: PixelMap = [
  '.kkkkkkkkkk.',
  'kyyyyyyyyyyk',
  'kyooooooooyk',
  'kkkkkkkkkkkk',
  'kyyyykkyyyyk',
  'kyyyykgkyyyk',
  'kyyyyyyyyyyk',
  'kkkkkkkkkkkk',
];

export const CHEST_PALETTE: Palette = { k: INK, y: '#b0773a', o: '#8a5a2b', g: '#f2c14e' };

/** どくろ（失敗したジョブ） */
export const SKULL: PixelMap = [
  '..kkkkkk..',
  '.kwwwwwwk.',
  'kwwwwwwwwk',
  'kwkkwwkkwk',
  'kwkkwwkkwk',
  'kwwwkkwwwk',
  '.kwwwwwwk.',
  '..kwkwkk..',
  '..kkkkkk..',
];

export const SKULL_PALETTE: Palette = { k: INK, w: '#f4efe4' };

/** たいまつ（実行中のジョブ） */
export const TORCH: PixelMap = ['..r..', '.ryr.', '.ryr.', '..y..', '.kbk.', '..b..', '..b..', '..b..'];

export const TORCH_PALETTE: Palette = { k: INK, r: '#e8823c', y: '#f2c14e', b: '#7a5230' };
