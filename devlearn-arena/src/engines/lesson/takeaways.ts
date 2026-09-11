import type { LessonDefinition } from './types';

/** 「ここまでで分かったこと」は必ずこの行数にそろえる */
export const TAKEAWAY_LINES = 3;

/** 説明文の最初の1文。長い説明から要点だけを拾う */
function firstSentence(text: string): string {
  const end = text.indexOf('。');
  return (end === -1 ? text : text.slice(0, end + 1)).trim();
}

/**
 * 任務を終えたときに出す「ここまでで分かったこと」を3行にする。
 * 1. 任務に書いてあればそれを使う
 * 2. 無ければ目標（〜できる）を「できるようになったこと」として並べる
 * 3. 足りなければ、後ろの手順の説明の最初の1文で埋める（最後にやったことほど記憶に近い）
 */
export function takeawaysOf(lesson: LessonDefinition): string[] {
  const out: string[] = [];
  const push = (line: string) => {
    const trimmed = line.trim();
    if (trimmed !== '' && !out.includes(trimmed) && out.length < TAKEAWAY_LINES) out.push(trimmed);
  };
  for (const line of lesson.takeaways ?? []) push(line);
  for (const objective of lesson.objectives) push(objective);
  for (const step of [...lesson.steps].reverse()) push(firstSentence(step.explain));
  push(lesson.intro.summary);
  push(lesson.intro.why);
  return out;
}
