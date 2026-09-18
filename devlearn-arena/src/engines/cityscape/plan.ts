import type { Tone } from './types';

/**
 * 街の区画割り（都市計画）。
 *
 * 一列に並べるのをやめ、碁盤の目の街として組み立てる。
 * 地区（ディレクトリ・ブランチ・ノードなど）を「街区」にし、街区の周りを通りで囲み、
 * 建物は通りに面した区画（ロット）に建てる。街区の内側は中庭として空ける。
 *
 * ここは座標だけを決める。何を建てるか（見立て）は各カテゴリの組み立てが決め、
 * 描画は features/citymap が行う。座標はマス（等角の格子）。
 */

/** 1 区画（建物 1 軒ぶん）の一辺 */
export const LOT = 2;
/** 街区のふち（歩道）の幅 */
export const SIDEWALK = 1;
/** 通りの幅 */
export const STREET = 2;
/** 大通りの幅 */
export const AVENUE = 3;

/** 区画が向いている側。建物の正面（入口・看板）をここに向ける */
export type Facing = 'n' | 'e' | 's' | 'w';

export interface PlanDistrict {
  id: string;
  label?: string | undefined;
  tone?: Tone | undefined;
  /** この地区に建てるものの id。並び順のまま区画に割り当てる */
  members: readonly string[];
  /**
   * block = 正方形に近い街区（ディレクトリ・ノードなど、順番に意味が無いもの）
   * row   = 通り沿いに一列（履歴のように、並び順そのものが意味を持つもの）
   */
  shape?: 'block' | 'row' | undefined;
  /**
   * ring = 外周から内側へ（通りに面した所から埋まる。既定）
   * rows = 左上から右へ、折り返して下へ（順番どおりに読ませたいとき）
   */
  order?: 'ring' | 'rows' | undefined;
  /** 列数を決め打ちする。order = 'rows' と合わせて使う */
  cols?: number | undefined;
  /** 中身が少なくても確保する区画数。更地を見せたいときに使う */
  min?: number | undefined;
}

export interface PlannedLot {
  id: string;
  district: string;
  /** 区画の左上（マス） */
  x: number;
  y: number;
  w: number;
  d: number;
  facing: Facing;
  /** 地区の中での並び（0 始まり） */
  index: number;
}

export interface PlannedBlock {
  id: string;
  label?: string | undefined;
  tone?: Tone | undefined;
  x: number;
  y: number;
  w: number;
  d: number;
  /** 中庭（建物を建てない内側）。区画が周りを一周してから余った所 */
  yard: { x: number; y: number; w: number; d: number } | null;
  /** まだ何も建っていない区画（更地）。街の伸びしろとして見せる */
  free: { x: number; y: number; w: number; d: number }[];
}

export interface PlannedRoad {
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
  kind: 'avenue' | 'street';
  /** 大通りに沿って走る向き。横断歩道や中央線の向きを決める */
  axis: 'x' | 'y';
}

export interface TownPlan {
  width: number;
  height: number;
  blocks: PlannedBlock[];
  lots: Map<string, PlannedLot>;
  roads: PlannedRoad[];
  /** 交差点（横断歩道を描く場所） */
  crossings: { x: number; y: number; w: number; d: number }[];
}

export interface PlanOptions {
  /** 街を始める行。上に大通りや市民地区を置くときにずらす */
  originY?: number;
  /** 横に何マスまで広げてよいか。超えたら次の段へ折り返す */
  maxWidth?: number;
  /** 斜め見下ろしでは横に広いほうが収まりがよいので、既定で横長に組む */
  aspect?: number;
}

/**
 * 街の幅をそろえる。上町と下町の大通りを同じ長さにして、街全体の道をつなげるために使う。
 * 横に走る道を伸ばし、街区は中央に寄せた写しを返す（元の割り付けは変えない）。
 */
export function stretchTown(plan: TownPlan, width: number): TownPlan {
  if (width <= plan.width) return plan;
  // 格子がずれないよう、寄せる幅は偶数マスにそろえる
  const dx = Math.floor((width - plan.width) / 2 / LOT) * LOT;
  const shift = <T extends { x: number }>(item: T): T => ({ ...item, x: item.x + dx });
  const lots = new Map<string, PlannedLot>();
  for (const [id, lot] of plan.lots) lots.set(id, shift(lot));
  return {
    ...plan,
    width,
    lots,
    blocks: plan.blocks.map((b) => ({
      ...shift(b),
      yard: b.yard ? shift(b.yard) : null,
      free: b.free.map(shift),
    })),
    crossings: plan.crossings.map(shift),
    roads: plan.roads.map((r) => (r.axis === 'x' ? { ...r, w: width } : shift(r))),
  };
}

/** 区画の数から、街区の列数と行数を決める。正方形に近づける（row は一列） */
export function blockGrid(count: number, shape: 'block' | 'row', fixedCols?: number): { cols: number; rows: number } {
  const n = Math.max(1, count);
  if (shape === 'row') return { cols: n, rows: 1 };
  if (fixedCols !== undefined && fixedCols > 0) {
    const cols = Math.min(fixedCols, n);
    return { cols, rows: Math.ceil(n / cols) };
  }
  // 等角で見るので、少しだけ横長にすると街区らしく見える
  const cols = Math.max(1, Math.min(6, Math.round(Math.sqrt(n * 1.6))));
  return { cols, rows: Math.ceil(n / cols) };
}

/**
 * 街区の中の区画を、外周から内側へ順に並べる。
 * 先に通りに面した区画が埋まるので、建物が通り沿いに並び、内側は中庭として残る。
 */
export function ringOrder(cols: number, rows: number): { col: number; row: number; facing: Facing }[] {
  const out: { col: number; row: number; facing: Facing }[] = [];
  let top = 0;
  let left = 0;
  let bottom = rows - 1;
  let right = cols - 1;
  const outer = (col: number, row: number): Facing => {
    // いちばん近い外側の辺に向ける
    const d = [row, cols - 1 - col, rows - 1 - row, col];
    const min = Math.min(...d);
    if (d[0] === min) return 'n';
    if (d[1] === min) return 'e';
    if (d[2] === min) return 's';
    return 'w';
  };
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c += 1) out.push({ col: c, row: top, facing: outer(c, top) });
    for (let r = top + 1; r <= bottom; r += 1) out.push({ col: right, row: r, facing: outer(right, r) });
    if (top < bottom) for (let c = right - 1; c >= left; c -= 1) out.push({ col: c, row: bottom, facing: outer(c, bottom) });
    if (left < right) for (let r = bottom - 1; r > top; r -= 1) out.push({ col: left, row: r, facing: outer(left, r) });
    top += 1;
    left += 1;
    bottom -= 1;
    right -= 1;
  }
  return out;
}

/** 左上から右へ、折り返して下へ。順番どおりに読ませたい地区に使う */
export function rowsOrder(cols: number, rows: number): { col: number; row: number; facing: Facing }[] {
  const out: { col: number; row: number; facing: Facing }[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      out.push({ col, row, facing: row === 0 ? 'n' : row === rows - 1 ? 's' : col === 0 ? 'w' : 'e' });
    }
  }
  return out;
}

interface Sized {
  district: PlanDistrict;
  cols: number;
  rows: number;
  w: number;
  d: number;
}

function sizeOf(district: PlanDistrict): Sized {
  const count = Math.max(district.min ?? 0, district.members.length, 1);
  const { cols, rows } = blockGrid(count, district.shape ?? 'block', district.cols);
  return {
    district,
    cols,
    rows,
    w: cols * LOT + SIDEWALK * 2,
    d: rows * LOT + SIDEWALK * 2,
  };
}

/**
 * 地区を碁盤の目に並べる。
 *
 * 段（シェルフ）に左から詰め、はみ出しそうなら次の段へ折り返す。
 * 段と段の間に大通り、段の中の街区と街区の間に通りを通すので、街全体が縦横の道でつながる。
 */
export function planTown(districts: readonly PlanDistrict[], options: PlanOptions = {}): TownPlan {
  const originY = options.originY ?? 0;
  const aspect = options.aspect ?? 1.9;
  const sized = districts.map(sizeOf);

  const area = sized.reduce((sum, s) => sum + (s.w + STREET) * (s.d + STREET), 0);
  const widest = sized.reduce((max, s) => Math.max(max, s.w), 0);
  const target = Math.max(widest + STREET * 2, options.maxWidth ?? Math.ceil(Math.sqrt(area * aspect)));

  // 段に詰める
  const shelves: Sized[][] = [];
  let shelf: Sized[] = [];
  let used = STREET;
  for (const s of sized) {
    const need = s.w + STREET;
    if (shelf.length > 0 && used + need > target) {
      shelves.push(shelf);
      shelf = [];
      used = STREET;
    }
    shelf.push(s);
    used += need;
  }
  if (shelf.length > 0) shelves.push(shelf);

  const blocks: PlannedBlock[] = [];
  const lots = new Map<string, PlannedLot>();
  const roads: PlannedRoad[] = [];
  const crossings: { x: number; y: number; w: number; d: number }[] = [];
  /** 縦の通りの位置（段ごと）。交差点を出すのに使う */
  const verticals: { x: number; w: number }[] = [];

  let width = STREET;
  let y = originY + AVENUE;
  for (const row of shelves) {
    const depth = row.reduce((max, s) => Math.max(max, s.d), 0);
    let x = STREET;
    for (const s of row) {
      const block: PlannedBlock = {
        id: s.district.id,
        label: s.district.label,
        tone: s.district.tone,
        x,
        y,
        w: s.w,
        d: s.d,
        yard: null,
        free: [],
      };
      const order = (s.district.order ?? 'ring') === 'rows' ? rowsOrder(s.cols, s.rows) : ringOrder(s.cols, s.rows);
      const count = Math.max(s.district.min ?? 0, s.district.members.length);
      s.district.members.forEach((id, i) => {
        const cell = order[i];
        if (!cell) return;
        lots.set(id, {
          id,
          district: s.district.id,
          x: x + SIDEWALK + cell.col * LOT,
          y: y + SIDEWALK + cell.row * LOT,
          w: LOT,
          d: LOT,
          facing: cell.facing,
          index: i,
        });
      });
      // 埋まらなかった区画は更地として残す（min のぶんまで）
      for (let i = s.district.members.length; i < Math.min(count, s.cols * s.rows); i += 1) {
        const cell = order[i];
        if (!cell) continue;
        block.free.push({ x: x + SIDEWALK + cell.col * LOT, y: y + SIDEWALK + cell.row * LOT, w: LOT, d: LOT });
      }
      // 使い切らなかった内側を中庭にする
      if (count < s.cols * s.rows && s.cols >= 3 && s.rows >= 3) {
        block.yard = {
          x: x + SIDEWALK + LOT,
          y: y + SIDEWALK + LOT,
          w: (s.cols - 2) * LOT,
          d: (s.rows - 2) * LOT,
        };
      }
      blocks.push(block);
      // 街区の右に通りを 1 本
      const roadX = x + s.w;
      verticals.push({ x: roadX, w: STREET });
      roads.push({ id: `street:v:${String(roadX)}:${String(y)}`, x: roadX, y, w: STREET, d: depth, kind: 'street', axis: 'y' });
      x = roadX + STREET;
    }
    // 段の左端の通り
    roads.push({ id: `street:v:0:${String(y)}`, x: 0, y, w: STREET, d: depth, kind: 'street', axis: 'y' });
    verticals.push({ x: 0, w: STREET });
    width = Math.max(width, x);
    // 段の下の大通り
    const avenueY = y + depth;
    roads.push({ id: `avenue:${String(avenueY)}`, x: 0, y: avenueY, w: 0, d: AVENUE, kind: 'avenue', axis: 'x' });
    y = avenueY + AVENUE;
  }

  // 段の上の大通り（先頭）
  roads.push({ id: `avenue:${String(originY)}`, x: 0, y: originY, w: 0, d: AVENUE, kind: 'avenue', axis: 'x' });

  // 横に走る道は街の幅いっぱいに伸ばす
  for (const road of roads) {
    if (road.axis === 'x') road.w = width;
  }

  // 交差点（縦の通り × 大通り）
  const avenueYs = roads.filter((r) => r.axis === 'x').map((r) => r.y);
  const seen = new Set<string>();
  for (const v of verticals) {
    for (const ay of avenueYs) {
      const key = `${String(v.x)}:${String(ay)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      crossings.push({ x: v.x, y: ay, w: v.w, d: AVENUE });
    }
  }

  return { width, height: y - originY, blocks, lots, roads, crossings };
}
