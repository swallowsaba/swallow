import type { CommandSpec } from '@/engines/kernel/registry';
import type { LessonStep } from './types';

/**
 * 任務の助けを端末から引く `hint` と `answer`。
 *
 * ヒントは画面に勝手に出さず、自分で `hint` と打ったときだけ1件ずつ出す。
 * 打つたびに次のヒントが出て、出し切ったら answer を案内する。
 * answer は模範解答を見せるだけで、実行はしない（自分で打つことで手が覚える）。
 *
 * いまどの手順にいて、何件ヒントを見たかは画面側が持っている。ここではそれを読んで出力を作り、
 * 見たことを知らせるだけにする。
 */
export interface LessonHelpSource {
  /** いまの手順。任務を終えていれば undefined */
  step: () => LessonStep | undefined;
  /** いまの手順が何番目か（0 始まり） */
  stepIndex: () => number;
  /** いまの手順で、すでに見たヒントの数 */
  revealed: () => number;
  /** ヒントを1件見た */
  onHint: () => void;
  /** 模範解答を見た */
  onAnswer: () => void;
}

export const HELP_COMMANDS = ['hint', 'answer'] as const;

/** 画面側で「手数」に数えないコマンドか。助けを求めたことを罰にしない */
export function isHelpCommand(line: string): boolean {
  const name = line.trim().split(/\s+/)[0] ?? '';
  return (HELP_COMMANDS as readonly string[]).includes(name);
}

const DONE = 'この任務はもう終わっています。上の「次の任務へ」から続けられます。\n';

export function lessonHelpCommands(source: LessonHelpSource): CommandSpec[] {
  return [
    {
      name: 'hint',
      summary: 'いまの手順のヒントを1件ずつ出す（打つたびに次のヒント）',
      handler: () => {
        const step = source.step();
        if (step === undefined) return { stdout: DONE };
        const total = step.hints.length;
        const seen = source.revealed();
        const label = `手順 ${String(source.stepIndex() + 1)}`;
        if (total === 0) {
          return { stdout: `${label} にはヒントがありません。answer で模範解答を見られます。\n` };
        }
        if (seen >= total) {
          return {
            stdout:
              `${label} のヒントはここまでです（${String(total)} / ${String(total)}）。\n` +
              '最後のヒントは、そのまま打てば通るコマンドです。answer で模範解答も見られます。\n',
          };
        }
        const hint = step.hints[seen] ?? '';
        source.onHint();
        const more = seen + 1 < total ? 'もう一度 hint と打つと、次のヒントが出ます。' : 'これが最後のヒントです。';
        return { stdout: `ヒント ${String(seen + 1)} / ${String(total)}（${label}）: ${hint}\n${more}\n` };
      },
    },
    {
      name: 'answer',
      summary: 'いまの手順の模範解答を出す（実行はしない）',
      handler: () => {
        const step = source.step();
        if (step === undefined) return { stdout: DONE };
        const label = `手順 ${String(source.stepIndex() + 1)}`;
        source.onAnswer();
        if (step.solution.length === 0) {
          return { stdout: `${label} は、前の手順で一緒に満たされています。打つコマンドはありません。\n` };
        }
        const lines = step.solution.map((line) => `  ${line}`).join('\n');
        return {
          stdout: `${label} の模範解答（まだ実行していません。自分で打ってください）:\n${lines}\n`,
        };
      },
    },
  ];
}
