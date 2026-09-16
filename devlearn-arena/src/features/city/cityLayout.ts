import type { CityPlan } from '@/content/city';
import { PLOT_H, PLOT_W } from '@/visual/game/cityArt';
import type { Box } from '@/visual/sceneKit';

/**
 * 街の地図の置き場所。施設を学ぶ順に、通りに沿って蛇行するように並べる。
 * 行ごとに横の大通りがあり、行の端で縦の通りが次の行へつながる。学ぶ順番が、そのまま街の道のりになる。
 */

export const COLS = 4;
const MARGIN = 40;
const GAP_X = 36;
/** 区画の下の名札と、横の大通りの分 */
const ROW_GAP = 86;
export const STREET_H = 30;

export interface PlacedPlot {
  id: string;
  /** 区画（建物を描く範囲） */
  box: Box;
  /** 名札を置く高さ */
  labelY: number;
}

export interface CityLayout {
  plots: PlacedPlot[];
  byId: Map<string, PlacedPlot>;
  /** 通り（道の帯） */
  streets: Box[];
  width: number;
  height: number;
}

export function layoutCity(plan: CityPlan): CityLayout {
  const rows = Math.max(1, Math.ceil(plan.facilities.length / COLS));
  const plots = plan.facilities.map((facility, i): PlacedPlot => {
    const row = Math.floor(i / COLS);
    const inRow = i % COLS;
    const col = row % 2 === 0 ? inRow : COLS - 1 - inRow;
    const x = MARGIN + col * (PLOT_W + GAP_X);
    const y = MARGIN + row * (PLOT_H + ROW_GAP);
    return { id: facility.id, box: { x, y, w: PLOT_W, h: PLOT_H }, labelY: y + PLOT_H + 4 };
  });
  const width = MARGIN * 2 + COLS * PLOT_W + (COLS - 1) * GAP_X;
  const streets: Box[] = [];
  for (let row = 0; row < rows; row += 1) {
    const streetY = MARGIN + row * (PLOT_H + ROW_GAP) + PLOT_H + 34;
    streets.push({ x: MARGIN / 2, y: streetY, w: width - MARGIN, h: STREET_H });
    if (row < rows - 1) {
      // 行の端で次の行へつながる縦の通り（蛇行の曲がり角）
      const atRight = row % 2 === 0;
      const x = atRight ? width - MARGIN / 2 - STREET_H : MARGIN / 2;
      streets.push({ x, y: streetY, w: STREET_H, h: PLOT_H + ROW_GAP });
    }
  }
  const height = MARGIN + rows * (PLOT_H + ROW_GAP) + 10;
  return { plots, byId: new Map(plots.map((p) => [p.id, p])), streets, width, height };
}
