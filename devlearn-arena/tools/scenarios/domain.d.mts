import type { Page } from '@playwright/test';

/** tools/scenarios/domain.mjs の runLesson の形（e2e/domains.spec.ts から呼ぶ） */
export interface RunLessonOptions {
  shot?: (name: string) => Promise<void>;
  tag?: string;
  first?: string;
  wrong?: string;
  reset?: boolean;
  firstStep?: string;
  firstTerm?: boolean;
  hints?: boolean;
  log?: (...args: unknown[]) => void;
}

export interface RunLessonResult {
  /** わざと誤った時に出たエラーの小窓の文（出なければ null） */
  error: string | null;
  /** 結果の段の判定（data-result） */
  result: string | null;
  /** XP / スキルの段の XP の内訳の文 */
  xp: string | null;
}

export function runLesson(page: Page, id: string, opts?: RunLessonOptions): Promise<RunLessonResult>;

export default function domain(page: Page, shot: (name: string) => Promise<void>): Promise<void>;
