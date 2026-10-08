/**
 * 折れ線のグラフ（模擬環境の情報）の寸法。純粋な関数。
 *
 * グラフは置かれた枠の幅（px）そのままの座標で描く。決まった幅で描いて枠に縮めると、
 * 細い情報の列では目盛りの字が 13px より小さくなる（docs/visual-design.md の図の文字の決まり）。
 */

/** 縦軸の目盛りの幅・横軸の目盛りの高さ・目盛りの字の間（px） */
export const CHART = { height: 150, left: 44, bottom: 22, right: 24, labelGap: 44 } as const;

export interface ChartLayout {
  width: number;
  /** 横軸の目盛り（間引いた所は text が null） */
  labels: { x: number; text: string | null }[];
}

export function chartLayout(measured: number, xs: readonly string[]): ChartLayout {
  const width = measured > 0 ? Math.round(measured) : 520;
  const span = width - CHART.left - CHART.right;
  const step = span / Math.max(1, xs.length - 1);
  // 字が重ならないよう、間が labelGap 以上になる数ごとに出す
  const every = Math.max(1, Math.ceil(CHART.labelGap / Math.max(1, step)));
  return {
    width,
    labels: xs.map((text, i) => ({ x: CHART.left + step * i, text: i % every === 0 ? text : null })),
  };
}
