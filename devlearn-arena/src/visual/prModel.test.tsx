import { describe, expect, it, vi } from 'vitest';
import { addReview, createRepo, findPull, openPull, setChecks } from '@/engines/github/pr';
import type { CheckRun, Repo } from '@/engines/github/types';
import { click, mount } from './mountForTest';
import { jobDag, prTimeline } from './prModel';
import { PrTimeline } from './PrTimeline';

const run = (name: string, status: CheckRun['status'], needs: string[] = []): CheckRun => ({ name, status, needs, logs: [] });

/** build が失敗し、その下流の test と deploy が走れなかった状態 */
const FAILED: CheckRun[] = [
  run('build', 'failure'),
  run('lint', 'success'),
  run('test (18)', 'skipped', ['build']),
  run('test (20)', 'skipped', ['build']),
  run('deploy', 'skipped', ['test']),
];

function repoWith(checks: CheckRun[]): Repo {
  const opened = openPull(createRepo('acme', 'app'), { title: 'feat', head: 'feature' }).repo;
  return setChecks(opened, 1, checks);
}

function pullOf(repo: Repo) {
  const pull = findPull(repo, 1);
  if (!pull) throw new Error('PR がありません');
  return pull;
}

describe('Actions のジョブの DAG', () => {
  it('依存の深さで左から列に並べ、依存を矢印で結ぶ（matrix の名前も結ぶ）', () => {
    const dag = jobDag(FAILED);
    const col = (name: string) => dag.jobs.find((j) => j.check.name === name)?.col;
    expect(col('build')).toBe(0);
    expect(col('lint')).toBe(0);
    expect(col('test (18)')).toBe(1);
    expect(col('deploy')).toBe(2);
    expect(dag.edges).toContainEqual({ from: 'build', to: 'test (18)' });
    expect(dag.edges).toContainEqual({ from: 'test (20)', to: 'deploy' });
  });

  it('失敗の下流すべてに × を伝える。関係ないジョブには付けない', () => {
    const blocked = jobDag(FAILED).jobs.filter((j) => j.blocked).map((j) => j.check.name);
    expect(blocked.sort()).toEqual(['deploy', 'test (18)', 'test (20)']);
  });

  it('全部通れば × は無い', () => {
    expect(jobDag([run('build', 'success'), run('test', 'success', ['build'])]).jobs.some((j) => j.blocked)).toBe(false);
  });
});

describe('Pull Request のタイムライン', () => {
  it('作成 → レビュー → チェック → マージ の順に、それぞれの状態を出す', () => {
    const repo = repoWith(FAILED);
    const stages = prTimeline(repo, pullOf(repo));
    expect(stages.map((s) => s.id)).toEqual(['created', 'review', 'checks', 'merge']);
    expect(stages.map((s) => s.state)).toEqual(['done', 'waiting', 'bad', 'active']);
  });

  it('承認されてチェックが通れば、レビューとチェックが済みになる', () => {
    const base = repoWith([run('build', 'success')]);
    const reviewed = addReview(base, 1, { reviewer: 'alice', state: 'approved', body: '' });
    if ('error' in reviewed) throw new Error(reviewed.error);
    const stages = prTimeline(reviewed, pullOf(reviewed));
    expect(stages.find((s) => s.id === 'review')?.state).toBe('done');
    expect(stages.find((s) => s.id === 'checks')?.state).toBe('done');
  });
});

describe('Pull Request の図', () => {
  it('ジョブを色と印で描き、失敗の下流に × を描く', () => {
    const view = mount(<PrTimeline repo={repoWith(FAILED)} />);
    expect(view.querySelector('[data-job="build"]')?.getAttribute('data-status')).toBe('failure');
    expect(view.querySelectorAll('[data-cross="true"]').length).toBe(3);
    expect(view.querySelectorAll('path[data-dag-edge]').length).toBe(4);
  });

  it('レビューの段を押すと承認、チェックの段を押すと gh pr checks が端末に流れる', () => {
    const onCommand = vi.fn();
    const view = mount(<PrTimeline repo={repoWith(FAILED)} onCommand={onCommand} />);
    click(view, '[data-stage="review"]');
    expect(onCommand).toHaveBeenLastCalledWith('gh pr review 1 --approve');
    click(view, '[data-stage="checks"]');
    expect(onCommand).toHaveBeenLastCalledWith('gh pr checks 1');
    click(view, '[data-job="build"]');
    expect(onCommand).toHaveBeenLastCalledWith('gh pr checks 1');
  });
});
