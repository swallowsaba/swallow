import type { ExperienceKind } from '@/engines/lesson/types';

/**
 * 体験の町。学びの流れの 1〜3 段（体験・登場・確かめ）は、この町の上で進む。
 *
 * 分野ごとに 1 つ。どのひねり（twist）で遊んでも、町に建っている物と id は同じ。
 * 登場の段の矢印（`RevealPointer.points`）と、確かめのクイズの答え（`CityQuiz.answer`）は、
 * ここの id を指す。存在しない id を指していないかはテストで確かめる（`src/lesson/flow.test.ts`）。
 *
 * ここは React にも three にも触れない。形と置き場所だけを持つ。
 */

/** 町の物の形。絵はこの形ごとに描き分ける（`TownView.tsx`） */
export type ThingShape =
  | 'house'
  | 'tower'
  | 'facility'
  | 'post'
  | 'desk'
  | 'shelf'
  | 'bin'
  | 'tray'
  | 'gate'
  | 'office'
  | 'stop'
  | 'junction'
  | 'town'
  | 'plate'
  | 'board'
  | 'bench';

export interface TownThing {
  id: string;
  shape: ThingShape;
  /** 町での呼び名。用語は使わない */
  label: string;
  /** 斜めから見下ろす格子の上の位置 */
  gx: number;
  gy: number;
  /** 入れられる数。住人や写しを受け入れる物だけが持つ */
  room?: number;
  /** 最初から入っている数。確かめのクイズは、この状態の町で答える */
  holds?: number;
  /** 登場の段で建つ施設。体験の間はまだ無い */
  facility?: boolean;
  /** 登場の段から見える札（住所など）。仕組みが現れて初めて付く */
  plate?: string;
  /** 中に何があるか。確かめの段で、物の下に小さく出す */
  note?: string;
}

export interface Town {
  things: readonly TownThing[];
  /** 物どうしを結ぶ道。絵を描くためだけに使う */
  roads: readonly (readonly [string, string])[];
}

const FACILITY = (gx: number, gy: number, label: string): TownThing => ({
  id: 'facility',
  shape: 'facility',
  label,
  gx,
  gy,
  facility: true,
});

/** シェル: 住所の分からない町で荷物を届ける */
const DELIVERY: Town = {
  things: [
    { id: 'post', shape: 'post', label: '郵便局', gx: 0, gy: 3 },
    { id: 'h1', shape: 'house', label: '青木さんの家', gx: 2, gy: 0, plate: '/北通り/青木', note: '予定表' },
    { id: 'h2', shape: 'house', label: '石田さんの家', gx: 4, gy: 0, plate: '/北通り/石田', note: '設定の紙（持ち主だけが書ける錠前付き）' },
    { id: 'h3', shape: 'house', label: '上野さんの家', gx: 6, gy: 0, plate: '/北通り/上野', note: '日誌（ERROR が 3 行）' },
    { id: 'h4', shape: 'house', label: '江口さんの家', gx: 2, gy: 3, plate: '/中通り/江口', note: '写真の束' },
    { id: 'h5', shape: 'house', label: '大森さんの家', gx: 4, gy: 3, plate: '/中通り/大森', note: '設定の控え' },
    { id: 'h6', shape: 'house', label: '加藤さんの家', gx: 6, gy: 3, plate: '/中通り/加藤', note: '日誌（ERROR は無い）' },
    { id: 'h7', shape: 'house', label: '木村さんの家', gx: 2, gy: 6, plate: '/南通り/木村', note: '大きな木箱（町でいちばん場所を取る）' },
    { id: 'h8', shape: 'house', label: '工藤さんの家', gx: 4, gy: 6, plate: '/南通り/工藤', note: '日誌（ERROR が 1 行）' },
    { id: 'h9', shape: 'house', label: '小林さんの家', gx: 6, gy: 6, plate: '/南通り/小林', note: '手順書' },
    FACILITY(0, 0, '案内所'),
  ],
  roads: [
    ['post', 'h4'], ['h4', 'h5'], ['h5', 'h6'],
    ['h1', 'h2'], ['h2', 'h3'], ['h7', 'h8'], ['h8', 'h9'],
    ['h1', 'h4'], ['h4', 'h7'], ['facility', 'h1'],
  ],
};

/** Git: 何度も書き直した設計図の写しを、手で棚にしまう */
const BLUEPRINTS: Town = {
  things: [
    { id: 'tray', shape: 'tray', label: '届いた書き足し', gx: 0, gy: 0 },
    { id: 'desk', shape: 'desk', label: '製図台', gx: 1, gy: 3 },
    { id: 'stage', shape: 'tray', label: '写す前の置き台', gx: 3, gy: 3 },
    { id: 'desk2', shape: 'desk', label: 'もう 1 つの製図台', gx: 0, gy: 6 },
    { id: 's1', shape: 'shelf', label: '写し 1', gx: 6, gy: 0, room: 1, holds: 1 },
    { id: 's2', shape: 'shelf', label: '写し 2', gx: 6, gy: 2, room: 1, holds: 1 },
    { id: 's3', shape: 'shelf', label: '写し 3', gx: 6, gy: 4, room: 1, holds: 1 },
    { id: 's4', shape: 'shelf', label: '写し 4', gx: 8, gy: 0, room: 1, holds: 0 },
    { id: 's5', shape: 'shelf', label: '写し 5', gx: 8, gy: 2, room: 1, holds: 0 },
    { id: 's6', shape: 'shelf', label: '写し 6', gx: 8, gy: 4, room: 1, holds: 0 },
    { id: 'bin', shape: 'bin', label: 'くず箱', gx: 7, gy: 7 },
    FACILITY(3, 7, '記録庫'),
  ],
  roads: [
    ['tray', 'desk'], ['desk', 'stage'], ['stage', 's1'], ['stage', 's3'], ['s1', 's4'], ['s3', 's6'],
    ['desk', 'desk2'], ['desk2', 'facility'], ['facility', 'bin'],
  ],
};

/** Kubernetes: やって来る住人を、手で空いたビルへ案内する */
const DISPATCH: Town = {
  things: [
    { id: 'gate', shape: 'gate', label: '待合所', gx: -1, gy: 2 },
    { id: 't1', shape: 'tower', label: 'ビル 1', gx: 3, gy: -1, room: 3, holds: 1 },
    { id: 't2', shape: 'tower', label: 'ビル 2', gx: 6, gy: -1, room: 3, holds: 2 },
    { id: 't3', shape: 'tower', label: 'ビル 3', gx: 3, gy: 5, room: 3, holds: 0 },
    { id: 't4', shape: 'tower', label: 'ビル 4', gx: 6, gy: 5, room: 3, holds: 1 },
    { id: 'office', shape: 'office', label: '事務所', gx: -1, gy: -1 },
    { id: 'stop', shape: 'stop', label: 'バス停', gx: 8, gy: 2 },
    FACILITY(-1, 5, '管理棟'),
  ],
  roads: [
    ['gate', 't1'], ['gate', 't3'], ['t1', 't2'], ['t3', 't4'], ['t2', 'stop'], ['t4', 'stop'],
    ['office', 'gate'], ['facility', 'gate'],
  ],
};

/** ネットワーク: 道も案内板も無い所へ、荷車を送る */
const CARTS: Town = {
  things: [
    { id: 'home', shape: 'town', label: '自分の町', gx: 0, gy: 3 },
    { id: 'j1', shape: 'junction', label: '分かれ道 1', gx: 3, gy: 1 },
    { id: 'j2', shape: 'junction', label: '分かれ道 2', gx: 3, gy: 3 },
    { id: 'j3', shape: 'junction', label: '分かれ道 3', gx: 3, gy: 5 },
    { id: 'n1', shape: 'town', label: '12 番の町', gx: 6, gy: 0 },
    { id: 'n2', shape: 'town', label: '27 番の町', gx: 6, gy: 2 },
    { id: 'n3', shape: 'town', label: '31 番の町', gx: 6, gy: 4 },
    { id: 'n4', shape: 'town', label: '45 番の町', gx: 6, gy: 6 },
    { id: 'p1', shape: 'plate', label: '番号札 50', gx: -2, gy: 2, room: 1, holds: 0 },
    { id: 'p2', shape: 'plate', label: '番号札 51', gx: -2, gy: 4, room: 1, holds: 1 },
    { id: 'p3', shape: 'plate', label: '番号札 52', gx: -2, gy: 6, room: 1, holds: 0 },
    FACILITY(0, 0, '案内塔'),
  ],
  roads: [
    ['home', 'j1'], ['home', 'j2'], ['home', 'j3'],
    ['j1', 'n1'], ['j1', 'n2'], ['j2', 'n2'], ['j2', 'n3'], ['j3', 'n3'], ['j3', 'n4'],
    ['facility', 'home'],
  ],
};

/** GitHub: 大勢で 1 枚の設計図を直す */
const OVERWRITE: Town = {
  things: [
    { id: 'board', shape: 'board', label: 'みんなの設計図', gx: 4, gy: 3 },
    { id: 'd1', shape: 'desk', label: '青木さんの机', gx: 1, gy: 0 },
    { id: 'd2', shape: 'desk', label: '石田さんの机', gx: 1, gy: 3 },
    { id: 'd3', shape: 'desk', label: '上野さんの机', gx: 1, gy: 6 },
    { id: 'reviewer', shape: 'desk', label: '見る人の机', gx: 7, gy: 1 },
    { id: 'bench', shape: 'bench', label: '試し台', gx: 7, gy: 5 },
    { id: 'tray', shape: 'tray', label: '頼まれごとの箱', gx: 4, gy: 7 },
    FACILITY(4, 0, '受付棟'),
  ],
  roads: [
    ['d1', 'board'], ['d2', 'board'], ['d3', 'board'], ['board', 'reviewer'], ['board', 'bench'],
    ['board', 'tray'], ['board', 'facility'],
  ],
};

export const TOWNS: Readonly<Record<ExperienceKind, Town>> = {
  delivery: DELIVERY,
  blueprints: BLUEPRINTS,
  dispatch: DISPATCH,
  carts: CARTS,
  overwrite: OVERWRITE,
};

/** その分野の町に、その id の物があるか */
export function hasThing(kind: ExperienceKind, id: string): boolean {
  return TOWNS[kind].things.some((t) => t.id === id);
}

export function thingOf(kind: ExperienceKind, id: string): TownThing | undefined {
  return TOWNS[kind].things.find((t) => t.id === id);
}
