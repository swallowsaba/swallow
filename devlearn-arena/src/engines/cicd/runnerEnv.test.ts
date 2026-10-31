import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import type { ShellState } from '@/engines/kernel/registry';
import { execute } from '@/engines/kernel/shell';
import { ciHolds } from './check';

/** runner の指定（runs-on のラベル・網）・Secrets（実行時にだけ渡す・ログでは伏せる）・承認の要る環境（cicd.i.01・i.03・i.05） */

const URL = 'https://git.city.example/city/reserve.git';
const REPO = '/home/learner/reserve';
const TOKEN = 'tok-3f9a1c';
const PKG = JSON.stringify({ name: 'reserve-site', version: '1.5.0', scripts: { deploy: 'rsync -av dist/ deploy@reserve.example:/srv/reserve/', 'deploy:staging': 'rsync -av dist/ deploy@staging.example:/srv/reserve/' } });

function machine(workflow: string) {
  let shell: ShellState = initialShell('linux-basic', {
    cwd: REPO,
    dirs: [`${REPO}/dist`, `${REPO}/.github/workflows`],
    sites: [],
    files: { [`${REPO}/package.json`]: PKG, [`${REPO}/dist/server.js`]: 'ok\n', [`${REPO}/.github/workflows/ci.yml`]: workflow },
    run: ["export __NOW='2026-10-15 09:00'", 'git init -q', `git remote add origin ${URL}`, 'git add .', "git commit -q -m '1.5.0'"],
    gitServers: [{
      url: URL,
      run: [],
      forge: {
        repo: 'city/reserve',
        actions: {
          secrets: { DEPLOY_TOKEN: TOKEN },
          runners: [{ labels: ['self-hosted', 'city-net'], network: 'city' }],
          environments: { production: { reviewers: ['kato'] } },
          scripts: {
            deploy: { kind: 'deploy', site: 'reserve.example', log: ['switched to {version}'], token: { env: 'DEPLOY_TOKEN', secret: 'DEPLOY_TOKEN', log: ['rsync: auth failed: 401 Unauthorized (token is empty or wrong)'], code: 5 } },
            'deploy:staging': { kind: 'deploy', site: 'staging.example', log: ['staged {version}'] },
          },
          sites: [
            { host: 'reserve.example', releases: [{ version: '1.4.0', files: {} }], current: '1.4.0', routes: { '/': { status: 200, body: '版 {version}' } } },
            { host: 'staging.example', releases: [{ version: '1.4.0', files: {} }], current: '1.4.0', routes: { '/': { status: 200, body: '版 {version}' } } },
            { host: 'intra.city.example', network: 'city', chain: [{ id: 'leaf', subject: 'intra.city.example', issuer: 'Minato Issuing CA', sans: ['intra.city.example'], notBefore: '2026-01-01', notAfter: '2027-01-01', ca: false }, { id: 'inter', subject: 'Minato Issuing CA', issuer: 'Minato Root CA', sans: [], notBefore: '2024-01-01', notAfter: '2030-01-01', ca: true }], releases: [{ version: '1.0.0', files: {} }], current: '1.0.0', routes: { '/health': { status: 200, body: 'ok' } } },
          ],
        },
      },
    }],
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string): { out: string; err: string; code: number } => {
    const o = execute(shell, line, registry, clock);
    shell = o.state;
    const pick = (s: 'stdout' | 'stderr'): string => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
  };
  return { run, holds: (expr: string): boolean => ciHolds(shell, expr) };
}

const flow = (jobs: string): string => `name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\njobs:\n${jobs}`;

describe('runner の指定（runs-on）', () => {
  const job = (runsOn: string): string => flow(`  check:\n    runs-on: ${runsOn}\n    steps:\n      - uses: actions/checkout@v4\n      - run: curl -fsS https://intra.city.example/health\n`);

  it('提供される runner からは、社内の網の名前に届かない', () => {
    const m = machine(job('ubuntu-latest'));
    m.run('git push -q -u origin main');
    expect(m.holds('head run=failure')).toBe(true);
    expect(m.run('gh run view --log-failed').out).toContain('Could not resolve host: intra.city.example');
  });

  it('自前の runner をラベルで選ぶと、社内の網に届く', () => {
    const m = machine(job('[self-hosted, city-net]'));
    m.run('git push -q -u origin main');
    expect(m.holds('head run=success')).toBe(true);
  });

  it('どの runner にも合わないラベルは、動かせずに失敗する', () => {
    const m = machine(job('[self-hosted, gpu]'));
    m.run('git push -q -u origin main');
    expect(m.holds('head job:check=failure')).toBe(true);
    expect(m.run('gh run view --log-failed').out).toContain('No runner matching the specified labels was found: self-hosted, gpu');
  });
});

describe('Secrets', () => {
  const job = (env: string, extra = ''): string => flow(`  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm run deploy\n        env:\n          DEPLOY_TOKEN: ${env}\n${extra}`);

  it('secrets の名前で値を渡すと配れる', () => {
    const m = machine(job('${{ secrets.DEPLOY_TOKEN }}'));
    m.run('git push -q -u origin main');
    expect(m.holds('head run=success deployed:reserve.example=1.5.0')).toBe(true);
  });

  it('名前が違うと空になり、配れない', () => {
    const m = machine(job('${{ secrets.DEPLOY_KEY }}'));
    m.run('git push -q -u origin main');
    expect(m.holds('head run=failure deployed:reserve.example=1.4.0')).toBe(true);
    expect(m.run('gh run view --log-failed').out).toContain('401 Unauthorized');
  });

  it('job の env に書いた secrets も、実行の時に値になる', () => {
    const m = machine(flow(`  deploy:\n    runs-on: ubuntu-latest\n    env:\n      DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm run deploy\n`));
    m.run('git push -q -u origin main');
    expect(m.holds('head run=success deployed:reserve.example=1.5.0')).toBe(true);
  });

  it('secrets で渡した値は、ログでは伏せる。設定に直接書いた値は伏せない', () => {
    const hidden = machine(job('${{ secrets.DEPLOY_TOKEN }}', '      - run: echo "token=$DEPLOY_TOKEN"\n        env:\n          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}\n'));
    hidden.run('git push -q -u origin main');
    const log = hidden.run('gh run view --log').out;
    expect(log).toContain('token=***');
    expect(log).not.toContain(TOKEN);
    expect(hidden.holds(`!logged:${TOKEN} logged:token=***`)).toBe(true);

    const plain = machine(flow(`  deploy:\n    runs-on: ubuntu-latest\n    env:\n      DEPLOY_TOKEN: abc-plain\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo "token=$DEPLOY_TOKEN"\n`));
    plain.run('git push -q -u origin main');
    expect(plain.holds('logged:token=abc-plain')).toBe(true);
  });
});

describe('きっかけと環境', () => {
  it('trigger: ワークフローが動くきっかけを見る', () => {
    const m = machine(flow('  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo ok\n'));
    m.run('git push -q -u origin main');
    expect(m.holds('trigger:push trigger:pull_request !trigger:schedule')).toBe(true);
  });

  it('承認の要る環境の job は待ち、先の環境だけに配られる。待っている間、本番は変わらない', () => {
    const m = machine(flow([
      '  staging:\n    runs-on: ubuntu-latest\n    environment: staging\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm run deploy:staging\n',
      '  production:\n    runs-on: ubuntu-latest\n    needs: staging\n    environment: production\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm run deploy\n        env:\n          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}\n',
    ].join('')));
    m.run('git push -q -u origin main');
    expect(m.holds('head job:staging=success job:production=waiting run=waiting deployed:staging.example=1.5.0 deployed:reserve.example=1.4.0')).toBe(true);
    const view = m.run('gh run view').out;
    expect(view).toContain('production');
    expect(view).toContain('Waiting for review: production needs approval to start deploying changes.');
  });

  it('承認の要らない環境の job は、そのまま動く', () => {
    const m = machine(flow('  production:\n    runs-on: ubuntu-latest\n    environment: staging\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm run deploy:staging\n'));
    m.run('git push -q -u origin main');
    expect(m.holds('head run=success deployed:staging.example=1.5.0')).toBe(true);
  });
});
