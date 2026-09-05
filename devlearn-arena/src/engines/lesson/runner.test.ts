import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { createClock } from '@/engines/kernel/clock';
import type { ShellState } from '@/engines/kernel/registry';
import { createShellState } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { shellWarmup } from './missions';
import { advance, createProgress, currentStep, useHint } from './runner';

const registry = createDefaultRegistry();
const clock = createClock();
let timeline: ShellState[];

beforeEach(() => {
  timeline = [createShellState(shellWarmup.initial)];
});

function run(line: string) {
  const last = timeline[timeline.length - 1];
  if (!last) throw new Error('empty');
  timeline.push(execute(last, line, registry, clock).state);
}

describe('レッスンランナー', () => {
  it('最初は手順0で未クリア', () => {
    const p = createProgress();
    expect(p.stepIndex).toBe(0);
    expect(currentStep(shellWarmup, p)?.prompt).toContain('reports');
  });

  it('条件を満たすと次の手順へ進む', () => {
    let p = createProgress();
    run('mkdir reports');
    p = advance(shellWarmup, p, timeline);
    expect(p.stepIndex).toBe(1);
    expect(p.cleared).toBe(false);
  });

  it('関係ないコマンドでは進まない', () => {
    let p = createProgress();
    run('echo hello');
    p = advance(shellWarmup, p, timeline);
    expect(p.stepIndex).toBe(0);
    expect(p.commandsUsed).toBe(1);
  });

  it('別解でもクリアできる（パイプ版）', () => {
    let p = createProgress();
    for (const line of [
      'mkdir reports',
      'cat /etc/hosts > reports/hosts.txt',
      'cat reports/hosts.txt | grep localhost > reports/local.txt',
    ]) {
      run(line);
      p = advance(shellWarmup, p, timeline);
    }
    expect(p.cleared).toBe(true);
  });

  it('1コマンドで複数手順を満たしても正しく進む', () => {
    let p = createProgress();
    run('mkdir reports && cat /etc/hosts > reports/hosts.txt');
    p = advance(shellWarmup, p, timeline);
    expect(p.stepIndex).toBe(2);
  });

  it('assert が例外を投げても落ちない', () => {
    const broken = {
      ...shellWarmup,
      steps: [{ prompt: 'x', hints: [], explain: '', assert: () => { throw new Error('boom'); } }],
    };
    let p = createProgress();
    run('echo hi');
    p = advance(broken, p, timeline);
    expect(p.cleared).toBe(false);
  });

  it('ヒント使用を数える', () => {
    expect(useHint(createProgress()).hintsUsed).toBe(1);
  });
});
