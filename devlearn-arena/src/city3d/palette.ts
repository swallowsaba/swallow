/**
 * 3D の街の色と材質。色は必ずここから引く。
 *
 * DESIGN.md §7 の表がそのまま入っている。彩度は抑え、原色と蛍光色を使わない。
 * ここ以外の `src/city3d/**` に色の直書き（`#rrggbb`）を置かない。
 * 守れているかは `palette.test.ts` が見張る。
 */

/** 地面のタイル 1 つの大きさ（メートル）。DESIGN.md §4 */
export const TILE_METERS = 8;

/** 1 階の高さ（メートル）。窓の帯はこの間隔で積む */
export const FLOOR_METERS = 3.4;

export const COLORS = {
  /** 草地 */
  grass: '#6f9447',
  /** 草地（濃い方）。起伏の陰や植え込みに使う */
  grassDark: '#5a7c38',
  /** 舗装 */
  pavement: '#8e8e8a',
  /** 土 */
  dirt: '#a08a62',
  /** 水 */
  water: '#4f7fa3',
  /** 石の壁（低層） */
  stone: '#c9bda6',
  /** ガラス（上層） */
  glass: '#8fa8bd',
  /** 屋根 */
  roof: '#8a4a3c',
  /** 灯り（emissive） */
  light: '#ffcf7a',
} as const;

export type ColorName = keyof typeof COLORS;

/** 上の 9 色から派生させる色。混ぜ物を増やさないため、必ずここに名前で置く */
export const PARTS = {
  /** 縁石 */
  curb: COLORS.stone,
  /** 車線の白線・横断歩道 */
  paint: '#e6e4dc',
  /** 砂の帯（岸） */
  sand: '#cbb488',
  /** 木の幹・柵・ベンチ */
  wood: '#6b533b',
  /** 木の葉 */
  leaf: COLORS.grassDark,
  /** 生垣 */
  hedge: COLORS.grass,
  /** 金属（街灯・屋上設備・アンテナ） */
  metal: '#9aa0a6',
  /** 車の車体 */
  carBody: '#b8bcc2',
  /** 車の窓 */
  carGlass: COLORS.glass,
  /** 車のタイヤ */
  tire: '#2b2d31',
  /** 前照灯。光らせない（光は意味を運ぶので、飾りでは灯さない） */
  headlight: '#e8e0c8',
  /** 尾灯 */
  taillight: '#8a3b34',
  /** 人 */
  person: '#d8cfc0',
  /** 暗い窓（灯っていない） */
  windowDark: '#4a5a68',
  /** 未解放の区域 */
  locked: '#3a4049',
  /** 空と fog */
  sky: '#b7cbdb',
} as const;

export type PartName = keyof typeof PARTS;

/** 車体の色。彩度を抑えた数色。街の意味の色（緑・黄・赤の光）とは混ざらない落ち着いた色にする */
export const CAR_COLORS = ['#b8bcc2', '#7d8fa3', '#8c5a4e', '#5f7461', '#d9d4c7', '#3f4852'] as const;

/** 材質の指定。`MeshStandardMaterial` にそのまま渡せる形にしてある */
export interface Surface {
  color: string;
  roughness: number;
  metalness: number;
}

export const SURFACES = {
  grass: { color: COLORS.grass, roughness: 0.95, metalness: 0 },
  grassDark: { color: COLORS.grassDark, roughness: 0.95, metalness: 0 },
  pavement: { color: COLORS.pavement, roughness: 0.9, metalness: 0 },
  dirt: { color: COLORS.dirt, roughness: 0.95, metalness: 0 },
  water: { color: COLORS.water, roughness: 0.25, metalness: 0.1 },
  stone: { color: COLORS.stone, roughness: 0.8, metalness: 0 },
  /** ガラスだけは DESIGN.md §7 が数値まで決めている */
  glass: { color: COLORS.glass, roughness: 0.2, metalness: 0.2 },
  roof: { color: COLORS.roof, roughness: 0.85, metalness: 0 },
  curb: { color: PARTS.curb, roughness: 0.85, metalness: 0 },
  paint: { color: PARTS.paint, roughness: 0.7, metalness: 0 },
  sand: { color: PARTS.sand, roughness: 0.95, metalness: 0 },
  wood: { color: PARTS.wood, roughness: 0.9, metalness: 0 },
  leaf: { color: PARTS.leaf, roughness: 0.9, metalness: 0 },
  hedge: { color: PARTS.hedge, roughness: 0.9, metalness: 0 },
  metal: { color: PARTS.metal, roughness: 0.4, metalness: 0.6 },
  car: { color: PARTS.carBody, roughness: 0.35, metalness: 0.3 },
  carGlass: { color: PARTS.carGlass, roughness: 0.2, metalness: 0.2 },
  /** 車体の塗装。色は 1 台ずつ CAR_COLORS から掛けるので、下地は白 */
  carPaint: { color: '#ffffff', roughness: 0.35, metalness: 0.3 },
  tire: { color: PARTS.tire, roughness: 0.9, metalness: 0 },
  headlight: { color: PARTS.headlight, roughness: 0.3, metalness: 0.1 },
  taillight: { color: PARTS.taillight, roughness: 0.4, metalness: 0.1 },
  person: { color: PARTS.person, roughness: 0.85, metalness: 0 },
  window: { color: PARTS.windowDark, roughness: 0.25, metalness: 0.15 },
  locked: { color: PARTS.locked, roughness: 1, metalness: 0 },
} as const satisfies Record<string, Surface>;

export type SurfaceName = keyof typeof SURFACES;

/** 空と fog。遠景を薄く沈ませる */
export const SKY = {
  color: PARTS.sky,
  /**
   * fog の掛かり方。街の半径に対する倍率で持つ。
   * 近景と中景ははっきり見せ、霧は地平線の近くにだけ掛ける。
   * near は街の半径の 2 倍以上（REWORK 2-1）。
   */
  fogNearRadii: 2.2,
  fogFarRadii: 5,
} as const;

/**
 * 選んだ建物に立てる印。光る輪と名札。
 * HUD と同じ青（`src/features/park/hud/theme.ts`）を使い、街の上でも浮いて見えるようにする。
 */
export const MARK = {
  ring: '#5cc1ff',
  /**
   * 壊れている所に立てる光。原因の場所を一目で示す。
   * この赤は障害だけに使う。ここが赤いときは、必ず何かが止まっている。
   */
  alarm: '#e2705c',
  plate: 'rgba(16,20,27,0.92)',
  plateEdge: '#2f8fd8',
  plateText: '#eef2f6',
  plateSub: '#8fa0b2',
} as const;

/** 建てられる区画の光。更地でも何をすればよいか分かるようにする */
export const SITE = {
  glow: '#5cc1ff',
  /** 建築権が無い・建てられない区画 */
  idle: '#7d8794',
} as const;

/**
 * 情報表示（CS2 の情報ビュー）の色。街の上に薄く重ねる。
 * 彩度は抑える。原色と蛍光色を使わない。
 */
export const OVERLAY = {
  /** 落ち着いて住んでいる */
  good: '#5aa06e',
  /** 引っ越し中・通っている */
  moving: '#5c93c1',
  /** 不調・止まっている */
  bad: '#c1735f',
  /** 誰もいない */
  empty: '#6f7681',
  /** バス路線 */
  bus: '#c9a24f',
  /** 系譜（Git） */
  lineage: '#9b7fb5',
} as const;

/**
 * コマンドが街を旅するときに走る光の粒。
 *
 * 粒は停留所を過ぎるたびに姿を変える。何を運んでいるかが色で分かるように、
 * 運ぶものごとに色を分けてある。光っている所では必ず何かが起きている。
 */
export const SPARK = {
  /** 申し込み・設計図・注文書といった紙もの */
  sheet: '#8fd4ff',
  /** 行き先の決まった荷 */
  crate: '#ffce8a',
  /** 刻まれた石（コミット） */
  stone: '#d6dbe4',
  /** 台帳の記録・印・時刻表 */
  seal: '#8fe6bd',
  /** 住人の荷物 */
  bundle: '#ffb3a3',
  /** 尾を引く粒 */
  trail: '#cfe8ff',
} as const;

/** 押したときに出す一行の見た目 */
export const NOTE = {
  fill: 'rgba(47,52,64,0.86)',
  text: '#eef1f6',
} as const;

/** 太陽と空の回り込み。時間帯は 0（真夜中）..1 で表す */
export const LIGHT = {
  sun: '#fff3dc',
  /** 夕方の太陽 */
  sunset: '#ffc98f',
  /** 空からの間接光（青み） */
  skyBounce: PARTS.sky,
  /** 地面からの照り返し */
  groundBounce: COLORS.grassDark,
  /** 夜の窓の灯り */
  window: COLORS.light,
} as const;
