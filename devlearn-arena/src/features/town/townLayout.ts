import type { Town } from '@/engines/lesson/town';
import type { Box } from '@/visual/sceneKit';

/**
 * 町の地図の置き場所。地区を 2 列に並べ、地区の中は建物を 4 棟ずつ並べる。
 * 地区と地区のあいだは道になる。
 */

export const PER_ROW = 4;
export const CELL_W = 124;
export const CELL_H = 176;
const DISTRICT_PAD = 20;
const DISTRICT_HEAD = 50;
const DISTRICT_COLS = 2;
const ROAD = 56;
const MARGIN = 40;
export const DISTRICT_W = DISTRICT_PAD * 2 + PER_ROW * CELL_W;

export interface PlacedDistrict {
  chapterId: string;
  box: Box;
}

export interface PlacedBuilding {
  id: string;
  /** 建物の枠（押せる範囲） */
  box: Box;
  /** 地面の高さ */
  groundY: number;
}

export interface TownLayout {
  districts: PlacedDistrict[];
  buildings: Map<string, PlacedBuilding>;
  /** 地区を囲む道（横と縦の帯） */
  roads: Box[];
  width: number;
  height: number;
}

export function layoutTownMap(town: Town): TownLayout {
  const districts: PlacedDistrict[] = [];
  const buildings = new Map<string, PlacedBuilding>();
  const roads: Box[] = [];
  let top = MARGIN + ROAD;
  for (let start = 0; start < town.districts.length; start += DISTRICT_COLS) {
    const row = town.districts.slice(start, start + DISTRICT_COLS);
    const heights = row.map((d) => DISTRICT_HEAD + Math.max(1, Math.ceil(d.buildings.length / PER_ROW)) * CELL_H + DISTRICT_PAD);
    const tallest = Math.max(...heights);
    row.forEach((district, col) => {
      const box = { x: MARGIN + col * (DISTRICT_W + ROAD), y: top, w: DISTRICT_W, h: tallest };
      districts.push({ chapterId: district.chapterId, box });
      district.buildings.forEach((building, i) => {
        const cell = {
          x: box.x + DISTRICT_PAD + (i % PER_ROW) * CELL_W,
          y: box.y + DISTRICT_HEAD + Math.floor(i / PER_ROW) * CELL_H,
          w: CELL_W,
          h: CELL_H,
        };
        buildings.set(building.id, { id: building.id, box: cell, groundY: cell.y + CELL_H - 42 });
      });
    });
    roads.push({ x: MARGIN - ROAD / 2, y: top - ROAD, w: DISTRICT_COLS * DISTRICT_W + DISTRICT_COLS * ROAD, h: ROAD - 16 });
    top += tallest + ROAD;
  }
  const width = MARGIN * 2 + DISTRICT_COLS * DISTRICT_W + (DISTRICT_COLS - 1) * ROAD;
  // 地区の列のあいだを通る縦の道
  roads.push({ x: MARGIN + DISTRICT_W + 8, y: MARGIN, w: ROAD - 16, h: top - MARGIN });
  roads.push({ x: MARGIN - ROAD / 2, y: top - ROAD, w: DISTRICT_COLS * DISTRICT_W + DISTRICT_COLS * ROAD, h: ROAD - 16 });
  return { districts, buildings, roads, width, height: top + MARGIN };
}
