import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands/index';
import type { ShellState } from '@/engines/kernel/registry';
import { execute } from '@/engines/kernel/shell';
import { RandomState } from './mt19937';
import { runPython } from './interp';
import real from './realOutputs.json';

/** 模擬の Python が、本物と同じ出力・同じエラーになること（realOutputs.json は本物で動かした結果） */

describe('本物の Python と同じ出力', () => {
  const host = { read: (p: string) => (p === '/app/data.csv' ? real.data : null), write: () => {} };
  for (const c of real.cases) {
    it(c.name, () => {
      const r = runPython(c.source, `/app/${c.name}.py`, host);
      expect(r.stdout).toBe(c.stdout);
      expect(r.stderr).toBe(c.stderr);
      expect(r.code).toBe(c.stderr === '' ? 0 : 1);
    });
  }
});

describe('乱数', () => {
  it('種が同じなら同じ列になる', () => {
    const a = new RandomState(7);
    const b = new RandomState(7);
    expect([a.random(), a.normal(), a.interval(9)]).toEqual([b.random(), b.normal(), b.interval(9)]);
    expect(new RandomState(1).permutation(5)).not.toEqual(new RandomState(2).permutation(5));
  });
});

describe('端末の python3', () => {
  const registry = createDefaultRegistry();
  const clock = createClock();
  function session(files: Record<string, string>) {
    let shell: ShellState = initialShell('linux-basic', { hostname: 'lab', cwd: '/home/learner', files });
    return (line: string) => {
      const o = execute(shell, line, registry, clock);
      shell = o.state;
      const pick = (s: string) => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    };
  }

  it('ファイルを動かし、置いた CSV を読む', () => {
    const run = session({ '/home/learner/a.py': "import pandas as pd\ndf = pd.read_csv('d.csv')\nprint(df['x'].mean())\n", '/home/learner/d.csv': 'x\n1\n3\n' });
    expect(run('python3 a.py').out).toBe('2.0\n');
    expect(run('python3 a.py | wc -l').out.trim()).toBe('1');
  });

  it('-c で 1 行を動かす。無いファイルは本物の文で断る', () => {
    const run = session({});
    expect(run(`python3 -c "print(1 + 1)"`).out).toBe('2\n');
    const r = run('python3 nothing.py');
    expect(r.code).toBe(2);
    expect(r.err).toBe("python3: can't open file '/home/learner/nothing.py': [Errno 2] No such file or directory\n");
    expect(run('python3 --version').out).toMatch(/^Python 3\./);
  });

  it('誤りは Traceback を標準エラーに出し、終了の状態は 1', () => {
    const run = session({ '/home/learner/b.py': 'print(y)\n' });
    const r = run('python3 b.py');
    expect(r.code).toBe(1);
    expect(r.err).toContain("NameError: name 'y' is not defined");
  });

  it('ファイルが無い CSV は FileNotFoundError', () => {
    const run = session({ '/home/learner/c.py': "import pandas as pd\npd.read_csv('none.csv')\n" });
    expect(run('python3 c.py').err).toContain("FileNotFoundError: [Errno 2] No such file or directory: 'none.csv'");
  });
});
