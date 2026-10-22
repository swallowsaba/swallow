import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_GUIDES } from '@/content/glossary';
import { loadAllLessons } from '@/content/lessons';
import { playSqlSteps, playSteps } from '@/learning/practice';

/**
 * ヒントを開かず、最後のヒントとは違う正しい書き方（別解）で通す（VERIFY-FREE.txt【1】）。
 * 別解は確かめるための台本側の持ち物（tools/scenarios/variants/<レッスンID>.json）。画面と同じ関数で、人と同じ順に通す
 */

const root = join(__dirname, '../..');

/** 手順の目的そのものが、失敗を見て読むことのレッスン（docs/progress/verify-all.md の C2「想定した失敗」。tools/scenarios/verify-free.mjs と同じ） */
const DESIGNED_FAILURES = new Set(['git.b.06', 'git.i.05', 'git.i.02', 'trouble.b.02', 'docker.b.01', 'k8s.b.01', 'net.b.03', 'net.b.04', 'net.i.01', 'net.i.02',
  // 目的の文が「送って、どこで止まるかを見る」「入れ替えが進むかを見る」「curl の誤りを読む」「200 が返らなければ返事の数から原因を探す」と、失敗を見ることを書いている手順（最後のヒントは先に直すので通らないが、目的の文のとおりに打つと通る。docs/progress/verify-free.md）
  'found.b.07', 'net.b.01', 'k8s.i.08', 'sec.b.07', 'web.b.07']);

interface Variant {
  name: string;
  steps: Record<string, unknown[]>;
}

describe('別解（ヒントを開かず、別の正しい書き方で通す）', async () => {
  const lessons = await loadAllLessons();

  it('全てのレッスンに、別解が 2 通り以上ある', () => {
    const few = lessons.filter((l) => {
      const f = join(root, 'tools/scenarios/variants', `${l.id}.json`);
      return !existsSync(f) || (JSON.parse(readFileSync(f, 'utf8')) as { variants: Variant[] }).variants.length < 2;
    });
    expect(few.map((l) => l.id)).toEqual([]);
  });

  it('どの別解でも全ての手順が達成になり、正しい操作にエラーの案内が出ない（出てよいのは想定した失敗のレッスンの、その手順の想定エラーだけ）', async () => {
    const problems: string[] = [];
    for (const l of lessons) {
      const f = join(root, 'tools/scenarios/variants', `${l.id}.json`);
      if (!existsSync(f)) continue;
      const { variants } = JSON.parse(readFileSync(f, 'utf8')) as { variants: Variant[] };
      for (const [k, v] of variants.entries()) {
        const inputs = (step: { id: string }) => (v.steps[step.id] ?? []) as never[];
        const sql = l.practice.mode === 'sql' || l.practice.environment === 'sql';
        const played = sql ? await playSqlSteps(l.practice, ERROR_GUIDES, inputs) : playSteps(l.practice, ERROR_GUIDES, inputs);
        // 出てよい案内は、想定した失敗のレッスンで、その手順の想定エラーが、その手順の間に出た物だけ（tools/scenarios/verify-free.mjs と同じ決まり）
        const expected = (step: string): readonly string[] => l.practice.steps.find((s) => s.id === step)?.expectedErrors ?? [];
        const shown = played.shown
          .filter((s) => !(DESIGNED_FAILURES.has(l.id) && s.step === s.from && expected(s.step).includes(s.guide)))
          .map((s) => `「${s.line}」で案内（${s.guide}）が出る`);
        for (const p of [...played.missed.map((id) => `実戦 ${id}: この手順を満たさない`), ...shown]) problems.push(`${l.id} #${String(k + 1)} ${v.name}: ${p}`);
      }
    }
    expect(problems).toEqual([]);
  }, 120_000);
});
