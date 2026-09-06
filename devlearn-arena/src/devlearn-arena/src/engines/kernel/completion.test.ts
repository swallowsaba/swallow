import { describe, expect, it } from 'vitest';
import { complete } from './completion';
import { createSession } from './session';

const session = createSession({
  files: {
    '/home/learner': null,
    '/home/learner/README.txt': 'x',
    '/home/learner/report.md': 'x',
    '/home/learner/work': null,
    '/home/learner/work/deep.txt': 'x',
  },
});

function candidates(line: string): string[] {
  return complete(line, line.length, { shell: session.state, registry: session.registry }).candidates;
}

describe('コマンド名の補完', () => {
  it('接頭辞で絞る', () => {
    expect(candidates('ec')).toEqual(['echo']);
  });
  it('複数候補を返す', () => {
    expect(candidates('c')).toContain('cat');
    expect(candidates('c')).toContain('cd');
  });
  it('共通接頭辞を計算する', () => {
    const result = complete('ex', 2, { shell: session.state, registry: session.registry });
    expect(result.commonPrefix).toBe('export');
  });
});

describe('パスの補完', () => {
  it('カレントの候補を出す', () => {
    expect(candidates('cat RE')).toEqual(['README.txt']);
  });
  it('ディレクトリには / を付ける', () => {
    expect(candidates('cd wo')).toEqual(['work/']);
  });
  it('サブディレクトリの中を補完する', () => {
    expect(candidates('cat work/')).toEqual(['work/deep.txt']);
  });
  it('一致しなければ空', () => {
    expect(candidates('cat zzz')).toEqual([]);
  });
  it('置換開始位置を返す', () => {
    const line = 'cat RE';
    expect(complete(line, line.length, { shell: session.state, registry: session.registry }).start).toBe(4);
  });
});
