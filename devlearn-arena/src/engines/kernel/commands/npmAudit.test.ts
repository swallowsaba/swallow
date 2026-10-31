import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from './index';

/** npm の間接の依存・npm ls・npm audit（sec.a.04） */

const registry = createDefaultRegistry();
const clock = createClock();

const setup = {
  hostname: 'dev',
  cwd: '/home/learner/shop',
  dirs: ['/home/learner/shop/src'],
  sites: [],
  files: {
    '/home/learner/shop/package.json': `${JSON.stringify({ name: 'city-shop', version: '1.0.0', scripts: { test: 'vitest run' }, dependencies: { 'web-kit': '~1.4.0', 'date-lite': '^2.0.0' } }, null, 2)}\n`,
    '/home/learner/shop/src/a.ts': 'export const a = 1;\n',
  },
  run: ['git init -q', 'git remote add origin https://git.city.example/city/shop.git', 'npm install'],
  gitServers: [{
    url: 'https://git.city.example/city/shop.git', run: [],
    forge: {
      repo: 'city/shop',
      actions: {
        installSeconds: 5,
        packages: {
          'web-kit': [
            { version: '1.4.0', deps: { 'left-walk': '^0.2.0' } },
            { version: '1.5.0', deps: { 'left-walk': '^0.3.0' } },
            { version: '2.0.0', deps: { 'left-walk': '^0.3.0' } },
          ],
          'date-lite': [{ version: '2.1.0' }],
          'left-walk': [{ version: '0.2.1' }, { version: '0.3.0' }],
        },
        advisories: [{ name: 'left-walk', below: '0.3.0', severity: 'high', title: 'Prototype pollution in left-walk', id: 'GHSA-city-0001' }],
        scripts: {
          test: { kind: 'test', log: ['      Tests  3 passed (3)'], faults: [{ when: [{ path: 'package.json', has: '"web-kit": "^2' }], code: 1, log: ['TypeError: kit.serve is not a function', '      Tests  3 failed (3)'] }] },
        },
      },
    },
  }],
};

function session() {
  let shell: ShellState = initialShell('linux-basic', setup);
  return {
    run(line: string) {
      const o = execute(shell, line, registry, clock);
      shell = o.state;
      const pick = (s: string) => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
  };
}

describe('npm の間接の依存', () => {
  it('間接の部品も node_modules と package-lock.json に入る', () => {
    const s = session();
    expect(s.run('cat node_modules/left-walk/package.json').out).toContain('"version": "0.2.1"');
    expect(s.run('cat package-lock.json').out).toContain('node_modules/left-walk');
  });

  it('npm ls は木を出し、名前を書くとその部品への道だけを出す', () => {
    const s = session();
    const all = s.run('npm ls').out;
    expect(all).toContain('city-shop@1.0.0 /home/learner/shop');
    expect(all).toContain('web-kit@1.4.0');
    expect(all).toContain('date-lite@2.1.0');
    const one = s.run('npm ls left-walk').out;
    expect(one).toContain('└─┬ web-kit@1.4.0');
    expect(one).toContain('  └── left-walk@0.2.1');
    expect(one).not.toContain('date-lite');
  });

  it('npm ls は入っていない名前を (empty) と言い、終了の値は 1', () => {
    const s = session();
    const r = s.run('npm ls nothing');
    expect(r.out).toContain('└── (empty)');
    expect(r.code).toBe(1);
  });
});

describe('npm audit', () => {
  it('脆弱な間接の部品と、それを使う親を出し、終了の値は 1', () => {
    const s = session();
    const r = s.run('npm audit');
    expect(r.code).toBe(1);
    expect(r.out).toContain('left-walk  <0.3.0');
    expect(r.out).toContain('Severity: high');
    expect(r.out).toContain('Prototype pollution in left-walk');
    expect(r.out).toContain('node_modules/left-walk');
    expect(r.out).toContain('Depends on vulnerable versions of left-walk');
    expect(r.out).toContain('2 high severity vulnerabilities');
  });

  it('親の版を上げると間接の部品も上がり、警告が消える。テストも通る', () => {
    const s = session();
    const i = s.run('npm install web-kit@~1.5.0');
    expect(i.code).toBe(0);
    expect(i.out).toContain('found 0 vulnerabilities');
    expect(s.run('cat node_modules/left-walk/package.json').out).toContain('"version": "0.3.0"');
    const a = s.run('npm audit');
    expect(a.code).toBe(0);
    expect(a.out).toContain('found 0 vulnerabilities');
    expect(s.run('npm test').code).toBe(0);
  });

  it('次の大きな版は警告が消えても、テストが落ちる', () => {
    const s = session();
    s.run('npm install web-kit@2.0.0');
    expect(s.run('npm audit').code).toBe(0);
    const t = s.run('npm test');
    expect(t.code).toBe(1);
    expect(t.out).toContain('kit.serve is not a function');
  });

  it('install の最後の行は、残っている警告の数を言う', () => {
    const s = session();
    expect(s.run('npm install').out).toContain('2 high severity vulnerabilities');
  });
});
