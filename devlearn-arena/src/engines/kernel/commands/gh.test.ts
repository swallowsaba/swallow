import { beforeEach, describe, expect, it } from 'vitest';
import { createRepo } from '@/engines/github/pr';
import { createSession, type Session } from '../session';
import { execute } from '../shell';

const WORKFLOW = `name: CI
on:
  push:
  pull_request:
jobs:
  lint:
    name: Lint
    steps:
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
`;

let session: Session;

beforeEach(() => {
  session = createSession({
    repo: createRepo('acme', 'app'),
    files: {
      '/home/learner': null,
      '/home/learner/.github/workflows/ci.yml': WORKFLOW,
    },
  });
});

function run(line: string): { out: string; err: string; code: number } {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  const pick = (s: 'stdout' | 'stderr') =>
    outcome.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
  return { out: pick('stdout'), err: pick('stderr'), code: outcome.exitCode };
}

describe('リポジトリが無い場合', () => {
  it('その旨を伝える', () => {
    session = createSession();
    expect(run('gh pr list').code).toBe(1);
  });
});

describe('Pull Request', () => {
  it('作ると URL が返る', () => {
    expect(run('gh pr create -t "機能追加" -b feature').out).toContain('/pull/1');
  });

  it('一覧に出る', () => {
    run('gh pr create -t "機能追加" -b feature');
    expect(run('gh pr list').out).toContain('#1');
  });

  it('無い番号は断る', () => {
    expect(run('gh pr view 99').code).toBe(1);
  });

  it('view に状態がまとまって出る', () => {
    run('gh pr create -t "機能追加" -b feature');
    const out = run('gh pr view 1').out;
    expect(out).toContain('#1 機能追加');
    expect(out).toContain('feature → main');
    expect(out).toContain('マージできます');
  });
});

describe('ワークフロー', () => {
  it('読み取った内容と依存が出る', () => {
    const out = run('gh workflow').out;
    expect(out).toContain('name: CI');
    expect(out).toContain('build (Build) ← lint, test');
  });

  it('checks で全部成功する', () => {
    run('gh pr create -t x -b feature');
    const out = run('gh pr checks 1').out;
    expect(out).toContain('✓ Lint (success)');
    expect(out).toContain('✓ Build (success)');
  });

  it('失敗させると下流が飛ばされる', () => {
    run('gh pr create -t x -b feature');
    const out = run('gh pr checks 1 --fail=lint').out;
    expect(out).toContain('✗ Lint (failure)');
    expect(out).toContain('− Build (skipped)');
    expect(out).toContain('依存するジョブが成功しなかった');
  });
});

describe('保護ルール', () => {
  beforeEach(() => {
    run('gh pr create -t x -b feature');
  });

  it('承認が無ければマージできない', () => {
    run('gh protect main --approvals=1');
    const r = run('gh pr merge 1');
    expect(r.code).toBe(1);
    expect(r.err).toContain('承認が足りません');
  });

  it('承認すればマージできる', () => {
    run('gh protect main --approvals=1');
    run('gh pr review 1 --approve -r mentor');
    expect(run('gh pr merge 1').out).toContain('マージしました');
  });

  it('変更要求があれば止まる', () => {
    run('gh protect main --approvals=0');
    run('gh pr review 1 --request-changes -r mentor');
    expect(run('gh pr merge 1').err).toContain('変更を要求');
  });

  it('必須チェックが失敗していれば止まる', () => {
    run('gh protect main --approvals=0 --checks=Build');
    run('gh pr checks 1 --fail=lint');
    expect(run('gh pr merge 1').err).toContain('通っていません');
  });

  it('チェックを通せばマージできる', () => {
    run('gh protect main --approvals=0 --checks=Build');
    run('gh pr checks 1');
    expect(run('gh pr merge 1').out).toContain('マージしました');
  });

  it('理由はまとめて出る', () => {
    run('gh protect main --approvals=2 --checks=Build');
    expect(run('gh pr merge 1').err.split('\n').filter((l) => l !== '')).toHaveLength(2);
  });
});

describe('マージ戦略', () => {
  beforeEach(() => {
    run('gh pr create -t x -b feature');
  });

  it('merge は履歴が増える', () => {
    expect(run('gh pr merge 1 --commits=3').out).toContain('増えるコミット: 4');
  });

  it('squash は 1 つになる', () => {
    expect(run('gh pr merge 1 --squash --commits=3').out).toContain('増えるコミット: 1');
  });

  it('rebase はマージコミットを作らない', () => {
    expect(run('gh pr merge 1 --rebase --commits=3').out).toContain('増えるコミット: 3');
  });

  it('二度はマージできない', () => {
    run('gh pr merge 1');
    expect(run('gh pr merge 1').code).toBe(1);
  });
});
