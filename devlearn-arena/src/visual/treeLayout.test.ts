import { describe, expect, it } from 'vitest';
import { createVfs, mkdir, writeFile } from '@/engines/kernel/vfs';
import { COL_W, diffVfs, layoutTree } from './treeLayout';

const vfs = createVfs({
  '/home/learner': null,
  '/home/learner/a.txt': 'A',
  '/home/learner/work': null,
  '/etc/hosts': 'x',
});

describe('階層図の配置', () => {
  it('ルートから全ディレクトリを並べる', () => {
    const layout = layoutTree(vfs);
    expect(layout.nodes.map((n) => n.path).sort()).toEqual(
      ['/', '/etc', '/home', '/home/learner', '/home/learner/work'].sort(),
    );
  });

  it('深さが列になる', () => {
    const layout = layoutTree(vfs);
    expect(layout.byPath.get('/')?.x).toBe(0);
    expect(layout.byPath.get('/home')?.x).toBe(COL_W);
    expect(layout.byPath.get('/home/learner')?.x).toBe(COL_W * 2);
  });

  it('ファイルは親ディレクトリの中に入る', () => {
    const layout = layoutTree(vfs);
    expect(layout.byPath.get('/home/learner')?.files.map((f) => f.name)).toEqual(['a.txt']);
    expect(layout.byPath.get('/etc')?.files.map((f) => f.name)).toEqual(['hosts']);
  });

  it('ファイルが多いほど箱が高くなる', () => {
    let many = vfs;
    for (let i = 0; i < 3; i += 1) many = writeFile(many, `/etc/f${String(i)}`, 'x');
    expect((layoutTree(many).byPath.get('/etc')?.height ?? 0)).toBeGreaterThan(
      layoutTree(vfs).byPath.get('/etc')?.height ?? 0,
    );
  });

  it('親は子の真ん中に置かれる', () => {
    const layout = layoutTree(mkdir(vfs, '/home/second'));
    const home = layout.byPath.get('/home');
    const learner = layout.byPath.get('/home/learner');
    const second = layout.byPath.get('/home/second');
    expect(home).toBeDefined();
    if (!home || !learner || !second) return;
    const top = Math.min(learner.y, second.y);
    const bottom = Math.max(learner.y + learner.height, second.y + second.height);
    expect(home.y + home.height / 2).toBeCloseTo((top + bottom) / 2, 0);
  });

  it('全体の大きさを返す', () => {
    const layout = layoutTree(vfs);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});

describe('差分', () => {
  it('追加・変更・削除を見分ける', () => {
    const next = writeFile(mkdir(vfs, '/tmp2'), '/home/learner/a.txt', 'B');
    const diff = diffVfs(vfs, next);
    expect(diff.added).toContain('/tmp2');
    expect(diff.changed).toContain('/home/learner/a.txt');
    expect(diff.removed).toEqual([]);
  });

  it('前の状態が無ければ空', () => {
    expect(diffVfs(undefined, vfs)).toEqual({ added: [], removed: [], changed: [] });
  });
});
