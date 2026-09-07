import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { createClock } from '@/engines/kernel/clock';
import { createShellState } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';
import { findMission, missions } from './missions';
import { createProgress, evaluate } from './runner';
import type { LessonDefinition } from './types';

const registry = createDefaultRegistry();

/** id で任務を引く。配列の並び順に依存させない */
function mission(id: string): LessonDefinition {
  const found = findMission(id);
  if (!found) throw new Error(`任務が見つかりません: ${id}`);
  return found;
}

/** 任務を解いてみて、実際にクリアできるかを確かめる */
function play(mission: LessonDefinition, lines: readonly string[]): boolean {
  const clock = createClock();
  const timeline: ShellState[] = [createShellState(mission.initial)];
  let progress = createProgress(mission);
  for (const line of lines) {
    const last = timeline[timeline.length - 1];
    if (!last) break;
    timeline.push(execute(last, line, registry, clock).state);
    progress = evaluate(mission, progress, timeline);
  }
  return progress.cleared;
}

describe('任務の定義', () => {
  it('id が重複しない', () => {
    const ids = missions.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('全ての手順に説明と通過条件がある', () => {
    for (const mission of missions) {
      for (const step of mission.steps) {
        expect(step.prompt.length).toBeGreaterThan(0);
        expect(step.check.length).toBeGreaterThan(0);
        expect(step.explain.length).toBeGreaterThan(0);
        expect(step.hints.length).toBeGreaterThan(0);
      }
    }
  });

  it('最初は1つも達成していない', () => {
    for (const mission of missions) {
      expect(play(mission, [])).toBe(false);
    }
  });
});

describe('模範解答で実際にクリアできる', () => {
  it('シェルに慣れる', () => {
    expect(
      play(mission('kernel/00/shell-warmup'), [
        'mkdir reports',
        'cat /etc/hosts > reports/hosts.txt',
        'grep localhost reports/hosts.txt > reports/local.txt',
      ]),
    ).toBe(true);
  });

  it('最初のコミットを刻む', () => {
    expect(
      play(mission('git/01/first-commit'), [
        'git init',
        'git add notes.md',
        'git commit -m "first"',
      ]),
    ).toBe(true);
  });

  it('ブランチを分けて統合する', () => {
    expect(
      play(mission('git/04/branch-and-merge'), [
        'git init',
        'git add .',
        'git commit -m "base"',
        'git switch -c feature',
        'echo updated > README.md',
        'git add README.md',
        'git commit -m "update readme"',
        'git switch main',
        'git merge feature',
      ]),
    ).toBe(true);
  });

  it('衝突を解く', () => {
    expect(
      play(mission('git/05/conflict'), [
        'git init',
        'git add app.txt',
        'git commit -m "base"',
        'git switch -c topic',
        'printf "line1\\nTHEIRS\\nline3\\n" > app.txt',
        'git add app.txt',
        'git commit -m "topic"',
        'git switch main',
        'printf "line1\\nOURS\\nline3\\n" > app.txt',
        'git add app.txt',
        'git commit -m "main"',
        'git merge topic',
        'printf "line1\\nRESOLVED\\nline3\\n" > app.txt',
        'git add app.txt',
        'git commit -m "resolve"',
      ]),
    ).toBe(true);
  });

  it('ディスク逼迫', () => {
    expect(
      play(mission('kernel/00/disk-full'), [
        '> /var/log/app.log',
        'rm -r /var/log/old',
        'echo "logrotate で日次 rotate する" > /srv/app/RECOVERY.md',
      ]),
    ).toBe(true);
  });
});

describe('別解でもクリアできる', () => {
  it('シェルに慣れる（パイプ版）', () => {
    expect(
      play(mission('kernel/00/shell-warmup'), [
        'mkdir -p reports',
        'cp /etc/hosts reports/hosts.txt',
        'cat reports/hosts.txt | grep localhost > reports/local.txt',
      ]),
    ).toBe(true);
  });

  it('ブランチを分けて統合する（branch と switch を分ける）', () => {
    expect(
      play(mission('git/04/branch-and-merge'), [
        'git init',
        'git add .',
        'git commit -m "base"',
        'git branch feature',
        'git switch feature',
        'echo updated > README.md',
        'git add .',
        'git commit -m "update"',
        'git switch main',
        'git merge feature',
      ]),
    ).toBe(true);
  });
});
