import { glossary, lookup } from './glossary';
import { allMissions } from './registry';
import type { MissionTrack } from './types';

export interface GlossaryRow {
  term: string;
  plain: string;
  aliases: readonly string[];
  /** この語を「学ぶ」画面で説明している任務。推奨順 */
  missions: readonly { id: string; title: string; track: MissionTrack }[];
}

/**
 * 用語集の画面に出す一覧。
 * 全任務の「学ぶ」画面（intro.concepts）から語を集め、用語集と同じ並び（話題ごと）にそろえる。
 * それぞれの語に、その語が出てくる任務を推奨順で添える。
 */
export function glossaryIndex(): GlossaryRow[] {
  const usedBy = new Map<string, { id: string; title: string; track: MissionTrack }[]>();
  for (const entry of allMissions()) {
    for (const concept of entry.intro.concepts) {
      const term = lookup(concept.term)?.term ?? concept.term;
      const list = usedBy.get(term) ?? [];
      if (!list.some((m) => m.id === entry.id)) list.push({ id: entry.id, title: entry.title, track: entry.track });
      usedBy.set(term, list);
    }
  }
  return glossary()
    .filter((c) => usedBy.has(c.term))
    .map((c) => ({ term: c.term, plain: c.plain, aliases: c.aliases ?? [], missions: usedBy.get(c.term) ?? [] }));
}

/** 語・言い換え・別名のどれかに、空白区切りの語を全部含むか */
export function matchesGlossary(row: GlossaryRow, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return true;
  const haystack = [row.term, row.plain, ...row.aliases].join(' ').toLowerCase();
  return words.every((w) => haystack.includes(w));
}
