export const TRACK_IDS = ['k8s', 'net', 'git', 'github'] as const;
export type TrackId = (typeof TRACK_IDS)[number];

/** concept=解説+図, drill=コマンド反復, challenge=課題のみ, boss=インシデント対応 */
export type LessonKind = 'concept' | 'drill' | 'challenge' | 'boss';

/** ready=実装済みで遊べる, planned=目次のみ（UI に「準備中」で表示する） */
export type ImplStatus = 'ready' | 'planned';

export interface DocRef {
  label: string;
  url: string;
}

export interface LessonMeta {
  /** 例: 'k8s/03/rolling-update' */
  id: string;
  trackId: TrackId;
  chapterId: string;
  slug: string;
  title: string;
  kind: LessonKind;
  status: ImplStatus;
  /** 想定所要時間（分） */
  minutes: number;
  /** 出典。推測で書かず必ず公式ドキュメントを紐付ける */
  docs: DocRef[];
}

export interface Chapter {
  /** 例: 'k8s/03' */
  id: string;
  trackId: TrackId;
  no: number;
  title: string;
  summary: string;
  lessons: LessonMeta[];
}

export interface Track {
  id: TrackId;
  title: string;
  goal: string;
  /** 実装フェーズ（§11）。UI で「いつ遊べるか」を示す */
  phase: 'P2' | 'P3' | 'P4' | 'P5';
  chapters: Chapter[];
}
