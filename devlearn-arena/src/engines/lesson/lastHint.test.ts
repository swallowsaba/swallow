import { describe, expect, it } from 'vitest';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { splitCommands } from '@/engines/kernel/continuation';
import type { ShellState } from '@/engines/kernel/registry';
import { createShellState } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { allMissions } from './registry';
import { createProgress, evaluate, solutionThrough } from './runner';
import type { LessonDefinition, LessonStep } from './types';

/**
 * 全任務の最後のヒントは、そのまま打てば通る完全なコマンドである（REWORK 3-4）。
 *
 * `missions.test.ts` は「最初の手順から順にヒントどおり打てば最後まで通る」ことを見る。
 * そこでは、前の手順のヒントで一緒に満たされた手順は打たれずに飛ばされる。
 * だが学習者は、別の道を通ってその手順で止まることがある。
 * ここでは**手順ごとに**、その手順で立ち止まっている人がヒントをそのまま打った場合を見る。
 */

const registry = createDefaultRegistry();

/** 最後のヒントを、打つ 1 行ずつに割る（ヒアドキュメントの本文はまとめて 1 つ） */
function lastHintLines(step: LessonStep): string[] {
  return splitCommands(step.hints[step.hints.length - 1] ?? '');
}

interface Attempt {
  /** 打ち終えた時点で、その手順を越えているか */
  passed: boolean;
  /** 打った行と、その終了コード */
  ran: { line: string; exitCode: number }[];
}

/**
 * その手順の直前まで模範解答で進めてから、最後のヒントをそのまま打つ。
 * 打ち終えた時点でその手順を越えていれば通ったとみなす。
 */
function typeLastHintAt(lesson: LessonDefinition, index: number): Attempt {
  const step = lesson.steps[index];
  if (step === undefined) throw new Error(`手順が無い: ${lesson.id} #${String(index)}`);
  const clock = createClock();
  const timeline: ShellState[] = [createShellState(lesson.initial)];
  let progress = createProgress(lesson);
  const run = (line: string): number => {
    const last = timeline[timeline.length - 1];
    if (last === undefined) return -1;
    const outcome = execute(last, line, registry, clock);
    timeline.push(outcome.state);
    progress = evaluate(lesson, progress, timeline);
    return outcome.exitCode;
  };

  for (const line of solutionThrough(lesson, index - 1)) run(line);
  const ran = lastHintLines(step).map((line) => ({ line, exitCode: run(line) }));
  return { passed: progress.cleared || progress.stepIndex > index, ran };
}

const LESSONS = allMissions().map((entry) => entry.build());

describe('最後のヒントは、その手順で止まっている人がそのまま打てば通る', () => {
  it.each(LESSONS.map((lesson) => [lesson.id, lesson] as const))('%s', (_id, lesson) => {
    const stuck: string[] = [];
    lesson.steps.forEach((step, i) => {
      const attempt = typeLastHintAt(lesson, i);
      if (!attempt.passed) {
        const ran = attempt.ran.map((r) => `${r.line} → ${String(r.exitCode)}`).join('\n');
        stuck.push(`手順 ${String(i + 1)}: ${step.check}\n打った行:\n${ran}`);
      }
    });
    expect(stuck).toEqual([]);
  });
});

describe('最後のヒントは助言の文ではなくコマンド', () => {
  it('どの手順にも最後のヒントがあり、空行ではない', () => {
    const empty: string[] = [];
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        if (lastHintLines(step).length === 0) empty.push(`${lesson.id}: ${step.check}`);
      }
    }
    expect(empty).toEqual([]);
  });

  it('打てる形で始まっている（打てないと分かっているものを見せる任務を除く）', () => {
    // 「無いコマンドを打つとどうなるか」を見せるのが目的の任務。ここでは除く
    const intended = new Set(['kernel/08/exit-code-unknown-command', 'kernel/10/reproduce-no-command']);
    const odd: string[] = [];
    for (const lesson of LESSONS) {
      if (intended.has(lesson.id)) continue;
      for (const step of lesson.steps) {
        for (const line of lastHintLines(step)) {
          const head = line.trim().split(/\s+/)[0] ?? '';
          // 出力の切り詰め（`> file`）と、学習者が作った script（`./x.sh`）も打てる形
          const runnable = registry.has(head) || head === '>' || head === '>>' || head.startsWith('./');
          if (!runnable) odd.push(`${lesson.id}: ${line}`);
        }
      }
    }
    expect(odd).toEqual([]);
  });

  it('説明の文を最後のヒントにしていない（コマンドの外に句読点を置かない）', () => {
    // 引用符の中は書き込む中身なので日本語でよい。コマンドとして打つ部分だけを見る
    const quoted = /"[^"]*"|'[^']*'/g;
    const prose: string[] = [];
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        const last = step.hints[step.hints.length - 1] ?? '';
        if (/[。、]/.test(last.replace(quoted, ''))) prose.push(`${lesson.id}: ${last}`);
      }
    }
    expect(prose).toEqual([]);
  });

  it('手順の説明文をそのまま最後のヒントに置いていない', () => {
    const copied: string[] = [];
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        const last = step.hints[step.hints.length - 1] ?? '';
        if (last === step.check || last === step.prompt || last === step.explain) {
          copied.push(`${lesson.id}: ${last}`);
        }
      }
    }
    expect(copied).toEqual([]);
  });
});
