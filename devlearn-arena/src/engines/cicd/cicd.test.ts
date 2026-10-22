import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { formatLocalTime, formatUtcTime, parseLocalTime } from '@/engines/kernel/commands/gitShared';
import type { ShellState } from '@/engines/kernel/registry';
import { restoreShell, snapshotShell } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { ciHolds } from './check';
import { resolveVersion, satisfies, siteRoutes } from './project';
import { actionsSetupSchema } from './setup';
import { readWorkflow, triggeredBy } from './workflow';

const URL = 'https://git.city.example/city/reserve.git';
const REPO = '/home/learner/reserve';

const PKG = JSON.stringify({
  name: 'reserve-site',
  version: '1.5.0',
  scripts: { build: 'tsc --noEmit && esbuild src/server.ts --bundle --outfile=dist/server.js', test: 'vitest run', deploy: 'rsync -av dist/ deploy@reserve.example:/srv/reserve/', rollback: 'ssh deploy@reserve.example /srv/reserve/bin/rollback', hello: 'echo こんにちは $npm_package_version' },
  dependencies: { 'date-lib': '^2.3.0' },
  devDependencies: { vitest: '^2.1.0' },
});

/** 予約サイトのリポジトリ（origin に GitHub Actions のある置き場）を作り、まだ push していない所から始める */
function machine(workflow: string, extra: Record<string, string> = {}) {
  let shell: ShellState = initialShell('linux-basic', {
    cwd: REPO,
    dirs: [`${REPO}/src`, `${REPO}/.github/workflows`],
    sites: [],
    files: {
      [`${REPO}/package.json`]: PKG,
      [`${REPO}/.gitignore`]: 'node_modules/\ndist/\n',
      [`${REPO}/src/server.ts`]: "export const ok = 'ok';\n",
      [`${REPO}/.github/workflows/ci.yml`]: workflow,
      ...extra,
    },
    run: ["export __NOW='2026-10-15 09:00'", 'git init -q', `git remote add origin ${URL}`],
    gitServers: [{
      url: URL,
      run: [],
      forge: {
        repo: 'city/reserve',
        actions: {
          installSeconds: 10,
          packages: { 'date-lib': [{ version: '2.3.0' }, { version: '2.4.0', published: '2026-10-15 09:05' }] },
          scripts: {
            build: { kind: 'build', seconds: 60, sources: 'src', bundle: 'dist/server.js', log: ['built'], faults: [{ when: [{ path: 'src/server.ts', has: 'seatCount' }], code: 2, log: ["src/server.ts(1,14): error TS2304: Cannot find name 'seatCount'."] }] },
            test: { kind: 'test', seconds: 30, log: ['Tests  1 passed (1)'], faults: [{ when: [{ path: 'src/server.ts', has: 'broken' }], code: 1, log: ['Tests  1 failed (1)'] }] },
            deploy: { kind: 'deploy', seconds: 20, out: 'dist', site: 'reserve.example', log: ['switched to {version}'], missing: { log: ['rsync: change_dir "dist" failed: No such file or directory (2)'], code: 23 } },
            rollback: { kind: 'rollback', seconds: 5, site: 'reserve.example', log: ['switched back to {previous}'], missing: { log: ['rollback: no release before {current}'], code: 1 } },
          },
          sites: [{
            host: 'reserve.example',
            chain: CHAIN,
            releases: [{ version: '1.4.0', files: {} }],
            current: '1.4.0',
            routes: { '/': { status: 200, body: '版 {version}' }, '/health': { status: 200, body: 'ok' } },
            faults: [{ when: [{ path: 'server.js', has: 'down' }], routes: { '/health': { status: 500, body: 'Internal Server Error' } } }],
          }],
        },
      },
    }],
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string): { out: string; err: string; code: number } => {
    const o = execute(shell, line, registry, clock);
    shell = o.state;
    const pick = (s: 'stdout' | 'stderr') => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
  };
  const push = (message: string, branch = 'main'): void => {
    run('git add .');
    run(`git commit -q -m '${message}'`);
    run(`git push -q -u origin ${branch}`);
  };
  return { run, push, holds: (expr: string) => ciHolds(shell, expr), shell: () => shell, set: (s: ShellState) => { shell = s; } };
}

const CHAIN = [
  { id: 'leaf', subject: 'reserve.example', issuer: 'Minato Issuing CA', sans: ['reserve.example'], notBefore: '2026-01-01', notAfter: '2027-01-01', ca: false },
  { id: 'inter', subject: 'Minato Issuing CA', issuer: 'Minato Root CA', sans: [], notBefore: '2024-01-01', notAfter: '2030-01-01', ca: true },
];

const flow = (steps: string, head = 'name: ci\non:\n  push:\n    branches: [main]\njobs:\n'): string => `${head}${steps}`;

const ONE_JOB = flow(`  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - run: npm test
      - name: 配る
        run: npm run deploy
      - name: 確かめる
        run: curl -fsS https://reserve.example/health
      - name: 戻す
        if: failure()
        run: npm run rollback
`);

describe('ワークフローを読む（GitHub と同じ言い方の誤り）', () => {
  it('YAML が読めなければ、その行を知らせる', () => {
    const r = readWorkflow('.github/workflows/ci.yml', 'name: ci\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n   steps:\n      - run: echo\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/You have an error in your yaml syntax on line \d+/);
  });

  it('知らない鍵・runs-on の無い job・手順の無い中身・知らない needs・依存の輪を断る', () => {
    const bad = readWorkflow('ci.yml', flow(`  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - step: npm test
  test:
    needs: tests
    steps:
      - run: npm test
  a:
    needs: b
    runs-on: ubuntu-latest
    steps:
      - run: echo a
  b:
    needs: a
    runs-on: ubuntu-latest
    steps:
      - run: echo b
`));
    expect(bad.ok).toBe(false);
    const text = bad.ok ? '' : bad.errors.join('\n');
    expect(text).toContain("(Line: 10, Col: 9): Unexpected value 'step'");
    expect(text).toContain("There's not enough info to determine what you meant");
    expect(text).toContain('Required property is missing: runs-on');
    expect(text).toContain("Job 'test' depends on unknown job 'tests'.");
    expect(text).toContain('which creates a cycle in the dependency graph');
  });

  it('push の branches で、動く枝を絞る（* を使える）', () => {
    const r = readWorkflow('ci.yml', 'on:\n  push:\n    branches: [main, "release/*"]\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n');
    if (!r.ok) throw new Error(r.errors.join());
    expect(triggeredBy(r.workflow, 'push', 'main')).toBe(true);
    expect(triggeredBy(r.workflow, 'push', 'release/1.5')).toBe(true);
    expect(triggeredBy(r.workflow, 'push', 'feature')).toBe(false);
    expect(triggeredBy(r.workflow, 'pull_request', 'main')).toBe(false);
  });
});

describe('部品の版と配る先の模型', () => {
  it('時刻の書き方（日本時間・UTC）は、parseLocalTime の逆', () => {
    expect(formatLocalTime(parseLocalTime('2026-10-15 09:05:07') ?? 0)).toBe('2026-10-15 09:05:07');
    expect(formatUtcTime(parseLocalTime('2026-10-15 09:05') ?? 0)).toBe('2026-10-15T00:05:00');
    expect(formatLocalTime(parseLocalTime('2024-02-29 23:59:59') ?? 0)).toBe('2024-02-29 23:59:59');
  });

  it('^ と ~ の範囲と、その時刻に出ている一番新しい版', () => {
    expect(satisfies('2.4.0', '^2.3.0')).toBe(true);
    expect(satisfies('3.0.0', '^2.3.0')).toBe(false);
    expect(satisfies('2.3.9', '~2.3.0')).toBe(true);
    expect(satisfies('2.4.0', '~2.3.0')).toBe(false);
    const setup = actionsSetupSchema.parse({ packages: { 'date-lib': [{ version: '2.3.0' }, { version: '2.4.0', published: '2026-10-15 09:05' }] } });
    const at = (t: string): number => parseLocalTime(t) ?? 0;
    expect(resolveVersion(setup, 'date-lib', '^2.3.0', at('2026-10-15 09:04'), parseLocalTime)).toBe('2.3.0');
    expect(resolveVersion(setup, 'date-lib', '^2.3.0', at('2026-10-15 09:05'), parseLocalTime)).toBe('2.4.0');
    expect(resolveVersion(setup, 'date-lib', '^3.0.0', at('2026-10-15 09:05'), parseLocalTime)).toBeNull();
  });

  it('配った版の中身で、道の答えが替わる', () => {
    const site = actionsSetupSchema.parse({ sites: [{ host: 'a.example', releases: [{ version: '1.0.0' }, { version: '1.1.0', files: { 'server.js': 'down' } }], current: '1.1.0', routes: { '/health': { status: 200, body: 'ok {version}' } }, faults: [{ when: [{ path: 'server.js', has: 'down' }], routes: { '/health': { status: 500, body: 'x' } } }] }] }).sites[0];
    if (!site) throw new Error('site');
    expect(siteRoutes(site, { host: 'a.example', current: '1.1.0', releases: site.releases })['/health']?.status).toBe(500);
    expect(siteRoutes(site, { host: 'a.example', current: '1.0.0', releases: site.releases })['/health']).toEqual({ status: 200, body: 'ok 1.0.0' });
  });
});

describe('npm（本物の npm 10 の出し方）', () => {
  it('package-lock.json の無い npm ci・入れる前の道具・無い script を、本物の言い方で断る', () => {
    const m = machine(ONE_JOB);
    const ci = m.run('npm ci');
    expect(ci.code).toBe(1);
    expect(ci.err).toContain('npm error The `npm ci` command can only install with an existing package-lock.json');
    const build = m.run('npm run build');
    expect(build.out).toContain('> reserve-site@1.5.0 build\n> tsc --noEmit');
    expect(build.err).toBe('sh: 1: tsc: not found\n');
    expect(build.code).toBe(127);
    expect(m.run('npm run tests').err).toContain('npm error Missing script: "tests"');
  });

  it('npm install は、その時刻に範囲に合う一番新しい版を入れ、package-lock.json に書く。npm ci はその版のまま入れる', () => {
    const m = machine(ONE_JOB);
    expect(m.run('npm install').out).toContain('added 2 packages');
    expect(m.run('cat node_modules/date-lib/package.json').out).toContain('"version": "2.3.0"');
    expect(m.run('cat package-lock.json').out).toContain('"node_modules/date-lib"');
    m.run('rm -r node_modules');
    m.run('timeskip +10m');
    m.run('npm ci');
    expect(m.run('cat node_modules/date-lib/package.json').out).toContain('"version": "2.3.0"');
  });

  it('模型の無い script は、中身をシェルで動かす（npm_package_version を渡す）', () => {
    const m = machine(ONE_JOB);
    expect(m.run('npm run hello').out).toBe('\n> reserve-site@1.5.0 hello\n> echo こんにちは $npm_package_version\n\nこんにちは 1.5.0\n');
  });
});

describe('push で動く GitHub Actions', () => {
  it('手順を上から動かし、失敗した後の手順は動かさない（if: failure() の手順は動く）', () => {
    const m = machine(ONE_JOB);
    m.run('npm install');
    m.run("sed -i 's/ok/down/' src/server.ts");
    m.push('壊れた版');
    const view = m.run('gh run view');
    expect(view.out).toMatch(/^X main ci · \d+\nTriggered via push less than a minute ago\n/);
    expect(view.out).toContain('  ✓ 配る\n  X 確かめる\n  ✓ 戻す\n');
    expect(m.holds('head run=failure step:release/curl=failure step:release/npm+run+rollback=success deployed:reserve.example=1.4.0')).toBe(true);
    const log = m.run('gh run view --log-failed').out;
    expect(log).toMatch(/^release\t確かめる\t2026-10-15T00:0\d:\d\d\.\d{7}Z ##\[group\]Run curl -fsS https:\/\/reserve.example\/health\n/);
    expect(log).toContain('curl: (22) The requested URL returned error: 500');
    expect(log).toContain('##[error]Process completed with exit code 22.');
    expect(m.run('gh run watch --exit-status').code).toBe(1);
    // 手元から見た本番は、戻した 1.4.0
    expect(m.run('curl -s https://reserve.example/').out).toBe('版 1.4.0\n');
  });

  it('前の手順が成功すれば配り、手元からも新しい版が見える。前の版が無ければ戻せない', () => {
    const m = machine(ONE_JOB);
    m.run('npm install');
    m.push('1.5.0');
    expect(m.holds('head run=success deployed:reserve.example=1.5.0 kept:reserve.example=1.4.0')).toBe(true);
    expect(m.run('curl -s https://reserve.example/').out).toBe('版 1.5.0\n');
    expect(m.holds('order:release=npm+ci,npm+run+build,npm+test,npm+run+deploy !has:release/npm+run+prune')).toBe(true);
    // 1.5.0 は動くので、戻す手順は動かない。手で戻すと、置いてあった 1.4.0 に戻り、もう 1 つ前は無い
    m.run('npm run rollback');
    expect(m.holds('deployed:reserve.example=1.4.0')).toBe(true);
    const again = m.run('npm run rollback');
    expect(again.err).toBe('rollback: no release before 1.4.0\n');
    expect(again.code).toBe(1);
  });

  it('npm run test は npm test と同じ手順として当てる（start・stop・restart も。VERIFY-FREE.txt【1】）', () => {
    const m = machine(ONE_JOB.replace('run: npm test', 'run: npm run test'));
    m.run('npm install');
    m.push('1.5.0');
    expect(m.holds('order:release=npm+ci,npm+run+build,npm+test,npm+run+deploy step:release/npm+test=success has:release/npm+test')).toBe(true);
    expect(m.holds('order:release=npm+ci,npm+run+build,npm+run+test')).toBe(true);
    expect(m.holds('has:release/npm+start')).toBe(false);
  });

  it('依存しない job は同じ時刻に並んで動き、全体の時間は一番長い道すじになる。依存が失敗すれば動かない', () => {
    const job = (key: string, needs: string, run: string): string => `  ${key}:\n${needs}    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: ${run}\n`;
    const m = machine(flow(job('build', '', 'npm run build') + job('test', '    needs: build\n', 'npm test') + job('lint', '    needs: build\n', 'npm test')));
    m.run('npm install');
    m.push('並べる');
    // build（10 + 60 秒）の後に、test と lint（10 + 30 秒）が並ぶ
    expect(m.holds('run=success elapsed<=1m50s !elapsed<=1m49s needs:test=build needs:lint=build')).toBe(true);
    expect(m.run('gh run list -L 1').out).toMatch(/✓\s+並べる\s+ci\s+main\s+push\s+\d+\s+1m50s\s+less than a minute ago/);
    m.run("sed -i 's/ok/seatCount/' src/server.ts");
    m.push('組み立てが壊れる');
    expect(m.holds('job:build=failure job:test=skipped job:lint=skipped')).toBe(true);
    expect(m.run('gh run view').out).toContain('- test (ID ');
  });

  it('成果物は、上げた名前で受け取れる。違う名前では本物と同じ言い方で失敗する', () => {
    const up = '      - uses: actions/upload-artifact@v4\n        with:\n          name: app\n          path: dist/\n';
    const down = (name: string): string => `      - uses: actions/download-artifact@v4\n        with:\n          name: ${name}\n          path: dist/\n`;
    const wf = (name: string): string => flow(`  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm run build\n${up}  deploy:\n    needs: build\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n${down(name)}      - run: npm run deploy\n`);
    const m = machine(wf('dist'));
    m.run('npm install');
    m.push('名前を違える');
    expect(m.run('gh run view').out).toContain('X Unable to download artifact(s): Artifact not found for name: dist');
    expect(m.holds('artifact:app job:deploy=failure deployed:reserve.example=1.4.0')).toBe(true);
    m.run(`sed -i 's/name: dist/name: app/' .github/workflows/ci.yml`);
    m.push('名前を合わせる');
    expect(m.holds('head run=success got:deploy=app deployed:reserve.example=1.5.0 release:reserve.example~"2.3.0"')).toBe(true);
    const digests = m.run("gh run view --log | grep 'SHA256 digest'").out.split('\n').filter(Boolean).map((l) => l.split(' ').at(-1));
    expect(digests).toHaveLength(2);
    expect(digests[0]).toBe(digests[1]);
  });

  it('読めないワークフローは job を動かさず、gh run view が workflow file issue と言う。絞った枝のほかでは動かない', () => {
    const m = machine(flow('  build:\n    runs-on: ubuntu-latest\n    steps:\n      - stepp: npm test\n'));
    m.push('誤り');
    const view = m.run('gh run view').out;
    expect(view).toContain('X This run likely failed because of a workflow file issue.');
    expect(view).toContain("Unexpected value 'stepp'");
    // 読めないワークフローは、どの枝の push でも失敗の実行になる（本物の GitHub も、きっかけを読めない）
    m.run("sed -i 's/stepp: npm test/run: echo ok/' .github/workflows/ci.yml");
    m.push('直す');
    expect(m.holds('head run=success')).toBe(true);
    m.run('git switch -q -c feature');
    m.run('echo x > note.txt');
    m.push('feature', 'feature');
    expect(m.holds('head')).toBe(false);
    expect(m.run('gh run list').out.split('\n').filter((l) => l.includes('feature'))).toEqual([]);
  });

  it('記録と配る先は、保存から戻しても残る', () => {
    const m = machine(ONE_JOB);
    m.run('npm install');
    m.push('1.5.0');
    m.set(restoreShell(JSON.parse(JSON.stringify(snapshotShell(m.shell()))) as ReturnType<typeof snapshotShell>));
    expect(m.holds('head run=success deployed:reserve.example=1.5.0')).toBe(true);
    expect(m.run('gh run list').out).toContain('1.5.0');
  });
});
