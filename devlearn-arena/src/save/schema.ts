import { z } from 'zod';
import { FACILITY_TYPES } from '@/city/facilities';
import { DOMAIN_IDS } from '@/content/schema';

/**
 * 保存データの形（docs/data-model.md 7 章の SaveData）。
 * 読み込み（ブラウザ内の保存と、書き出したファイル）の時に、この形で確かめる。形が合わない物は取り込まない。
 * 版が上がったら SAVE_VERSION を上げ、src/save/migrations.ts に前の版からの移行を足す。
 */

/** 版 2: 市長に、初回の操作説明を見終えたか（introSeen）を足した */
export const SAVE_VERSION = 2;

const domainId = z.enum(DOMAIN_IDS);
const at = z.string().min(1);
const count = z.number().int().min(0);

export const settingsSchema = z.object({
  sound: z.boolean(),
  reduceMotion: z.boolean(),
  fontScale: z.union([z.literal(1), z.literal(1.15), z.literal(1.3)]),
  quality: z.enum(['low', 'standard', 'high']),
  furigana: z.boolean(),
  commandHints: z.boolean(),
}).strict();
export type Settings = z.infer<typeof settingsSchema>;

/** 設定の既定（音は消す。docs/decisions.md Q-03） */
export const DEFAULT_SETTINGS: Settings = { sound: false, reduceMotion: false, fontScale: 1, quality: 'standard', furigana: false, commandHints: true };

const skillStateSchema = z.object({
  domain: domainId,
  value: z.number().min(0).max(100),
  stage: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  breakdown: z.object({ completion: z.number(), quizFirstTry: z.number(), practiceSuccess: z.number(), retention: z.number() }).strict(),
}).strict();

export const playerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: at,
  /** 初回の操作説明（docs/ui-design.md 9 章）を見終えた・飛ばした */
  introSeen: z.boolean(),
  xp: count,
  engineerRank: z.enum(['apprentice', 'junior', 'middle', 'senior', 'lead']),
  skills: z.record(domainId, skillStateSchema),
  settings: settingsSchema,
}).strict();

const point = z.object({ x: z.number(), y: z.number() }).strict();
const rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).strict();

export const citySchema = z.object({
  seed: z.number(),
  name: z.string().min(1),
  day: z.number().min(0),
  funds: z.number(),
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  population: z.number().min(0),
  techPower: z.number().min(0),
  revealed: z.array(rect),
  roads: z.array(z.object({ id: z.string(), kind: z.enum(['lane', 'street', 'avenue', 'bridge', 'roundabout']), path: z.array(point) }).strict()),
  zones: z.array(z.object({ id: z.string(), kind: z.enum(['residential', 'commercial', 'office']), cells: z.array(point) }).strict()),
  buildings: z.array(z.object({ id: z.string(), zoneId: z.string(), cell: point, variant: z.string(), level: z.number(), builtDay: z.number() }).strict()),
  facilities: z.array(z.object({
    id: z.string(),
    type: z.enum(FACILITY_TYPES),
    domain: domainId.optional(),
    origin: point,
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    state: z.enum(['constructing', 'active']),
    builtDay: z.number(),
    landmark: z.string().optional(),
  }).strict()),
}).strict();

const practiceAttemptSchema = z.object({
  at,
  stepsDone: z.array(z.string()),
  hintsUsed: z.number().int().min(0).max(3),
  errors: z.array(z.string()),
  recoveredFromError: z.boolean(),
  dangerousUsed: z.array(z.string()),
  success: z.boolean(),
  commands: z.array(z.string()),
}).strict();

const lessonProgressSchema = z.object({
  lessonId: z.string().min(1),
  status: z.enum(['not-started', 'in-progress', 'completed']),
  stage: z.enum(['explain', 'understand', 'quiz', 'practice', 'result', 'summary', 'done']),
  startedAt: at.optional(),
  completedAt: at.optional(),
  completions: count,
  quiz: z.array(z.object({ quizId: z.string(), at, choiceIds: z.array(z.string()), correct: z.boolean(), tryNo: z.number().int().min(1) }).strict()),
  practice: z.array(practiceAttemptSchema),
  lastXpDay: z.string().optional(),
}).strict();

/** 実戦の途中の状態。中身（engineState）は模擬環境ごとの形で、開く時に確かめる（壊れていれば初めから） */
const practiceSessionSchema = z.object({
  lessonId: z.string().min(1),
  stepIndex: count,
  engineState: z.record(z.string(), z.unknown()),
  savedAt: at,
}).strict();

export const XP_LOG_LIMIT = 1000;

export const saveDataSchema = z.object({
  version: z.literal(SAVE_VERSION),
  savedAt: at,
  player: playerSchema,
  city: citySchema,
  lessons: z.record(z.string(), lessonProgressSchema),
  practiceSessions: z.record(z.string(), practiceSessionSchema),
  reviews: z.array(z.object({ id: z.string(), lessonId: z.string(), due: z.string(), intervalDays: z.number().min(0), ease: z.number() }).strict()),
  missions: z.record(z.string(), z.object({
    missionId: z.string().min(1),
    status: z.enum(['available', 'in-progress', 'completed']),
    practice: z.array(practiceAttemptSchema).optional(),
    completedAt: at.optional(),
  }).strict()),
  xpLog: z.array(z.object({
    at,
    source: z.enum(['lesson-complete', 'quiz', 'practice', 'troubleshoot', 'mission', 'skill-up', 'review']),
    ref: z.string(),
    amount: z.number(),
  }).strict()).max(XP_LOG_LIMIT),
}).strict();

export type SaveData = z.infer<typeof saveDataSchema>;
