import { describe, expect, it } from 'vitest';
import { basename, dirname, displayPath, HOME, join, normalize, resolve } from './path';

describe('normalize', () => {
  it('重複スラッシュと . を畳む', () => {
    expect(normalize('/a//b/./c')).toBe('/a/b/c');
  });
  it('.. を解決する', () => {
    expect(normalize('/a/b/../c')).toBe('/a/c');
  });
  it('ルートより上には行けない', () => {
    expect(normalize('/../..')).toBe('/');
  });
  it('相対パスの先頭 .. は残す', () => {
    expect(normalize('../a')).toBe('../a');
  });
  it('末尾スラッシュを落とす', () => {
    expect(normalize('/a/b/')).toBe('/a/b');
    expect(normalize('/')).toBe('/');
  });
  it('空は .', () => {
    expect(normalize('')).toBe('.');
  });
});

describe('resolve', () => {
  it('相対を cwd 基準にする', () => {
    expect(resolve('/a/b', 'c')).toBe('/a/b/c');
    expect(resolve('/a/b', '../c')).toBe('/a/c');
  });
  it('絶対はそのまま', () => {
    expect(resolve('/a/b', '/x')).toBe('/x');
  });
  it('~ を展開する', () => {
    expect(resolve('/tmp', '~')).toBe(HOME);
    expect(resolve('/tmp', '~/work')).toBe(`${HOME}/work`);
  });
});

describe('dirname / basename / join', () => {
  it('親と末尾を取り出す', () => {
    expect(dirname('/a/b/c')).toBe('/a/b');
    expect(dirname('/a')).toBe('/');
    expect(dirname('/')).toBe('/');
    expect(basename('/a/b/c')).toBe('c');
    expect(basename('/')).toBe('/');
    expect(join('/a', 'b')).toBe('/a/b');
  });
});

describe('displayPath', () => {
  it('ホーム配下を ~ に畳む', () => {
    expect(displayPath(HOME)).toBe('~');
    expect(displayPath(`${HOME}/work`)).toBe('~/work');
    expect(displayPath('/etc')).toBe('/etc');
  });
});
