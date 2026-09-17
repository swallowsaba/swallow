/**
 * 住民の表情。絵文字を使わず、街の絵と同じ線で描く。
 *
 * 形の指定をここに一本化して、SVG（React）と canvas（地図）の両方が同じ顔を描く。
 * 絵文字は環境ごとに絵が変わり、街の絵から浮くので使わない。
 */

export type Mood = 'angry' | 'waiting' | 'happy';

export const INK = '#2c1d10';

/** 気持ちごとの色。枠・ほほ・付け足す印に使う */
export const MOOD_COLOR: Record<Mood, { ring: string; accent: string }> = {
  angry: { ring: '#e0483a', accent: '#c0392b' },
  waiting: { ring: '#d9a441', accent: '#4a90c2' },
  happy: { ring: '#6cbf5a', accent: '#e28f9a' },
};

export const SKIN = '#f6d5ad';
export const HAIR = '#5b3a22';

/**
 * 顔の部品。40×40 の枠の中に描く前提の座標。
 * SVG と canvas で同じ線を引くため、パスの文字列をここで持つ。
 */
export const FACE = {
  size: 40,
  head: { cx: 20, cy: 21, r: 13 },
  ear: { y: 22, r: 2.6, left: 7.5, right: 32.5 },
  hair: 'M7 19 Q8 5 20 5 Q32 5 33 19 Q29 12.5 20 12.5 Q11 12.5 7 19 Z',
  brow: {
    angry: ['M11.5 15.5 L18 18.5', 'M28.5 15.5 L22 18.5'],
    waiting: ['M12 16.5 L18 16', 'M28 16.5 L22 16'],
    happy: ['M12 16 Q15 14 18 15.5', 'M28 16 Q25 14 22 15.5'],
  },
  mouth: {
    angry: 'M13 31 Q20 25.5 27 31',
    waiting: 'M14 29.5 Q17 28 20 29.5 Q23 31 26 29.5',
    happy: 'M13.5 27 Q20 33.5 26.5 27',
  },
} as const;

/** 目の位置。閉じた目（happy）は弧、それ以外は点 */
export const EYES = { left: 15, right: 25, y: 22, r: 2.1 } as const;

/** 住民の声（苦情・対応待ち・評価）を、顔の気持ちに置き換える */
export const MOOD_OF_VOICE: Record<'complaint' | 'waiting' | 'praise', Mood> = {
  complaint: 'angry',
  waiting: 'waiting',
  praise: 'happy',
};
