import type { Chapter } from '@/content/types';

export interface StageNode {
  id: string;
  no: number;
  title: string;
  state: 'clear' | 'open' | 'locked';
  boss: boolean;
  done: number;
  total: number;
}

/** 章の一覧を、盤面に置くステージの形に変換する */
export function toStages(chapters: readonly Chapter[], cleared: ReadonlySet<string>): StageNode[] {
  return chapters.map((ch) => {
    const done = ch.lessons.filter((l) => cleared.has(l.id)).length;
    const ready = ch.lessons.some((l) => l.status === 'ready');
    const state: StageNode['state'] =
      done === ch.lessons.length && ch.lessons.length > 0 ? 'clear' : ready ? 'open' : 'locked';
    return {
      id: ch.id,
      no: ch.no,
      title: ch.title,
      state,
      boss: ch.lessons.some((l) => l.kind === 'boss'),
      done,
      total: ch.lessons.length,
    };
  });
}
