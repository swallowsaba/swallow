import { DOMAIN_DEFS, DOMAIN_ORDER, ENTRIES, entryOf, LEVEL_NAMES, recommendedRank } from '@/content/catalog';
import type { CatalogEntry, DomainId, Level } from '@/content/schema';
import type { Progress } from '@/game/types';

/**
 * 学習ライブラリ（docs/ui-design.md 6 章・docs/learning-design.md 10 章）。純粋な計算。
 * 分野ごとにテーマとレッスンを並べる。既定の並びは推奨学習順。検索・難易度・修了状況で絞り込む。
 * **どのレッスンも始められる。** 推奨前提は案内だけで、始めるのを止めない。
 */

export type LessonStatus = 'not-started' | 'in-progress' | 'completed';

export const STATUS_NAMES: Record<LessonStatus, string> = { 'not-started': '未修了', 'in-progress': '学習中', completed: '修了' };

export function statusOf(id: string, progress: Progress): LessonStatus {
  const lp = progress.lessons[id];
  if (!lp) return 'not-started';
  // 一度でもまとめまで行ったら修了（2 回目の途中でも修了のまま）
  if (lp.completions > 0) return 'completed';
  return lp.status === 'in-progress' ? 'in-progress' : 'not-started';
}

export interface LibraryFilter {
  query: string;
  levels: readonly Level[];
  /** 空なら全て */
  statuses: readonly LessonStatus[];
  /** 分野を 1 つに絞る（情報パネルの「学習ライブラリで全部見る」から） */
  domain?: DomainId | undefined;
}

export const NO_FILTER: LibraryFilter = { query: '', levels: [], statuses: [] };

export interface LibraryLesson {
  entry: CatalogEntry;
  status: LessonStatus;
  /** 推奨学習順の何番目か（1 から） */
  order: number;
}

export interface LibraryTheme {
  theme: string;
  lessons: LibraryLesson[];
}

export interface LibraryDomain {
  id: DomainId;
  name: string;
  description: string;
  themes: LibraryTheme[];
  /** 絞り込みの前の、この分野のレッスンの数と修了の数 */
  total: number;
  completed: number;
}

const normalize = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

/** 検索の当たり: ID・題名・到達目標・テーマ・分野の名前 */
function matches(e: CatalogEntry, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const domainName = DOMAIN_DEFS.find((d) => d.id === e.domain)?.name ?? '';
  return [e.id, e.title, e.goal, e.theme, domainName].some((s) => normalize(s).includes(q));
}

export function libraryOf(progress: Progress, filter: LibraryFilter = NO_FILTER): LibraryDomain[] {
  const out: LibraryDomain[] = [];
  for (const id of DOMAIN_ORDER) {
    if (filter.domain && filter.domain !== id) continue;
    const def = DOMAIN_DEFS.find((d) => d.id === id);
    const all = ENTRIES.filter((e) => e.domain === id);
    const lessons: LibraryLesson[] = all
      .map((entry) => ({ entry, status: statusOf(entry.id, progress), order: recommendedRank(entry.id) + 1 }))
      .filter((l) => (filter.levels.length === 0 || filter.levels.includes(l.entry.level))
        && (filter.statuses.length === 0 || filter.statuses.includes(l.status))
        && matches(l.entry, filter.query));
    const themes: LibraryTheme[] = [];
    for (const l of lessons) {
      const last = themes[themes.length - 1];
      if (last?.theme === l.entry.theme) last.lessons.push(l);
      else themes.push({ theme: l.entry.theme, lessons: [l] });
    }
    if (lessons.length === 0 && (filter.query || filter.levels.length || filter.statuses.length)) continue;
    out.push({
      id, name: def?.name ?? id, description: def?.description ?? '', themes,
      total: all.length, completed: all.filter((e) => statusOf(e.id, progress) === 'completed').length,
    });
  }
  return out;
}

/* ---------- 入口の札（docs/ui-design.md 6 章） ---------- */

export interface LessonLink {
  id: string;
  title: string;
  domain: DomainId;
  level: Level;
  status: LessonStatus;
}

export interface EntryCard {
  entry: CatalogEntry;
  status: LessonStatus;
  levelName: string;
  /** 目安の時間（書き起こしたレッスンはその値、まだなら 10〜20 分） */
  minutes: string;
  prerequisites: LessonLink[];
  /** 推奨前提のうち、まだ修了していないもの（推奨学習順） */
  unmet: LessonLink[];
  /** 推奨前提が ID で書けないもの（例: 任意の中級 2 分野） */
  prerequisiteNote?: string;
  related: LessonLink[];
  next: LessonLink[];
  /** 「先に見ると分かりやすい」の案内（推奨前提が全て修了なら null） */
  advice: string | null;
  /** 始められるか。**常に true**（推奨前提はロックではない） */
  canStart: true;
}

function link(id: string, progress: Progress): LessonLink | null {
  const e = entryOf(id);
  return e ? { id, title: e.title, domain: e.domain, level: e.level, status: statusOf(id, progress) } : null;
}

const links = (ids: readonly string[], progress: Progress): LessonLink[] => ids.map((id) => link(id, progress)).filter((l): l is LessonLink => l !== null);

export function entryCardOf(id: string, progress: Progress, minutes?: number): EntryCard | null {
  const entry = entryOf(id);
  if (!entry) return null;
  const prerequisites = links(entry.prerequisites, progress);
  const unmet = prerequisites.filter((p) => p.status !== 'completed').sort((a, b) => recommendedRank(a.id) - recommendedRank(b.id));
  const card: EntryCard = {
    entry,
    status: statusOf(id, progress),
    levelName: LEVEL_NAMES[entry.level],
    minutes: minutes !== undefined ? `${String(minutes)} 分` : '10〜20 分',
    prerequisites,
    unmet,
    related: links(entry.related, progress),
    next: links(entry.next, progress),
    advice: unmet.length > 0 ? `先に「${unmet.map((u) => u.title).join('」「')}」を見ておくと分かりやすい。このまま始めてもよい。` : null,
    canStart: true,
  };
  if (entry.prerequisiteNote) card.prerequisiteNote = entry.prerequisiteNote;
  return card;
}

/* ---------- 情報パネルの「ここで学ぶ」（docs/ui-design.md 5 章: 推奨順・未修了優先） ---------- */

export function lessonsForDomains(domains: readonly DomainId[], progress: Progress, count = 3): LessonLink[] {
  const rank = (e: CatalogEntry): number => domains.indexOf(e.domain) * ENTRIES.length + recommendedRank(e.id);
  const pool = ENTRIES.filter((e) => domains.includes(e.domain)).sort((a, b) => rank(a) - rank(b));
  const notDone = pool.filter((e) => statusOf(e.id, progress) !== 'completed');
  const done = pool.filter((e) => statusOf(e.id, progress) === 'completed');
  return links([...notDone, ...done].slice(0, count).map((e) => e.id), progress);
}
