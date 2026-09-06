import { describe, expect, it } from 'vitest';
import { createVfs, mkdir, remove, writeFile } from '@/engines/kernel/vfs';
import { describeChange } from './describe';

const base = createVfs({ '/home/learner': null, '/home/learner/a.txt': 'A' });

describe('変化の説明', () => {
  it('ディレクトリの作成を伝える', () => {
    const next = mkdir(base, '/home/learner/reports');
    const c = describeChange(base, next, '/home/learner', '/home/learner', 0);
    expect(c.kind).toBe('created-dir');
    expect(c.text).toContain('~/reports');
  });

  it('ファイルの作成を伝える', () => {
    const next = writeFile(base, '/home/learner/b.txt', 'B');
    expect(describeChange(base, next, '/home/learner', '/home/learner', 0).kind).toBe('created-file');
  });

  it('書き換えを伝える', () => {
    const next = writeFile(base, '/home/learner/a.txt', 'changed');
    expect(describeChange(base, next, '/home/learner', '/home/learner', 0).kind).toBe('updated');
  });

  it('削除を伝える', () => {
    const next = remove(base, '/home/learner/a.txt');
    expect(describeChange(base, next, '/home/learner', '/home/learner', 0).kind).toBe('removed');
  });

  it('移動を伝える', () => {
    const c = describeChange(base, base, '/home/learner', '/etc', 0);
    expect(c.kind).toBe('moved-cwd');
    expect(c.text).toContain('/etc');
  });

  it('失敗したときは状態が変わっていないと伝える', () => {
    expect(describeChange(base, base, '/etc', '/etc', 1).text).toContain('失敗');
  });

  it('確認コマンドは変化なしと伝える', () => {
    expect(describeChange(base, base, '/etc', '/etc', 0).text).toContain('変わっていません');
  });

  it('複数件はまとめて数える', () => {
    let next = mkdir(base, '/home/learner/x');
    next = mkdir(next, '/home/learner/y');
    expect(describeChange(base, next, '/home/learner', '/home/learner', 0).text).toContain('ほか 1 件');
  });
});
