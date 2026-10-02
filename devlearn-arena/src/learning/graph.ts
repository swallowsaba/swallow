import { DOMAIN_DEFS, DOMAIN_ORDER, ENTRIES, entryOf } from '@/content/catalog';
import type { DomainId, Level } from '@/content/schema';
import type { Progress } from '@/game/types';
import { statusOf, type LessonStatus } from './library';

/**
 * 知識グラフの配置（docs/ui-design.md 6 章: 分野を大きな点、レッスンを小さな点で、推奨前提の辺を矢印で描く。修了した所が光る）。
 * 純粋な計算。同じ目録と記録からは同じ配置になる。
 *
 * - 分野は、推奨前提の深さで左から右の列に並べる（同じ列の中は推奨学習順で上から）
 * - 推奨前提の無い分野のうち、最初の分野（IT 基礎）は左端。それ以外（トラブルシューティング・研究）は、
 *   それを「次」に挙げる分野、無ければ「関連」に挙げる分野の後ろの列に置く
 * - レッスンは分野の点の下に、初級・中級・上級の 3 段で並べる（段の中は推奨学習順）
 */

export const GRAPH_WIDTH = 1600;
export const GRAPH_HEIGHT = 900;
const MARGIN_X = 110;
const MARGIN_TOP = 70;
const MARGIN_BOTTOM = 40;
export const LESSON_GAP = 13;
const ROW_GAP = 16;

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
  const depth = (id: DomainId, path: DomainId[] = []): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (path.includes(id)) return 0;
    const def = DOMAIN_DEFS.find((d) => d.id === id);
    let parents: DomainId[] = def?.prerequisites ?? [];
    if (parents.length === 0 && id !== root) {
      const referrers = DOMAIN_DEFS.filter((d) => d.next.includes(id)).map((d) => d.id);
      parents = referrers.length > 0 ? referrers : (def?.related ?? []).filter((r) => (DOMAIN_DEFS.find((d) => d.id === r)?.prerequisites.length ?? 0) > 0);
    }
    const d = parents.length === 0 ? 0 : Math.max(...parents.map((p) => depth(p, [...path, id]))) + 1;
    memo.set(id, d);
    return d;
  };
  return Object.fromEntries(DOMAIN_ORDER.map((id) => [id, depth(id)])) as Record<DomainId, number>;
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
      const y = MARGIN_TOP + slot * i + Math.min(40, slot * 0.25);
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
            y: y + 30 + LEVEL_ROW[level] * ROW_GAP,
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
