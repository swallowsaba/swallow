/**
 * 住民の顔の作り。
 *
 * 絵文字も、丸に目鼻を描いただけの印も使わない。
 * 輪郭・髪・目・眉・口を別々の形として持ち、気持ちごとに差し替える。
 * 形の指定をここに一本化して、SVG（説明の絵）と canvas（街の地図）が同じ顔を描く。
 *
 * 座標は 48×48 の枠。顔は y=5〜37、首と肩が y=33〜48。
 * 気持ちは顔そのもので表し、右上の小さな印は遠くから見たときの手がかりとして添える。
 */

export type Mood = 'angry' | 'waiting' | 'happy';

export const FACE_BOX = 48;

export const INK = '#2a2118';
export const LINE = '#3d3226';
export const SKIN = '#f6d9b4';
export const SKIN_SHADE = '#e3bb90';
export const HAIR = '#4a3426';
export const HAIR_LIGHT = '#6f503a';

/** 気持ちごとの色。枠・ほほ・右上の印に使う */
export const MOOD_COLOR: Record<Mood, { ring: string; tint: string; accent: string; blush: string }> = {
  angry: { ring: '#d9483c', tint: '#fdeeec', accent: '#d9483c', blush: '#e08a7e' },
  waiting: { ring: '#d39a2b', tint: '#fdf6e8', accent: '#c98a1e', blush: '#dcae83' },
  happy: { ring: '#2f9e63', tint: '#edf7f1', accent: '#2f9e63', blush: '#e89b9b' },
};

/** 輪郭。こめかみが広く、あごへ細くなる卵形 */
export const HEAD_PATH =
  'M24 5.4 C31.8 5.4 36.8 11.4 36.8 20 C36.8 26.4 33.8 32.2 29.4 34.9 C27.7 35.9 25.9 36.4 24 36.4 C22.1 36.4 20.3 35.9 18.6 34.9 C14.2 32.2 11.2 26.4 11.2 20 C11.2 11.4 16.2 5.4 24 5.4 Z';

/** あごまわりの陰 */
export const JAW_SHADE = 'M18.6 31.6 C20.4 34.6 22 35.9 24 35.9 C26 35.9 27.6 34.6 29.4 31.6 C27.6 34 26 34.9 24 34.9 C22 34.9 20.4 34 18.6 31.6 Z';

/** 髪。額を見せる生え際で切り、右へ流す */
export const HAIR_PATH =
  'M11.2 20.4 C10.6 10.6 16 4.2 24 4.2 C32 4.2 37.4 10.6 36.8 20.4 C36.3 16.4 35.1 13.8 33.2 12.2 C30.8 14.3 27.2 15.2 23.2 14.7 C20.2 14.3 17.8 13.4 16.4 12.2 C14.2 14 12 16.6 11.2 20.4 Z';

/** 髪の照り */
export const HAIR_SHINE = 'M28.4 6.6 C31.4 7.6 33.6 9.6 34.8 12.4';

export const EAR = { y: 22.4, rx: 2.1, ry: 2.9, left: 11.4, right: 36.6 } as const;

export const EYE = { left: 18.9, right: 29.1, y: 22.6 } as const;

/** 目の形（原点が目の中心）。気持ちで傾きと潰し方を変える */
export const EYE_ALMOND = 'M-3.3 0 Q0 -3.3 3.3 0 Q0 3.3 -3.3 0 Z';

export const EYE_SHAPE: Record<Mood, { rotate: number; scaleY: number } | 'closed'> = {
  angry: { rotate: 17, scaleY: 0.86 },
  waiting: { rotate: 0, scaleY: 0.5 },
  happy: 'closed',
};

/** 閉じた目（喜び）の弧 */
export const EYE_CLOSED = 'M-3.5 1 Q0 -2.6 3.5 1';

export const BROW: Record<Mood, readonly [string, string]> = {
  angry: ['M15 16.6 L21.6 19', 'M33 16.6 L26.4 19'],
  waiting: ['M15.4 17.6 Q18.9 16.4 21.9 17.5', 'M32.6 17.6 Q29.1 16.4 26.1 17.5'],
  happy: ['M15.6 18 Q18.9 15.6 22.1 17.8', 'M32.4 18 Q29.1 15.6 25.9 17.8'],
};

export const NOSE = 'M24 25.4 q1.3 2.1 -0.7 2.6';

/** 口。線で引くものと、塗りで描くもの（喜びの開いた口）がある */
export const MOUTH: Record<Mood, { stroke?: string; fill?: string; tongue?: string }> = {
  angry: { stroke: 'M19.2 32.8 Q24 28.8 28.8 32.8' },
  waiting: { stroke: 'M19.8 31.4 Q21.9 30.3 24 31.3 Q26.1 32.3 28.2 31.2' },
  happy: { fill: 'M19 29.6 Q24 35.6 29 29.6 Z', tongue: 'M21.8 32.3 Q24 34.5 26.2 32.3 Z' },
};

export const BLUSH = { y: 28, rx: 2.9, ry: 1.7, left: 15.2, right: 32.8 } as const;

/**
 * 右上の印。遠目でも気持ちが分かるように添える小さな記章。
 * 顔の線と重ならないよう、丸い枠の外側に置く。
 */
export const BADGE = { cx: 39.6, cy: 8.6, r: 6.8 } as const;
export const BADGE_GLYPH: Record<Mood, { stroke?: readonly string[]; dots?: readonly number[] }> = {
  angry: { stroke: ['M39.6 5 L39.6 10', 'M39.6 12.1 L39.6 12.15'] },
  waiting: { dots: [36.6, 39.6, 42.6] },
  happy: { stroke: ['M36.6 8.8 L38.9 11.2 L42.6 6.2'] },
};

/** 首 */
export const NECK = 'M20.9 32.4 h6.2 v6.6 q-3.1 2.2 -6.2 0 Z';
/** 首すじの影 */
export const NECK_SHADE = 'M20.9 35.2 q3.1 2.4 6.2 0 l0 -2.8 h-6.2 Z';
/** 肩と上着 */
export const BUST = 'M3.4 48 C4.2 42.2 9.4 38.2 16.2 37.3 L24 45.2 L31.8 37.3 C38.6 38.2 43.8 42.2 44.6 48 Z';
/** 襟もとから見えるシャツ */
export const BUST_INNER = 'M16.2 37.3 L24 45.2 L31.8 37.3 L28.6 36.5 L24 41.6 L19.4 36.5 Z';

/** 住民の普段着 */
export const COAT = '#5d6b7a';
export const COAT_INNER = '#f4f1ea';

/** 住民の声（苦情・対応待ち・評価）を、顔の気持ちに置き換える */
export const MOOD_OF_VOICE: Record<'complaint' | 'waiting' | 'praise', Mood> = {
  complaint: 'angry',
  waiting: 'waiting',
  praise: 'happy',
};
