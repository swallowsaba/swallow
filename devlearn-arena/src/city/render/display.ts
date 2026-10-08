/**
 * 都市の描き方の設定（docs/product-spec.md 4 章の「動きを減らす」と「表示品質」。docs/architecture.md 4 章: 重い時は影と動きを減らす）。
 * 描画はこの値を読むだけで、規則はここに置く。
 */
export type Quality = 'low' | 'standard' | 'high';

export interface Display {
  /** 画面の画素の細かさの上限（端末の倍率をこれ以上には使わない） */
  pixelRatioCap: number;
  /** 車と人を描く */
  agents: boolean;
  /** 車と人を動かす（止めると、止めた時の位置に留まる） */
  agentsMove: boolean;
  /** 変化の場所の光の輪を広げる（止めると、動かない輪を出す） */
  ringsMove: boolean;
}

export function displayOf({ quality, reduceMotion }: { quality: Quality; reduceMotion: boolean }): Display {
  return {
    pixelRatioCap: quality === 'low' ? 1 : quality === 'standard' ? 1.5 : 2,
    agents: quality !== 'low',
    agentsMove: !reduceMotion,
    ringsMove: !reduceMotion,
  };
}

export const DEFAULT_DISPLAY: Display = displayOf({ quality: 'standard', reduceMotion: false });
