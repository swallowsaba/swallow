import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { createClock } from '@/engines/kernel/clock';
import { createShellState } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { findMission } from '@/engines/lesson/missions';
import { buildContext, passes } from '@/engines/lesson/runner';
import { log as logOf, status as statusOf } from '@/engines/git/repository';

describe('dbg', () => {
  it('conflict', () => {
    const registry = createDefaultRegistry();
    const clock = createClock();
    const m = findMission('git/05/conflict')!;
    let st = createShellState(m.initial);
    const timeline = [st];
    const lines = [
      'git init',
      'git add app.txt',
      'git commit -m "base"',
      'git switch -c topic',
      String.raw`printf "line1\nTHEIRS\nline3\n" > app.txt`,
      'git add app.txt',
      'git commit -m "topic"',
      'git switch main',
      String.raw`printf "line1\nOURS\nline3\n" > app.txt`,
      'git add app.txt',
      'git commit -m "main"',
      'git merge topic',
      String.raw`printf "line1\nRESOLVED\nline3\n" > app.txt`,
      'git add app.txt',
      'git commit -m "resolve"',
    ];
    for (const line of lines) {
      const o = execute(st, line, registry, clock);
      st = o.state;
      timeline.push(st);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify([line, o.exitCode, o.chunks.map((c) => c.text).join(''), st.vfs.nodes.get('/home/learner/app.txt')]));
    }
    const ctx = buildContext(timeline);
    // eslint-disable-next-line no-console
    console.log(m.steps.map((s) => passes(s, ctx)));
    // eslint-disable-next-line no-console
    console.log('log', logOf(st.git!).length, 'clean', statusOf(st.git!, st.vfs).clean, JSON.stringify(statusOf(st.git!, st.vfs)));
    expect(1).toBe(1);
  });
});
