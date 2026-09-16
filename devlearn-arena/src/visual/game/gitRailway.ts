import type { Box, Point } from '../sceneKit';
import type { FileSpot, Lane, PlacedCommit } from '../gitModel';

/**
 * Git を「鉄道」として並べる。
 * 上に3つの建物（作業場＝作業ツリー / 荷台＝インデックス / 倉庫＝HEAD）。ファイルは木箱で、いちばん新しい中身がある建物の前に置く。
 * 下は線路。コミットは駅で、新しい駅ほど上。ブランチが分かれると線路が横の列にずれ、マージで合流する。
 */

export const LANES: readonly Lane[] = ['worktree', 'index', 'head'];
export const BUILDING_W = 190;
export const BUILDING_H = 100;
const BUILDING_GAP = 50;
const MARGIN = 40;
const BUILDING_Y = 56;
export const CRATE_ROW = 26;
export const MAX_CRATES = 6;
export const ROW = 68;
export const COL = 60;

export interface PlacedCrate {
  spot: FileSpot;
  x: number;
  y: number;
}

export interface Railway {
  buildings: { lane: Lane; box: Box }[];
  crates: PlacedCrate[];
  /** 並べきれなかった木箱の数 */
  hidden: Record<Lane, number>;
  /** 建物のあいだの矢印看板 */
  arrows: { x: number; y: number; text: string }[];
  /** 線路の一番上の駅の高さ */
  railTop: number;
  /** 駅の位置 */
  station: (commit: Pick<PlacedCommit, 'row' | 'col'>) => Point;
  /** 駅の名前札を置く左端 */
  labelX: number;
  width: number;
  height: number;
}

export function layoutRailway(spots: readonly FileSpot[], commits: readonly PlacedCommit[], columns: number, hasCopies: boolean): Railway {
  const buildings = LANES.map((lane, i) => ({
    lane,
    box: { x: MARGIN + i * (BUILDING_W + BUILDING_GAP), y: BUILDING_Y, w: BUILDING_W, h: BUILDING_H },
  }));
  const hidden: Record<Lane, number> = { worktree: 0, index: 0, head: 0 };
  const crates: PlacedCrate[] = [];
  const listTop = BUILDING_Y + BUILDING_H + 18;
  let tallest = 0;
  for (const { lane, box } of buildings) {
    const mine = spots.filter((s) => s.lane === lane);
    mine.slice(0, MAX_CRATES).forEach((spot, i) => {
      crates.push({ spot, x: box.x + 6, y: listTop + i * CRATE_ROW });
    });
    hidden[lane] = Math.max(0, mine.length - MAX_CRATES);
    tallest = Math.max(tallest, Math.min(mine.length, MAX_CRATES) + (hidden[lane] > 0 ? 1 : 0));
  }
  const arrows = [
    { x: MARGIN + BUILDING_W + BUILDING_GAP / 2, y: BUILDING_Y + BUILDING_H / 2, text: 'add' },
    { x: MARGIN + 2 * BUILDING_W + BUILDING_GAP * 1.5, y: BUILDING_Y + BUILDING_H / 2, text: 'commit' },
  ];

  const railTop = listTop + Math.max(tallest, 1) * CRATE_ROW + 90;
  const railX = MARGIN + 30;
  const station = (c: Pick<PlacedCommit, 'row' | 'col'>): Point => ({ x: railX + c.col * COL, y: railTop + c.row * ROW });
  const labelX = railX + (columns - 1) * COL + (hasCopies ? COL : 0) + 50;
  const width = Math.max(MARGIN * 2 + 3 * BUILDING_W + 2 * BUILDING_GAP, labelX + 420);
  const height = railTop + Math.max(commits.length, 1) * ROW + 30;
  return { buildings, crates, hidden, arrows, railTop, station, labelX, width, height };
}

/** 2つの駅を結ぶ線路。列が変わるときは途中で曲げる */
export function trackPath(from: Point, to: Point): string {
  if (from.x === to.x) return `M ${String(from.x)} ${String(from.y)} L ${String(to.x)} ${String(to.y)}`;
  const bend = ROW * 0.6;
  return `M ${String(from.x)} ${String(from.y)} C ${String(from.x)} ${String(from.y + bend)}, ${String(to.x)} ${String(to.y - bend)}, ${String(to.x)} ${String(to.y)}`;
}
