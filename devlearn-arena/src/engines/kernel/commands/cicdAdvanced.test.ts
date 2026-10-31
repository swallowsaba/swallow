import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { checkState } from '@/learning/practice';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from './index';

/** cicd の上級の実戦で使う模擬: デプロイ戦略（cicd.a.01）・キャッシュ（cicd.a.02）・品質の門（cicd.a.03） */

const registry = createDefaultRegistry();
const clock = createClock();

function session(environment: string, setup: unknown) {
  let shell: ShellState = initialShell(environment, setup);
  return {
    run(line: string) {
      const o = execute(shell, line, registry, clock);
      shell = o.state;
      const pick = (s: string) => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
    ci: (expr: string) => checkState({ kind: 'ci', expr }, { shell }),
    k8s: (expr: string) => checkState({ kind: 'k8s', expr }, { shell }),
    git: (expr: string) => checkState({ kind: 'git', expr }, { shell }),
  };
}

const URL = 'https://git.city.example/city/shop.git';
const job = (name: string, script: string, extra = ''): string => `  ${name}:\n    runs-on: ubuntu-latest\n${extra}    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm run ${script}\n`;
const flow = (body: string): string => `name: ci\non:\n  push:\n    branches: [main]\njobs:\n${body}`;
const cacheStep = (key: string): string => `      - uses: actions/cache@v4\n        with:\n          path: ~/.npm\n          key: ${key}\n`;
const cachedJob = (name: string, script: string, key: string): string => `  ${name}:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n${cacheStep(key)}      - run: npm ci\n      - run: npm run ${script}\n`;

const pipeline = (workflow: string) => ({
  hostname: 'dev', cwd: '/home/learner/shop', dirs: ['/home/learner/shop/.github/workflows'], sites: [],
  files: {
    '/home/learner/shop/package.json': `${JSON.stringify({ name: 'shop', version: '1.0.0', scripts: { lint: 'eslint .', unit: 'vitest run', e2e: 'playwright test' } })}\n`,
    '/home/learner/shop/package-lock.json': `${JSON.stringify({ packages: { '': { name: 'shop' } } })}\n`,
    '/home/learner/shop/.github/workflows/ci.yml': workflow,
  },
  run: ["export __NOW='2026-10-15 09:00'", 'git init -q', `git remote add origin ${URL}`, 'git add .', "git commit -q -m 'first'"],
  gitServers: [{
    url: URL, run: [],
    forge: {
      repo: 'city/shop',
      actions: {
        installSeconds: 240, cachedInstallSeconds: 30,
        scripts: { lint: { kind: 'test', seconds: 60, log: ['ok'] }, unit: { kind: 'test', seconds: 120, log: ['ok'] }, e2e: { kind: 'test', seconds: 300, log: ['ok'] } },
      },
    },
  }],
});

describe('並行とキャッシュ（cicd.a.02）', () => {
  it('needs の鎖は合計の時間、並行は一番長い job の時間', () => {
    const chain = session('linux-basic', pipeline(flow(job('lint', 'lint') + job('unit', 'unit', '    needs: lint\n') + job('e2e', 'e2e', '    needs: unit\n'))));
    chain.run('git push -q origin main');
    expect(chain.ci('head run=success elapsed<=20m')).toBe(true);
    expect(chain.ci('elapsed<=19m')).toBe(false);
    const par = session('linux-basic', pipeline(flow(job('lint', 'lint') + job('unit', 'unit') + job('e2e', 'e2e'))));
    par.run('git push -q origin main');
    expect(par.ci('head run=success elapsed<=9m')).toBe(true);
    expect(par.ci('elapsed<=8m')).toBe(false);
  });

  it('初めの実行はキャッシュが無く、次の実行で当たって npm ci が短くなる', () => {
    const key = "npm-${{ hashFiles('package-lock.json') }}";
    const s = session('linux-basic', pipeline(flow(cachedJob('lint', 'lint', key) + cachedJob('unit', 'unit', key) + cachedJob('e2e', 'e2e', key))));
    s.run('git push -q origin main');
    expect(s.ci('elapsed<=8m')).toBe(false);
    expect(s.run('gh run view --log').out).toContain('Cache not found for input keys: npm-');
    s.run("git commit -q --allow-empty -m 'again'");
    s.run('git push -q origin main');
    expect(s.ci('head run=success elapsed<=8m has:e2e/actions/cache')).toBe(true);
    expect(s.run('gh run view --log').out).toContain('Cache restored from key: npm-');
  });

  it('鍵に毎回変わる物（github.sha）を入れると、いつまでも当たらない', () => {
    const key = 'npm-${{ github.sha }}';
    const s = session('linux-basic', pipeline(flow(cachedJob('e2e', 'e2e', key))));
    s.run('git push -q origin main');
    s.run("git commit -q --allow-empty -m 'again'");
    s.run('git push -q origin main');
    expect(s.ci('elapsed<=6m')).toBe(false);
    expect(s.run('gh run view --log').out).toContain('Cache not found');
  });

  it('setup-node の cache: npm でも当たる', () => {
    const body = "  e2e:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n          cache: npm\n      - run: npm ci\n      - run: npm run e2e\n";
    const s = session('linux-basic', pipeline(flow(body)));
    s.run('git push -q origin main');
    s.run("git commit -q --allow-empty -m 'again'");
    s.run('git push -q origin main');
    expect(s.ci('head run=success elapsed<=6m')).toBe(true);
  });
});

describe('git commit --allow-empty', () => {
  it('変更が無くても記録を作る。無ければ本物と同じく何も作らない', () => {
    const s = session('linux-basic', pipeline(flow(job('lint', 'lint'))));
    expect(s.run("git commit -m 'none'").code).toBe(1);
    const before = s.run('git log --oneline').out.trim().split('\n').length;
    expect(s.run("git commit --allow-empty -m 'empty'").code).toBe(0);
    expect(s.run('git log --oneline').out.trim().split('\n').length).toBe(before + 1);
  });
});

const app = (name: string, labels: string, image: string, replicas: number): string => `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${name}\nspec:\n  replicas: ${String(replicas)}\n  selector:\n    matchLabels:\n${labels.split(',').map((l) => `      ${l.replace('=', ': ')}`).join('\n')}\n  template:\n    metadata:\n      labels:\n${labels.split(',').map((l) => `        ${l.replace('=', ': ')}`).join('\n')}\n    spec:\n      containers:\n      - name: web\n        image: ${image}\n        ports:\n        - containerPort: 80\n`;
const svc = (name: string, labels: string): string => `apiVersion: v1\nkind: Service\nmetadata:\n  name: ${name}\nspec:\n  selector:\n${labels.split(',').map((l) => `    ${l.replace('=', ': ')}`).join('\n')}\n  ports:\n  - port: 80\n`;

describe('Service の札（cicd.a.01）', () => {
  const cluster = { cluster: { nodes: 3, ageDays: 3, manifests: [app('blue', 'app=shop,color=blue', 'city-shop:1.0', 3), app('green', 'app=shop,color=green', 'city-shop:1.1', 3), svc('shop', 'app=shop,color=blue')].join('---\n') } };

  it('kubectl set selector は札をコンマで並べて受け、判定の selector で確かめられる', () => {
    const s = session('k8s-cluster', cluster);
    expect(s.k8s('service/shop selector.color=blue')).toBe(true);
    expect(s.run('kubectl set selector service shop app=shop,color=green').code).toBe(0);
    expect(s.k8s('service/shop selector.color=green')).toBe(true);
    expect(s.k8s('service/shop selector.color=blue')).toBe(false);
  });
});

describe('品質の門（cicd.a.03）', () => {
  const forge = {
    hostname: 'dev', cwd: '/home/learner/shop', dirs: ['/home/learner/shop'], sites: [],
    files: { '/home/learner/shop/a.txt': 'ok\n' },
    run: ['git init -q', `git remote add origin ${URL}`, 'git add .', "git commit -q -m 'first'", 'git push -q -u origin main'],
    gitServers: [{ url: URL, run: [], forge: { repo: 'city/shop' } }],
  };

  it('enforce_admins と null の項目を読む', () => {
    const s = session('linux-basic', forge);
    s.run(`echo '{"required_status_checks":null,"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null}' > p.json`);
    expect(s.run('gh api -X PUT repos/city/shop/branches/main/protection --input p.json').code).toBe(0);
    expect(s.git('protected:main')).toBe(true);
    expect(s.git('protected-admins:main')).toBe(false);
    expect(s.git('protected-approvals:main>=1')).toBe(false);
    s.run(`echo '{"required_status_checks":{"strict":true,"contexts":["test"]},"enforce_admins":true,"required_pull_request_reviews":{"required_approving_review_count":1},"restrictions":null}' > p.json`);
    s.run('gh api -X PUT repos/city/shop/branches/main/protection --input p.json');
    expect(s.git('protected-admins:main')).toBe(true);
    expect(s.git('protected-checks:main=test')).toBe(true);
  });
});
