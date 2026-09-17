import type { ShellState } from '@/engines/kernel/registry';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { missionsOfChapter } from './registry';

/**
 * 施設（章）の「動きを見る」。その章の最初の任務の模範解答を、1 コマンドずつ実際に打った状態の列。
 * 説明を読むだけでなく、状態が変わっていく様子を図で見せるのに使う。
 */

export interface DemoFrame {
  /** 打ったコマンド。最初の 1 枚（打つ前）は null */
  command: string | null;
  output: string[];
  ok: boolean;
  state: ShellState;
}

const MAX_OUTPUT_LINES = 6;

export function demoFrames(chapterId: string, limit = 10): DemoFrame[] {
  const entry = missionsOfChapter(chapterId)[0];
  if (!entry) return [];
  const mission = entry.build();
  const session = createSession(mission.initial);
  let state = session.state;
  const frames: DemoFrame[] = [{ command: null, output: [], ok: true, state }];
  const lines = mission.steps.flatMap((s) => s.solution.flatMap((line) => line.split('\n'))).filter((l) => l.trim() !== '');
  for (const command of lines) {
    if (frames.length > limit) break;
    try {
      const outcome = execute(state, command, session.registry, session.clock);
      state = outcome.state;
      const text = outcome.chunks.map((c) => c.text).join('');
      const out = text.split('\n').filter((line, i, all) => !(i === all.length - 1 && line === ''));
      frames.push({
        command,
        output: out.length > MAX_OUTPUT_LINES ? [...out.slice(0, MAX_OUTPUT_LINES), '…'] : out,
        ok: outcome.exitCode === 0,
        state,
      });
    } catch {
      frames.push({ command, output: [], ok: false, state });
    }
  }
  return frames;
}
