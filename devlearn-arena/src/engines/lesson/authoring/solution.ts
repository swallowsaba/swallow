import type { LessonDefinition, LessonStep } from '../types';
import { play } from './play';

/** 模範解答を、ヒントの1件として見せる形にする（1行ずつ改行で区切る） */
export function solutionText(lines: readonly string[]): string {
  return lines.join('\n');
}

/**
 * 最後のヒントを「そのまま打てば通るコマンド」にそろえる。
 * 助言で終わっているときは、模範解答を最後に足す。
 */
export function withSolutionHint<T extends Pick<LessonStep, 'hints' | 'solution'>>(step: T): T {
  if (step.solution.length === 0) return step;
  const text = solutionText(step.solution);
  if (step.hints[step.hints.length - 1] === text) return step;
  return { ...step, hints: [...step.hints, text] };
}

/** 任務の全手順の最後のヒントをそろえる */
export function finalizeLesson(lesson: LessonDefinition): LessonDefinition {
  return { ...lesson, steps: lesson.steps.map(withSolutionHint) };
}

/**
 * 任務全体の模範解答を、手順ごとに切り分ける。
 * 実際に打って、どの行でどの手順を越えたかを見て決める。
 * 1行で2手順ぶん進んだときは、後ろの手順は空になる。
 */
export function splitSolution(lesson: LessonDefinition, lines: readonly string[]): string[][] {
  const parts: string[][] = lesson.steps.map(() => []);
  const { reached } = play(lesson, lines);
  let at = 0;
  reached.forEach((next, i) => {
    const line = lines[i];
    if (line !== undefined) parts[Math.min(at, parts.length - 1)]?.push(line);
    at = next;
  });
  return parts;
}

/**
 * ファイルを書き出す1コマンド。ヒアドキュメントなので、書いた形のまま入る。
 * マニフェストのように行の多いものを、模範解答として1手で書くために使う。
 */
export function heredoc(path: string, lines: readonly string[]): string {
  return [`cat > ${path} <<EOF`, ...lines, 'EOF'].join('\n');
}
