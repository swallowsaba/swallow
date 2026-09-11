import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { isHelpCommand, lessonHelpCommands } from './helpCommands';
import type { LessonStep } from './types';

const STEP: LessonStep = {
  prompt: 'README を作る',
  check: 'README.md がある',
  hints: ['ファイルを作るコマンドは touch です', 'touch README.md'],
  solution: ['touch README.md'],
  assert: () => false,
  explain: '',
};

/** null は任務を終えた後 */
function setup(step: LessonStep | null = STEP) {
  let seen = 0;
  const registry = createDefaultRegistry().registerAll(
    lessonHelpCommands({
      step: () => step ?? undefined,
      stepIndex: () => 1,
      revealed: () => seen,
      onHint: () => {
        seen += 1;
      },
    }),
  );
  let session: Session = createSession({ registry, files: { '/home/learner': null } });
  return {
    run(line: string) {
      const outcome = execute(session.state, line, session.registry, session.clock);
      session = { ...session, state: outcome.state };
      return outcome.chunks.map((c) => c.text).join('');
    },
    get seen() {
      return seen;
    },
  };
}

describe('hint は打ったときだけ、1件ずつ出す', () => {
  it('打つたびに次のヒントが出て、出し切ったらそう伝える', () => {
    const sh = setup();
    const first = sh.run('hint');
    expect(first).toContain('ヒント 1 / 2（手順 2）: ファイルを作るコマンドは touch です');
    expect(first).toContain('もう一度 hint');
    expect(sh.seen).toBe(1);
    const second = sh.run('hint');
    expect(second).toContain('ヒント 2 / 2（手順 2）: touch README.md');
    expect(second).toContain('最後のヒント');
    const third = sh.run('hint');
    expect(third).toContain('ここまで');
    expect(sh.seen).toBe(2);
  });

  it('打つまでは1件も見たことにならない', () => {
    const sh = setup();
    sh.run('ls');
    expect(sh.seen).toBe(0);
  });

  it('任務を終えていれば、そう伝える', () => {
    expect(setup(null).run('hint')).toContain('終わっています');
  });

  it('ヒントの無い手順では、そう伝える', () => {
    expect(setup({ ...STEP, hints: [] }).run('hint')).toContain('ヒントがありません');
  });
});

describe('助けを求めるコマンドの見分け', () => {
  it('hint だけが当たる', () => {
    expect(isHelpCommand('hint')).toBe(true);
    expect(isHelpCommand('  hint ')).toBe(true);
    expect(isHelpCommand('hinted')).toBe(false);
    expect(isHelpCommand('git add .')).toBe(false);
  });
});
