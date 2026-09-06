import { z } from 'zod';

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
});
export type Settings = z.infer<typeof settingsSchema>;

export const profileSchema = z.object({
  xp: z.number().int().min(0),
  streakDays: z.number().int().min(0),
  /** YYYY-MM-DD */
  lastActiveDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const saveDataSchema = z.object({
  version: z.literal(SAVE_VERSION),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  profile: profileSchema,
  lessons: z.record(z.string(), lessonProgressSchema),
  reviewQueue: z.array(reviewItemSchema),
  settings: settingsSchema,
});
export type SaveData = z.infer<typeof saveDataSchema>;

export const defaultSettings: Settings = {
  locale: 'ja',
  motion: 'system',
  tickMs: 500,
  soundEnabled: false,
};

export function createEmptySave(now: number): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    profile: { xp: 0, streakDays: 0, lastActiveDay: null },
    lessons: {},
    reviewQueue: [],
    settings: { ...defaultSettings },
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
