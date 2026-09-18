import type { TKey } from '@/i18n';
import type { Facing, TownPlan } from './plan';

/**
 * 街の場面モデル。任務のシェルの状態（ファイル・Git・クラスタ・ネットワーク・GitHub）を、
 * カテゴリごとの見立てで「建物・道・目印・線」に置き換えたもの。描画から切り離して、テストで中身を確かめる。
 * 座標はマス（x が右下、y が左下に伸びる等角の格子）。
 */

export type Translate = (key: TKey, params?: Readonly<Record<string, string | number>>) => string;

/**
 * 建物の見え方。
 * solid=完成 / frame=骨組み（仮組み） / blueprint=計画図（地面の青図） / scaffold=足場（工事中・改修中）
 * ghost=薄い影（もう使われていない） / ruin=取り壊し / dark=停電 / tent=仮設のテント
 */
export type BuildStyle = 'solid' | 'frame' | 'blueprint' | 'scaffold' | 'ghost' | 'ruin' | 'dark' | 'tent';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'accent' | 'muted';

export interface SceneInfo {
  title: string;
  /** 見立て（街では何か = IT では何か） */
  kind: string;
  lines: string[];
  /** 次に進めるなら何をするか（文章。ターミナルには打たない） */
  next?: string | undefined;
}

export interface Badge {
  icon: string;
  tone: Tone;
}

export interface SceneBuilding {
  type: 'building';
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
  floors: number;
  style: BuildStyle;
  color: string;
  roof: 'flat' | 'gable' | 'dome' | 'hall';
  /** 正面（入口や看板）を向ける側。通りに面させるのに使う */
  facing?: Facing | undefined;
  label?: string | undefined;
  badges?: Badge[] | undefined;
  /** 部屋（手前の面に並ぶ窓）。色と、赤や黄の印 */
  rooms?: { color: string; tone?: Tone | undefined }[] | undefined;
  /** 直前の状態から変わった（光らせる） */
  changed?: boolean | undefined;
  info: SceneInfo;
}

export interface SceneRoad {
  type: 'road';
  id: string;
  cells: { x: number; y: number }[];
  kind: 'main' | 'street' | 'plan' | 'blocked';
  label?: string | undefined;
  info?: SceneInfo | undefined;
}

export interface SceneMarker {
  type: 'marker';
  id: string;
  x: number;
  y: number;
  icon: string;
  label?: string | undefined;
  tone: Tone;
  info?: SceneInfo | undefined;
}

export interface SceneLink {
  type: 'link';
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  style: 'solid' | 'dashed';
  tone: Tone;
  /** 線の上を車や荷物が流れる */
  flow?: boolean | undefined;
  info?: SceneInfo | undefined;
}

/** 地面の区画（広場・待機場・工事区画など） */
export interface ScenePlot {
  type: 'plot';
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
  tone: Tone;
  label?: string | undefined;
}

export type SceneItem = SceneBuilding | SceneRoad | SceneMarker | SceneLink | ScenePlot;

export interface LegendEntry {
  /** 凡例の見本 */
  sample: BuildStyle | 'road' | 'plan' | 'marker' | 'link' | 'room';
  icon?: string | undefined;
  /** 街での呼び名 */
  name: string;
  /** IT での意味 */
  meaning: string;
  /** そうするコマンド */
  command?: string | undefined;
}

export interface SceneStat {
  icon: string;
  label: string;
  value: string | number;
}

export interface Scene {
  /** 使っているマスの大きさ */
  width: number;
  height: number;
  /** 街区と道の割り付け。地区（ディレクトリ・ブランチ・ノード…）を碁盤の目に並べたもの */
  plan: TownPlan;
  items: SceneItem[];
  stats: SceneStat[];
  legend: LegendEntry[];
  /** 何も無いときの案内 */
  empty?: { title: string; text: string } | undefined;
  /** 最初に映す場所 */
  focus: { x: number; y: number };
}

export const TONE_COLOR: Record<Tone, string> = {
  ok: '#4caf50',
  warn: '#f2b233',
  bad: '#e0483a',
  info: '#3f8fd6',
  accent: '#e0703a',
  muted: '#9aa0a6',
};

/** 名前から決まる色（入居企業・通りなど） */
export function colorOf(name: string): string {
  const palette = ['#e98b5a', '#5aa6e9', '#8bc34a', '#c77ddb', '#f2c14e', '#4fc1b0', '#e36b8f', '#8d9be8'];
  let h = 7;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length] ?? '#e98b5a';
}

export const short = (hash: string): string => hash.slice(0, 7);
