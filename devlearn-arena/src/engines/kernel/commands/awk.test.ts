import { describe, expect, it } from 'vitest';
import { createSession } from '../session';
import { execute } from '../shell';
import type { ShellState } from '../registry';

/** awk（VERIFY-FREE.txt【1】: df の使用率を awk で取る・grep -c の数を awk で足す、など実務の書き方） */

function machine() {
  const s = createSession({
    files: {
      '/home/learner': null,
      '/home/learner/sales.txt': 'north 3\nsouth 5\nnorth 4\n',
      '/home/learner/passwd': 'root:x:0:0:root:/root:/bin/bash\nlearner:x:1000:1000::/home/learner:/bin/sh\n',
    },
  });
  let state: ShellState = s.state;
  return (line: string) => {
    const out = execute(state, line, s.registry, s.clock);
    state = out.state;
    const pick = (k: 'stdout' | 'stderr') => out.chunks.filter((c) => c.stream === k).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: out.exitCode };
  };
}

describe('awk', () => {
  it('列を出す。NR で行を選び、$NF は最後の列', () => {
    const run = machine();
    expect(run("df / | awk 'NR==2 {print $5}'").out).toMatch(/^\d+%\n$/);
    expect(run("awk '{print $NF, $1}' sales.txt").out).toBe('3 north\n5 south\n4 north\n');
    expect(run("echo 'a b c' | awk '{print $2}'").out).toBe('b\n');
  });

  it('-F で区切りを決める。/正規表現/ と ~ で行を選ぶ', () => {
    const run = machine();
    expect(run("awk -F: '$3 >= 1000 {print $1}' passwd").out).toBe('learner\n');
    expect(run("awk -F':' '/bash$/ {print $1}' passwd").out).toBe('root\n');
    expect(run("awk -F: '$7 ~ /sh$/ && $1 != \"root\" { print $6 }' passwd").out).toBe('/home/learner\n');
  });

  it('足し算と END、配列と for (k in a)、printf', () => {
    const run = machine();
    expect(run("awk '{s += $2} END {print s}' sales.txt").out).toBe('12\n');
    expect(run("echo '/a:1 /b:2' | tr ' ' '\\n' | awk -F: '{n+=$2} END {print n}'").out).toBe('3\n');
    expect(run("awk '{t[$1]+=$2} END {for (k in t) printf \"%s=%d\\n\", k, t[k]}' sales.txt").out).toBe('north=7\nsouth=5\n');
    expect(run("awk 'BEGIN {printf \"%5.1f|%-4s|%03d\\n\", 3.14159, \"ab\", 7}'").out).toBe('  3.1|ab  |007\n');
  });

  it('gsub・length・substr・toupper・-v・if と else', () => {
    const run = machine();
    expect(run("echo '90%' | awk '{gsub(/%/, \"\"); print $1 + 1}'").out).toBe('91\n');
    expect(run("echo hello | awk '{print length($0), substr($0, 2, 3), toupper($0)}'").out).toBe('5 ell HELLO\n');
    expect(run("awk -v limit=4 '{ if ($2 > limit) print $1; else print \"-\" }' sales.txt").out).toBe('-\nsouth\n-\n');
  });

  it('書き方の誤りは、2 で終わって、そう言う', () => {
    const r = machine()("awk '{print $1' sales.txt");
    expect(r.code).toBe(2);
    expect(r.err).toContain('syntax error');
    expect(machine()('awk 1 nofile').err).toContain('cannot open "nofile"');
  });
});
