import { describe, expect, it } from 'vitest';
import { initialShell } from '../../environments';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** sed の置き換える文の \n（改行）と \t（タブ）。GNU sed と同じ */

function run(line: string): string {
  let state: ShellState = initialShell('linux-basic', { files: { '/home/learner/a.txt': 'deploy:\nother\n' } });
  const o = execute(state, line, createDefaultRegistry(), createClock());
  state = o.state;
  return o.chunks.filter((c) => c.stream === 'stdout').map((c) => c.text).join('');
}

describe('sed の置き換える文', () => {
  it('\\n は改行になる', () => {
    expect(run("sed 's/^deploy:$/deploy:\\n  needs: test/' /home/learner/a.txt")).toBe('deploy:\n  needs: test\nother\n');
  });
  it('\\t はタブになる', () => {
    expect(run("sed 's/other/a\\tb/' /home/learner/a.txt")).toBe('deploy:\na\tb\n');
  });
  it('\\1 は前の通りかっこの中身になる', () => {
    expect(run("sed 's/\\(oth\\)er/\\1ER/' /home/learner/a.txt")).toBe('deploy:\nothER\n');
  });
});
