import { describe, expect, it } from 'vitest';
import { expandMatrix, isWorkflowError, parseWorkflow, runWorkflow, type Workflow } from './actions';
import {
  closeLinkedIssues, createProject, forkRepo, linkedIssues, moveCard, openIssue,
  ownerApprovalMissing, ownersFor, parseCodeowners,
} from './issues';
import { addReview, createRepo, openPull } from './pr';

function build(yaml: string): Workflow {
  const parsed = parseWorkflow(yaml);
  if (isWorkflowError(parsed)) throw new Error(parsed.error);
  return parsed;
}

describe('matrix', () => {
  const yaml = [
    'name: CI',
    'on: [push]',
    'jobs:',
    '  test:',
    '    strategy:',
    '      matrix:',
    '        node: ["18", "20"]',
    '        os: [ubuntu, macos]',
    '    steps:',
    '      - name: run',
    '        run: npm test --node=${{ matrix.node }}',
    '',
  ].join('\n');

  it('組み合わせに展開される', () => {
    expect(expandMatrix({ a: ['1', '2'], b: ['x', 'y'] })).toEqual([
      { a: '1', b: 'x' },
      { a: '1', b: 'y' },
      { a: '2', b: 'x' },
      { a: '2', b: 'y' },
    ]);
  });

  it('組み合わせのぶんだけ job が走る', () => {
    const runs = runWorkflow(build(yaml)).checks;
    expect(runs).toHaveLength(4);
    expect(runs.map((r) => r.name)).toContain('test (18, ubuntu)');
  });

  it('ステップの中の matrix 変数が置き換わる', () => {
    const runs = runWorkflow(build(yaml)).checks;
    expect(runs[0]?.logs.join('\n')).toContain('--node=18');
  });

  it('1つの組み合わせだけを失敗させられる', () => {
    const runs = runWorkflow(build(yaml), { failing: ['test:20'] }).checks;
    const failed = runs.filter((r) => r.status === 'failure');
    expect(failed).toHaveLength(2);
    expect(failed.every((r) => r.name.includes('20'))).toBe(true);
  });
});

describe('cache', () => {
  const yaml = [
    'name: CI',
    'on: push',
    'jobs:',
    '  build:',
    '    steps:',
    '      - uses: actions/cache@v4',
    '        with:',
    '          key: node-modules-abc',
    '      - run: npm ci',
    '',
  ].join('\n');

  it('最初は miss になり、鍵が保存される', () => {
    const result = runWorkflow(build(yaml));
    expect(result.checks[0]?.logs.join('\n')).toContain('cache miss');
    expect(result.cache).toContain('node-modules-abc');
  });

  it('鍵が入っていれば hit になる', () => {
    const result = runWorkflow(build(yaml), { cache: ['node-modules-abc'] });
    expect(result.checks[0]?.logs.join('\n')).toContain('cache hit');
  });
});

describe('artifact', () => {
  const yaml = [
    'name: CI',
    'on: push',
    'jobs:',
    '  build:',
    '    steps:',
    '      - uses: actions/upload-artifact@v4',
    '        with:',
    '          name: dist',
    '  deploy:',
    '    needs: build',
    '    steps:',
    '      - uses: actions/download-artifact@v4',
    '        with:',
    '          name: dist',
    '',
  ].join('\n');

  it('上げた job から下げた job へ渡る', () => {
    const result = runWorkflow(build(yaml));
    expect(result.artifacts['dist']).toBe('build');
    expect(result.checks[1]?.status).toBe('success');
    expect(result.checks[1]?.logs.join('\n')).toContain('build が保存したもの');
  });

  it('上げていない名前は取れない', () => {
    const missing = yaml.replace('name: dist\n  deploy', 'name: other\n  deploy');
    const result = runWorkflow(build(missing.replace('          name: dist', '          name: nope')));
    expect(result.checks.some((c) => c.status === 'failure')).toBe(true);
  });
});

describe('secrets', () => {
  const yaml = [
    'name: Deploy',
    'on: push',
    'jobs:',
    '  deploy:',
    '    steps:',
    '      - run: deploy --token=${{ secrets.DEPLOY_TOKEN }}',
    '',
  ].join('\n');

  it('未設定なら失敗し、名前が出る', () => {
    const result = runWorkflow(build(yaml));
    expect(result.checks[0]?.status).toBe('failure');
    expect(result.checks[0]?.logs.join('\n')).toContain('DEPLOY_TOKEN');
  });

  it('設定してあれば通り、値はログに出ない', () => {
    const result = runWorkflow(build(yaml), { secrets: { DEPLOY_TOKEN: 'super-secret' } });
    expect(result.checks[0]?.status).toBe('success');
    const logs = result.checks[0]?.logs.join('\n') ?? '';
    expect(logs).not.toContain('super-secret');
    expect(logs).toContain('***');
  });
});

describe('再利用可能ワークフロー', () => {
  const shared = [
    'name: Shared',
    'on: workflow_call',
    'jobs:',
    '  build:',
    '    steps:',
    '      - run: npm run build',
    '',
  ].join('\n');
  const caller = [
    'name: CI',
    'on: push',
    'jobs:',
    '  call:',
    '    uses: ./.github/workflows/shared.yml',
    '',
  ].join('\n');

  it('呼び出し先の job が走る', () => {
    const result = runWorkflow(build(caller), {
      library: { './.github/workflows/shared.yml': shared },
    });
    expect(result.checks[0]?.status).toBe('success');
    expect(result.checks[0]?.logs.join('\n')).toContain('build: success');
  });

  it('呼び出し先が無ければ失敗する', () => {
    const result = runWorkflow(build(caller));
    expect(result.checks[0]?.status).toBe('failure');
    expect(result.checks[0]?.logs.join('\n')).toContain('見つかりません');
  });
});

describe('failure() 条件', () => {
  const yaml = [
    'name: CI',
    'on: push',
    'jobs:',
    '  build:',
    '    steps:',
    '      - run: npm run build',
    '  notify:',
    '    needs: build',
    '    if: failure()',
    '    steps:',
    '      - run: notify',
    '',
  ].join('\n');

  it('成功したときは走らない', () => {
    const runs = runWorkflow(build(yaml)).checks;
    expect(runs.find((r) => r.name === 'notify')?.status).toBe('skipped');
  });

  it('失敗したときだけ走る', () => {
    const runs = runWorkflow(build(yaml), { failing: ['build'] }).checks;
    expect(runs.find((r) => r.name === 'notify')?.status).toBe('success');
  });
});

describe('Issue', () => {
  it('番号が1から振られる', () => {
    const first = openIssue(createRepo('acme', 'app'), { title: 'バグ' });
    expect(first.issue.number).toBe(1);
    expect(openIssue(first.repo, { title: '2つ目' }).issue.number).toBe(2);
  });

  it('本文から閉じるべき Issue を読める', () => {
    expect(linkedIssues('Closes #12 and fixes #7')).toEqual([7, 12]);
    expect(linkedIssues('関連: #3')).toEqual([]);
  });

  it('マージすると紐付いた Issue が閉じる', () => {
    let repo = createRepo('acme', 'app');
    repo = openIssue(repo, { title: 'バグ' }).repo;
    const opened = openPull(repo, { title: '直した', head: 'fix', body: 'Closes #1' });
    const merged = closeLinkedIssues(opened.repo, opened.pull.number, 'Closes #1');
    expect(merged.issues[0]?.state).toBe('closed');
    expect(merged.issues[0]?.closedBy).toBe(opened.pull.number);
  });
});

describe('Projects', () => {
  it('列の間でカードを動かせる', () => {
    let repo = createProject(createRepo('acme', 'app'), 'Board', ['Todo', 'Doing', 'Done']);
    repo = openIssue(repo, { title: 'やること' }).repo;
    const moved = moveCard(repo, 'Board', 1, 'Doing');
    expect('error' in moved).toBe(false);
    if ('error' in moved) return;
    expect(moved.projects[0]?.columns.find((c) => c.name === 'Doing')?.items).toEqual([1]);

    const done = moveCard(moved, 'Board', 1, 'Done');
    if ('error' in done) return;
    expect(done.projects[0]?.columns.find((c) => c.name === 'Doing')?.items).toEqual([]);
    expect(done.projects[0]?.columns.find((c) => c.name === 'Done')?.items).toEqual([1]);
  });

  it('無い列へは動かせない', () => {
    const repo = createProject(createRepo('acme', 'app'), 'Board', ['Todo']);
    expect(moveCard(repo, 'Board', 1, 'Nope')).toHaveProperty('error');
  });
});

describe('CODEOWNERS', () => {
  const rules = parseCodeowners(
    [
      '# 既定の所有者',
      '*       @core',
      '/docs/  @writers',
      '*.sql   @dba',
      '',
    ].join('\n'),
  );

  it('コメントと空行を飛ばして読む', () => {
    expect(rules).toHaveLength(3);
  });

  it('後の行が前の行に勝つ', () => {
    expect(ownersFor(rules, ['docs/guide.md'])).toEqual(['@writers']);
    expect(ownersFor(rules, ['src/app.ts'])).toEqual(['@core']);
    expect(ownersFor(rules, ['db/schema.sql'])).toEqual(['@dba']);
  });

  it('複数のパスなら所有者も合わさる', () => {
    expect(ownersFor(rules, ['docs/a.md', 'db/b.sql'])).toEqual(['@dba', '@writers']);
  });

  it('所有者の承認が足りなければ名前が出る', () => {
    let repo = { ...createRepo('acme', 'app'), codeowners: rules };
    const opened = openPull(repo, { title: 'docs 更新', head: 'docs', author: 'learner' });
    repo = opened.repo;
    expect(ownerApprovalMissing(repo, 1, ['docs/guide.md'])).toEqual(['@writers']);

    const reviewed = addReview(repo, 1, { reviewer: 'writers', state: 'approved', body: '' });
    if ('error' in reviewed) return;
    expect(ownerApprovalMissing(reviewed, 1, ['docs/guide.md'])).toEqual([]);
  });
});

describe('fork', () => {
  it('fork 側は空の Pull Request 一覧を持ち、元を指す', () => {
    const origin = openPull(createRepo('acme', 'app'), { title: '既存', head: 'x' }).repo;
    const { origin: after, fork } = forkRepo(origin, 'learner');
    expect(fork.owner).toBe('learner');
    expect(fork.pulls).toHaveLength(0);
    expect(fork.upstream).toEqual({ owner: 'acme', name: 'app' });
    expect(after.forks).toEqual([{ owner: 'learner', name: 'app' }]);
  });
});
