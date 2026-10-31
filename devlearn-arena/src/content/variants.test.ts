import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_GUIDES } from '@/content/glossary';
import { loadAllLessons } from '@/content/lessons';
import { MISSIONS } from '@/content/missions';
import { playSqlSteps, playSteps } from '@/learning/practice';

/**
 * ヒントを開かず、最後のヒントとは違う正しい書き方（別解）で通す（VERIFY-FREE.txt【1】）。
 * 別解は確かめるための台本側の持ち物（tools/scenarios/variants/<レッスンID>.json）。画面と同じ関数で、人と同じ順に通す
 */

const root = join(__dirname, '../..');

/** 手順の目的そのものが、失敗を見て読むことのレッスン（docs/progress/verify-all.md の C2「想定した失敗」。tools/scenarios/verify-free.mjs と同じ） */
const DESIGNED_FAILURES = new Set(['git.b.06', 'git.i.05', 'git.i.02', 'trouble.b.02', 'docker.b.01', 'k8s.b.01', 'net.b.03', 'net.b.04', 'net.i.01', 'net.i.02',
  // 目的の文が「送って、どこで止まるかを見る」「入れ替えが進むかを見る」「curl の誤りを読む」「200 が返らなければ返事の数から原因を探す」と、失敗を見ることを書いている手順（最後のヒントは先に直すので通らないが、目的の文のとおりに打つと通る。docs/progress/verify-free.md）
  'found.b.07', 'net.b.01', 'k8s.i.08', 'sec.b.07', 'web.b.07',
  // 範囲を広げた 80 本（docs/progress/expand-scope.md）: 目的の文が「curl の警告の文を読み」と、失敗を見ることを書いている手順
  'sec.i.01',
  // 目的の文が「これが断られる」と、失敗を見ることを書いている手順
  'db.i.04', 'trouble.i.02', 'trouble.i.03', 'linux.a.01', 'net.a.01', 'net.a.02', 'web.a.02', 'git.a.02']);

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

  it('わざと間違えると、その手順でエラーの案内が出て達成にならず、正しく打ち直すと全ての手順が達成になる（VERIFY-FREE.txt【2】）', async () => {
    const problems: string[] = [];
    for (const l of lessons) {
      const f = join(root, 'tools/scenarios/variants', `${l.id}.json`);
      if (!existsSync(f)) continue;
      const { variants, wrong } = JSON.parse(readFileSync(f, 'utf8')) as { variants: Variant[]; wrong?: Wrong };
      const first = variants[0];
      if (!wrong || !first) {
        problems.push(`${l.id}: 間違える操作（wrong）が無い`);
        continue;
      }
      const sql = l.practice.mode === 'sql' || l.practice.environment === 'sql';
      const play = (inputs: (step: { id: string }) => never[]) => (sql ? playSqlSteps(l.practice, ERROR_GUIDES, inputs) : Promise.resolve(playSteps(l.practice, ERROR_GUIDES, inputs)));
      const at = l.practice.steps.findIndex((s) => s.id === wrong.step);
      if (at < 0) {
        problems.push(`${l.id}: 間違える手順 ${wrong.step} が無い`);
        continue;
      }
      // 前の手順は別解の 1 つ目で通し、間違える手順では間違った操作だけをする
      const before = (step: { id: string }) => {
        const k = l.practice.steps.findIndex((s) => s.id === step.id);
        // 答える手順で、打つ物だけを間違える時（commands）は、答えの欄に入れる物の代わりに、答えない印を置く（最後の物は答えとして扱われる）
        return (k < at ? first.steps[step.id] ?? [] : k === at ? (wrong.commands ? [...wrong.input, NO_ANSWER] : wrong.input) : []) as never[];
      };
      const a = await play(before);
      const shown = a.shown.filter((s) => s.from === wrong.step && (!wrong.commands || s.failed));
      if (shown.length === 0) problems.push(`${l.id}: ${wrong.why}: エラーの案内が出ない`);
      if (a.run.stepsDone.includes(wrong.step)) problems.push(`${l.id}: ${wrong.why}: 間違えたのに手順 ${wrong.step} が達成になる`);
      // 間違えた後、模は置き違えた札を戻し・引いた線を外してから、正しく打ち直す（retry があれば、それを打つ）。
      // 壊した物を「初めに戻す」で戻す物（reset）は、初めから別解の 1 つ目で通す
      const undo = wrong.input.flatMap((x): unknown[] => (typeof x === 'string' ? [] : x.op === 'put' ? [{ op: 'take', item: x.item, slot: x.slot }] : x.op === 'connect' ? [{ op: 'cut', a: x.a, b: x.b }] : [])).reverse();
      const again = (step: { id: string }) => (step.id === wrong.step && !wrong.reset ? [...wrong.input, ...undo, ...(wrong.retry ?? first.steps[step.id] ?? [])] : first.steps[step.id] ?? []) as never[];
      const b = await play(again);
      for (const id of b.missed) problems.push(`${l.id}: ${wrong.why}: 打ち直しても手順 ${id} を満たさない`);
      const later = b.shown.filter((s) => s.from !== wrong.step && !(DESIGNED_FAILURES.has(l.id) && s.step === s.from && (l.practice.steps.find((x) => x.id === s.step)?.expectedErrors ?? []).includes(s.guide)));
      for (const s of later) problems.push(`${l.id}: ${wrong.why}: 打ち直した後の「${s.line}」で案内（${s.guide}）が出る`);
    }
    expect(problems).toEqual([]);
  }, 120_000);
});

describe('ミッション 6 本の別解（VERIFY-FREE.txt【4】）', () => {
  it('どのミッションにも別解が 2 通り以上あり、どの別解でも全ての手順が達成になる（出てよいのは、その手順の想定エラーで、本当に失敗した命令の物だけ）', () => {
    const problems: string[] = [];
    for (const m of MISSIONS) {
      const f = join(root, 'tools/scenarios/variants', `mission-${m.id}.json`);
      const variants = existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as { variants: Variant[] }).variants : [];
      if (variants.length < 2) problems.push(`${m.id}: 別解が 2 通り無い`);
      for (const [k, v] of variants.entries()) {
        const played = playSteps(m.practice, ERROR_GUIDES, (step) => (v.steps[step.id] ?? []) as never[]);
        const expected = (step: string): readonly string[] => m.practice.steps.find((s) => s.id === step)?.expectedErrors ?? [];
        const shown = played.shown.filter((s) => !(s.failed && s.step === s.from && expected(s.step).includes(s.guide))).map((s) => `「${s.line}」で案内（${s.guide}）が出る`);
        for (const p of [...played.missed.map((id) => `手順 ${id} を満たさない`), ...shown]) problems.push(`${m.id} #${String(k + 1)} ${v.name}: ${p}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

const NO_ANSWER = '（答えない）';

interface Wrong {
  step: string;
  why: string;
  /** 間違えた後に打ち直す物（無ければ別解の 1 つ目のその手順） */
  retry?: unknown[];
  /** 間違えた操作が壊した物を「初めに戻す」で戻してから、初めから打ち直す */
  reset?: boolean;
  /** 答える手順で、打つ物（コマンド・SQL）だけを間違える（答えの欄には入れない） */
  commands?: boolean;
  input: (string | { op: string; item?: string; slot?: string; a?: string; b?: string })[];
}
