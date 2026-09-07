import { describe, expect, it } from 'vitest';
import { parseWorkflow, runWorkflow, type Workflow } from './actions';
import { addReview, canMerge, createRepo, mergePull, openPull, setChecks } from './pr';
import type { Repo } from './types';

const yaml = `
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  lint:
    name: Lint
    steps:
      - name: checkout
      - name: run eslint
        run: npm run lint
  test:
    name: Test
    steps:
      - name: run vitest
        run: npm test
  build:
    name: Build
    needs: [lint, test]
    steps:
      - name: build
        run: npm run build
  notify:
    name: Notify
    needs: build
    if: always()
    steps:
      - name: send
`;

describe('ワークフローの読み取り', () => {
  it('名前とトリガを読む', () => {
    const parsed = parseWorkflow(yaml);
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.name).toBe('CI');
    expect(parsed.on).toContain('push');
    expect(parsed.on).toContain('pull_request');
  });

  it('ジョブと依存を読む', () => {
    const parsed = parseWorkflow(yaml) as Workflow;
    expect(parsed.jobs.map((j) => j.id)).toEqual(['lint', 'test', 'build', 'notify']);
    expect(parsed.jobs.find((j) => j.id === 'build')?.needs).toEqual(['lint', 'test']);
    expect(parsed.jobs.find((j) => j.id === 'notify')?.needs).toEqual(['build']);
  });

  it('steps を読む', () => {
    const parsed = parseWorkflow(yaml) as Workflow;
    const lint = parsed.jobs.find((j) => j.id === 'lint');
    expect(lint?.steps).toHaveLength(2);
    expect(lint?.steps[1]?.run).toBe('npm run lint');
  });

  it('if 条件を読む', () => {
    const parsed = parseWorkflow(yaml) as Workflow;
    expect(parsed.jobs.find((j) => j.id === 'notify')?.condition).toBe('always()');
  });

  it('jobs が無ければエラー', () => {
    expect(parseWorkflow('name: x\non: push\n')).toEqual({ error: 'jobs がありません' });
  });
});

describe('ジョブの実行', () => {
  const workflow = parseWorkflow(yaml) as Workflow;

  it('依存順に並ぶ', () => {
    const runs = runWorkflow(workflow);
    const names = runs.map((r) => r.name);
    expect(names.indexOf('Build')).toBeGreaterThan(names.indexOf('Lint'));
    expect(names.indexOf('Build')).toBeGreaterThan(names.indexOf('Test'));
  });

  it('全部成功する', () => {
    expect(runWorkflow(workflow).every((r) => r.status === 'success')).toBe(true);
  });

  it('失敗すると下流が skipped になる', () => {
    const runs = runWorkflow(workflow, { failing: ['lint'] });
    const byName = new Map(runs.map((r) => [r.name, r.status]));
    expect(byName.get('Lint')).toBe('failure');
    expect(byName.get('Test')).toBe('success');
    expect(byName.get('Build')).toBe('skipped');
  });

  it('always() が付いたジョブは下流でも実行される', () => {
    const runs = runWorkflow(workflow, { failing: ['lint'] });
    expect(runs.find((r) => r.name === 'Notify')?.status).toBe('success');
  });

  it('失敗したジョブのログに位置が出る', () => {
    const runs = runWorkflow(workflow, { failing: ['test'] });
    expect(runs.find((r) => r.name === 'Test')?.logs.join('\n')).toContain('ここで失敗');
  });
});

describe('Pull Request', () => {
  function withPull(): { repo: Repo; number: number } {
    const base = createRepo('acme', 'app');
    const opened = openPull(base, { title: '機能を足す', head: 'feature', author: 'learner' });
    return { repo: opened.repo, number: opened.pull.number };
  }

  it('番号が 1 から振られる', () => {
    expect(withPull().number).toBe(1);
  });

  it('保護が無ければマージできる', () => {
    const { repo, number } = withPull();
    expect(canMerge(repo, number).ok).toBe(true);
  });

  it('承認が足りなければ止まる', () => {
    const { repo, number } = withPull();
    const guarded: Repo = {
      ...repo,
      protections: [{ branch: 'main', requiredApprovals: 1, requiredChecks: [], blockDirectPush: true }],
    };
    const result = canMerge(guarded, number);
    expect(result.ok).toBe(false);
    expect(result.reasons[0]).toContain('承認が足りません');
  });

  it('承認すれば通る', () => {
    const { repo, number } = withPull();
    const guarded: Repo = {
      ...repo,
      protections: [{ branch: 'main', requiredApprovals: 1, requiredChecks: [], blockDirectPush: true }],
    };
    const reviewed = addReview(guarded, number, { reviewer: 'mentor', state: 'approved', body: 'ok' });
    expect('error' in reviewed).toBe(false);
    if ('error' in reviewed) return;
    expect(canMerge(reviewed, number).ok).toBe(true);
  });

  it('自分では承認できない', () => {
    const { repo, number } = withPull();
    const result = addReview(repo, number, { reviewer: 'learner', state: 'approved', body: '' });
    expect('error' in result).toBe(true);
  });

  it('変更要求があれば止まる', () => {
    const { repo, number } = withPull();
    const guarded: Repo = {
      ...repo,
      protections: [{ branch: 'main', requiredApprovals: 0, requiredChecks: [], blockDirectPush: true }],
    };
    const reviewed = addReview(guarded, number, {
      reviewer: 'mentor',
      state: 'changes_requested',
      body: 'ここを直して',
    }) as Repo;
    expect(canMerge(reviewed, number).reasons[0]).toContain('変更を要求');
  });

  it('必須チェックが通っていなければ止まる', () => {
    const { repo, number } = withPull();
    const guarded: Repo = {
      ...repo,
      protections: [{ branch: 'main', requiredApprovals: 0, requiredChecks: ['Build'], blockDirectPush: true }],
    };
    const withChecks = setChecks(guarded, number, [
      { name: 'Build', status: 'failure', needs: [], logs: [] },
    ]);
    expect(canMerge(withChecks, number).reasons[0]).toContain('通っていません');
  });

  it('理由はまとめて返す', () => {
    const { repo, number } = withPull();
    const guarded: Repo = {
      ...repo,
      protections: [{ branch: 'main', requiredApprovals: 2, requiredChecks: ['Build'], blockDirectPush: true }],
    };
    expect(canMerge(guarded, number).reasons).toHaveLength(2);
  });
});

describe('マージ戦略で履歴の形が変わる', () => {
  function base(): { repo: Repo; number: number } {
    const repo = createRepo('acme', 'app');
    const opened = openPull(repo, { title: 'x', head: 'feature' });
    return { repo: opened.repo, number: opened.pull.number };
  }

  it('merge は元のコミット＋マージコミット', () => {
    const { repo, number } = base();
    expect(mergePull(repo, number, 'merge', 3).commitsAdded).toBe(4);
  });

  it('squash は 1 つにまとまる', () => {
    const { repo, number } = base();
    expect(mergePull(repo, number, 'squash', 3).commitsAdded).toBe(1);
  });

  it('rebase はマージコミットを作らない', () => {
    const { repo, number } = base();
    expect(mergePull(repo, number, 'rebase', 3).commitsAdded).toBe(3);
  });

  it('マージすると状態が変わる', () => {
    const { repo, number } = base();
    const result = mergePull(repo, number, 'squash', 2);
    expect(result.repo.pulls[0]?.state).toBe('merged');
  });

  it('条件を満たさなければマージできない', () => {
    const { repo, number } = base();
    const guarded: Repo = {
      ...repo,
      protections: [{ branch: 'main', requiredApprovals: 1, requiredChecks: [], blockDirectPush: true }],
    };
    expect(mergePull(guarded, number, 'merge', 1).error).toContain('承認');
  });
});
