import { describe, expect, it } from 'vitest';
import { expandGlob, globMatch, hasMagic } from './glob';
import { createVfs } from './vfs';

const vfs = createVfs({
  '/home/learner': null,
  '/home/learner/a.txt': '',
  '/home/learner/b.txt': '',
  '/home/learner/c.md': '',
  '/home/learner/.hidden': '',
  '/home/learner/logs/one.log': '',
  '/home/learner/logs/two.log': '',
  '/etc/hosts': '',
});
const cwd = '/home/learner';

describe('globMatch', () => {
  it('* は任意の文字列に一致する', () => {
    expect(globMatch('*.txt', 'a.txt')).toBe(true);
    expect(globMatch('*.txt', 'a.md')).toBe(false);
  });
  it('? は1文字', () => {
    expect(globMatch('?.txt', 'a.txt')).toBe(true);
    expect(globMatch('?.txt', 'ab.txt')).toBe(false);
  });
  it('文字クラスと否定', () => {
    expect(globMatch('[ab].txt', 'a.txt')).toBe(true);
    expect(globMatch('[!ab].txt', 'c.txt')).toBe(true);
    expect(globMatch('[!ab].txt', 'a.txt')).toBe(false);
  });
  it('. は特別扱いしない', () => {
    expect(globMatch('a.txt', 'axtxt')).toBe(false);
  });
  it('* は / を跨がない', () => {
    expect(globMatch('*', 'logs/one.log')).toBe(false);
  });
  it('hasMagic が判定する', () => {
    expect(hasMagic('*.txt')).toBe(true);
    expect(hasMagic('plain.txt')).toBe(false);
  });
});

describe('expandGlob', () => {
  it('カレントの一致を辞書順で返す', () => {
    expect(expandGlob(vfs, cwd, '*.txt')).toEqual(['a.txt', 'b.txt']);
  });
  it('隠しファイルは既定で含めない', () => {
    expect(expandGlob(vfs, cwd, '*')).not.toContain('.hidden');
  });
  it('. で始まるパターンなら隠しファイルも対象', () => {
    expect(expandGlob(vfs, cwd, '.*')).toEqual(['.hidden']);
  });
  it('サブディレクトリを跨げる', () => {
    expect(expandGlob(vfs, cwd, 'logs/*.log')).toEqual(['logs/one.log', 'logs/two.log']);
  });
  it('絶対パスでも展開できる', () => {
    expect(expandGlob(vfs, cwd, '/etc/*')).toEqual(['/etc/hosts']);
  });
  it('一致が無ければ空', () => {
    expect(expandGlob(vfs, cwd, '*.zip')).toEqual([]);
  });
  it('magic が無ければ空（呼び出し側でそのまま扱う）', () => {
    expect(expandGlob(vfs, cwd, 'a.txt')).toEqual([]);
  });
});
