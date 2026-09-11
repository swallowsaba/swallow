import { z } from 'zod';
import { shellSnapshotSchema } from './shellSchema';

/**
 * 保存データのスキーマ。localStorage への書き込みは必ずここを通す。
 * version を上げたら migrate() に移行処理を足す（破棄しない）。
 */
export const SAVE_VERSION = 1 as const;

export const lessonProgressSchema = z.object({
  cleared: z.boolean(),
  attempts: z.number().int().min(0),
  hintsUsed: z.number().int().min(0),
  /** 0-100。ヒント使用と手数で減点した最良スコア */
  bestScore: z.number().int().min(0).max(100).nullable(),
  /** epoch ms。UI 表示専用（エンジンの決定論には関与しない） */
  clearedAt: z.number().int().nullable(),
});
export type LessonProgress = z.infer<typeof lessonProgressSchema>;

/** SM-2 簡易版のレビュー項目 */
export const reviewItemSchema = z.object({
  lessonId: z.string().min(1),
  /** YYYY-MM-DD */
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  intervalDays: z.number().int().min(0),
  ease: z.number().min(1.3).max(3.0),
  reps: z.number().int().min(0),
});
export type ReviewItem = z.infer<typeof reviewItemSchema>;

export const settingsSchema = z.object({
  locale: z.enum(['ja', 'en']),
  motion: z.enum(['system', 'reduced']),
  /** 仮想時計の 1 tick の実時間（ms） */
  tickMs: z.number().int().min(50).max(5000),
  soundEnabled: z.boolean(),
  /** 左（ターミナル側）の横幅の割合(%) */
  paneMain: z.number().min(25).max(80).default(55),
  /** 右側のうち地図が占める高さの割合(%) */
  paneMap: z.number().min(25).max(85).default(62),
  /** 一度読んだ任務でも、開くたびに「学ぶ」画面を出す */
  introAlways: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;

export const profileSchema = z.object({
  xp: z.number().int().min(0),
  streakDays: z.number().int().min(0),
  /** YYYY-MM-DD */
  lastActiveDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /** 取り組んだ日。連続日数の表示に使う。直近 90 日ぶんだけ持つ */
  activeDays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
  /** 初回の案内を読み終えたか */
  onboarded: z.boolean().default(false),
});
export type Profile = z.infer<typeof profileSchema>;

/**
 * シェルの状態そのもの。リロードしても続きから触れるように丸ごと保存する。
 * 中身のスキーマは shellSchema.ts にある。
 */
export {
  clusterSnapshotSchema,
  gitSnapshotSchema,
  repoSnapshotSchema,
  shellSnapshotSchema,
  topologySnapshotSchema,
  type ShellSnapshot,
} from './shellSchema';

export const missionProgressSchema = z.object({
  stepIndex: z.number().int().min(0),
  cleared: z.boolean(),
  hintsUsed: z.number().int().min(0),
  commandsUsed: z.number().int().min(0),
  mistakes: z.number().int().min(0),
  /** 解答を見て飛ばした手順。古い保存データには無いので空で補う */
  skipped: z.array(z.number().int().min(0)).default([]),
});
export type MissionProgress = z.infer<typeof missionProgressSchema>;

export const saveDataSchema = z.object({
  version: z.literal(SAVE_VERSION),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  profile: profileSchema,
  lessons: z.record(z.string(), lessonProgressSchema),
  reviewQueue: z.array(reviewItemSchema),
  settings: settingsSchema,
  /** 任務ごとの手順の進み具合 */
  missionProgress: z.record(z.string(), missionProgressSchema).default({}),
  /** 任務ごとのシェルの状態 */
  missionState: z.record(z.string(), shellSnapshotSchema).default({}),
  /** 最後に開いていた任務 */
  lastMissionId: z.string().nullable().default(null),
  /** 「学ぶ」画面を読み終えた任務。次からは自動で開かない */
  introsRead: z.array(z.string()).default([]),
});
export type SaveData = z.infer<typeof saveDataSchema>;

export const defaultSettings: Settings = {
  locale: 'ja',
  motion: 'system',
  tickMs: 500,
  soundEnabled: false,
  paneMain: 55,
  paneMap: 62,
  introAlways: false,
};

export function createEmptySave(now: number): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    profile: { xp: 0, streakDays: 0, lastActiveDay: null, activeDays: [], onboarded: false },
    lessons: {},
    reviewQueue: [],
    settings: { ...defaultSettings },
    missionProgress: {},
    missionState: {},
    lastMissionId: null,
    introsRead: [],
  };
}

export function emptyLessonProgress(): LessonProgress {
  return { cleared: false, attempts: 0, hintsUsed: 0, bestScore: null, clearedAt: null };
}

export type ParseResult =
  | { ok: true; data: SaveData }
  | { ok: false; reason: 'empty' | 'invalid-json' | 'schema'; detail?: string };

/** 未知バージョンをここで吸収する。今は v1 のみ。 */
export function migrate(raw: unknown): unknown {
  return raw;
}

export function parseSave(text: string | null): ParseResult {
  if (text === null || text.trim() === '') return { ok: false, reason: 'empty' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  const parsed = saveDataSchema.safeParse(migrate(json));
  if (!parsed.success) {
    return { ok: false, reason: 'schema', detail: parsed.error.issues[0]?.message ?? 'unknown' };
  }
  return { ok: true, data: parsed.data };
}
