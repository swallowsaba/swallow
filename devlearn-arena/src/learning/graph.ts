import { DOMAIN_DEFS, DOMAIN_ORDER, ENTRIES, entryOf } from '@/content/catalog';
import type { DomainId, Level } from '@/content/schema';
import type { Progress } from '@/game/types';
import { statusOf, type LessonStatus } from './library';

/**
 * 知識グラフの配置（docs/ui-design.md 6 章: 分野を大きな点、レッスンを小さな点で、推奨前提の辺を矢印で描く。修了した所が光る）。
 * 純粋な計算。同じ目録と記録からは同じ配置になる。
 *
 * - 分野は、推奨前提の深さで左から右の列に並べる（同じ列の中は推奨学習順で上から、列の高さに均して置く）
 * - 推奨前提の無い分野のうち、最初の分野（IT 基礎）は左端。それ以外（トラブルシューティング・研究。全分野を束ねる分野）は右端の列にまとめる
 * - 分野の名前は点の上、レッスンは点の下に初級・中級・上級の 3 段で並べる（段の中は推奨学習順）
 */

export const GRAPH_WIDTH = 1200;
export const GRAPH_HEIGHT = 800;
const MARGIN_X = 90;
const MARGIN_TOP = 40;
/** 下の凡例の分 */
const MARGIN_BOTTOM = 60;
export const LESSON_GAP = 13;
const ROW_GAP = 16;
/** 分野の点からレッスンの 1 段目までの距離 */
const LESSON_TOP = 34;

export interface GraphDomain {
  id: DomainId;
  name: string;
  x: number;
  y: number;
  column: number;
  total: number;
  completed: number;
}

export interface GraphLesson {
  id: string;
  domain: DomainId;
  level: Level;
  x: number;
  y: number;
  status: LessonStatus;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface KnowledgeGraph {
  domains: GraphDomain[];
  lessons: GraphLesson[];
  /** 分野どうしの推奨前提（前提 → 分野） */
  domainEdges: GraphEdge[];
  /** レッスンどうしの推奨前提（前提 → レッスン） */
  lessonEdges: GraphEdge[];
}

/** 分野の列（推奨前提の深さ） */
export function domainColumns(): Record<DomainId, number> {
  const memo = new Map<DomainId, number>();
  const root = DOMAIN_ORDER[0];
  const prereqs = (id: DomainId): DomainId[] => DOMAIN_DEFS.find((d) => d.id === id)?.prerequisites ?? [];
  const integrators = DOMAIN_ORDER.filter((id) => id !== root && prereqs(id).length === 0);
  const depth = (id: DomainId, path: DomainId[] = []): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (path.includes(id)) return 0;
    const parents = prereqs(id);
    const d = parents.length === 0 ? 0 : Math.max(...parents.map((p) => depth(p, [...path, id]))) + 1;
    memo.set(id, d);
    return d;
  };
  const columns = Object.fromEntries(DOMAIN_ORDER.filter((id) => !integrators.includes(id)).map((id) => [id, depth(id)])) as Record<DomainId, number>;
  const last = Math.max(...Object.values(columns)) + 1;
  for (const id of integrators) columns[id] = last;
  return columns;
}

/** 分野の点の半径と、点の上に置く名前の位置（画面の画素。配置を縮めても文字は縮めない） */
export const DOMAIN_R = 16;
export const LABEL_GAP = 10;
export const LABEL_SIZE = 14;

/** 修了の輪の太さ（画素） */
export const RING_WIDTH = 4;
/** 分野の点と修了の輪の間 */
const RING_GAP = 4;

/** 縮める割合 scale の時の、分野の点の半径（画素） */
export function domainRadius(scale: number): number {
  return DOMAIN_R * Math.min(1, scale);
}

/** 修了の輪の中心線の半径（画素） */
export function ringRadius(scale: number): number {
  return domainRadius(scale) + RING_GAP;
}

/** 分野の点の、輪を含めた外側の半径（画素） */
export function domainOuterRadius(scale: number): number {
  return ringRadius(scale) + RING_WIDTH / 2;
}

/** レッスンの点の半径（画素） */
export function lessonRadius(scale: number): number {
  return Math.max(2.6, 4.4 * scale);
}

/** 名前の幅の見積もり（画素。英数字は半分の幅） */
export function labelWidth(name: string): number {
  return [...name].reduce((w, ch) => w + (/[ -~]/.test(ch) ? LABEL_SIZE * 0.6 : LABEL_SIZE), 0);
}

export type LabelSide = 'above' | 'below';
type Box = { x: number; y: number; w: number; h: number };

/** 縮める割合 scale の時の、分野の名前の箱（画面の画素）。above は点の上、below はレッスンの段の下 */
export function labelBox(d: { name: string; x: number; y: number }, scale: number, side: LabelSide = 'above'): Box {
  const w = labelWidth(d.name);
  const h = LABEL_SIZE * 1.3;
  const top = side === 'above'
    ? d.y * scale - DOMAIN_R - LABEL_GAP + 4 - h
    : (d.y + LESSON_TOP + 2 * ROW_GAP) * scale + LABEL_GAP;
  // 端の分野の長い名前は、グラフの中へ寄せる
  const x = Math.min(Math.max(d.x * scale - w / 2, 4), GRAPH_WIDTH * scale - w - 4);
  return { x, y: top, w, h };
}

const hit = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * 分野の名前を置く側。点の上に置き、ほかの名前かレッスンの点に重なる時だけレッスンの段の下へ回す。
 * 文字は縮めないので、縮める割合ごとに決め直す
 */
export function labelSides(graph: KnowledgeGraph, scale: number): Record<DomainId, LabelSide> {
  const dots: Box[] = graph.lessons.map((l) => ({ x: l.x * scale - 4, y: l.y * scale - 4, w: 8, h: 8 }));
  const placed: Box[] = [];
  const sides = {} as Record<DomainId, LabelSide>;
  for (const d of graph.domains) {
    const free = (b: Box): boolean => !dots.some((x) => hit(b, x)) && !placed.some((x) => hit(b, x));
    const above = labelBox(d, scale, 'above');
    const side: LabelSide = free(above) ? 'above' : 'below';
    sides[d.id] = side;
    placed.push(side === 'above' ? above : labelBox(d, scale, 'below'));
  }
  return sides;
}

const LEVEL_ROW: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2 };

export function knowledgeGraph(progress: Progress): KnowledgeGraph {
  const columns = domainColumns();
  const columnCount = Math.max(...Object.values(columns)) + 1;
  const colWidth = (GRAPH_WIDTH - MARGIN_X * 2) / Math.max(1, columnCount - 1);
  const domains: GraphDomain[] = [];
  const lessons: GraphLesson[] = [];

  for (let c = 0; c < columnCount; c += 1) {
    const inColumn = DOMAIN_ORDER.filter((id) => columns[id] === c);
    const slot = (GRAPH_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM) / Math.max(1, inColumn.length);
    inColumn.forEach((id, i) => {
      const x = MARGIN_X + c * colWidth;
      // 列の中で均し、点の上の名前と下のレッスンの段の分だけ上へずらす
      const y = MARGIN_TOP + slot * (i + 0.5) - 20;
      const entries = ENTRIES.filter((e) => e.domain === id);
      const statuses = entries.map((e) => statusOf(e.id, progress));
      domains.push({
        id, name: DOMAIN_DEFS.find((d) => d.id === id)?.name ?? id, x, y, column: c,
        total: entries.length, completed: statuses.filter((s) => s === 'completed').length,
      });
      for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
        const row = entries.filter((e) => e.level === level);
        row.forEach((e, k) => {
          lessons.push({
            id: e.id, domain: id, level,
            x: x + (k - (row.length - 1) / 2) * LESSON_GAP,
            y: y + LESSON_TOP + LEVEL_ROW[level] * ROW_GAP,
            status: statusOf(e.id, progress),
          });
        });
      }
    });
  }

  const domainEdges = DOMAIN_DEFS.flatMap((d) => d.prerequisites.map((p) => ({ from: p, to: d.id })));
  const lessonEdges = ENTRIES.flatMap((e) => e.prerequisites.filter((p) => entryOf(p)).map((p) => ({ from: p, to: e.id })));
  return { domains, lessons, domainEdges, lessonEdges };
}
