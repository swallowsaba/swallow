import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendFile, copy, createVfs, exists, isDir, list, mkdir, move, readFile, remove, stat, touch,
  VfsError, writeFile, type VfsState,
} from './vfs';

let fs: VfsState;

beforeEach(() => {
  fs = createVfs({
    '/home/learner': null,
    '/home/learner/notes.txt': 'hello\n',
    '/home/learner/work/a.txt': 'A',
    '/home/learner/work/b.txt': 'B',
    '/etc/hosts': '127.0.0.1 localhost\n',
  });
});

describe('createVfs', () => {
  it('ルートは常にディレクトリ', () => {
    expect(isDir(fs, '/')).toBe(true);
  });
  it('seed の中間ディレクトリを自動で作る', () => {
    expect(isDir(fs, '/home/learner/work')).toBe(true);
    expect(readFile(fs, '/home/learner/work/a.txt')).toBe('A');
  });
});

describe('読み取り', () => {
  it('ファイルを読む', () => {
    expect(readFile(fs, '/etc/hosts')).toContain('localhost');
  });
  it('無いファイルは ENOENT', () => {
    expect(() => readFile(fs, '/nope')).toThrow(VfsError);
  });
  it('ディレクトリを読むと EISDIR', () => {
    try {
      readFile(fs, '/etc');
      expect.unreachable();
    } catch (e) {
      expect((e as VfsError).code).toBe('EISDIR');
    }
  });
  it('直下の子だけを辞書順で返す', () => {
    expect(list(fs, '/home/learner')).toEqual(['notes.txt', 'work']);
  });
});

describe('書き込みは元の状態を壊さない', () => {
  it('新しい state が返り、元は変わらない', () => {
    const next = writeFile(fs, '/home/learner/new.txt', 'x');
    expect(exists(next, '/home/learner/new.txt')).toBe(true);
    expect(exists(fs, '/home/learner/new.txt')).toBe(false);
  });
  it('append は連結する', () => {
    const next = appendFile(fs, '/home/learner/notes.txt', 'world\n');
    expect(readFile(next, '/home/learner/notes.txt')).toBe('hello\nworld\n');
  });
  it('touch は既存の内容を消さない', () => {
    const next = touch(fs, '/home/learner/notes.txt');
    expect(readFile(next, '/home/learner/notes.txt')).toBe('hello\n');
  });
  it('親が無ければ ENOENT', () => {
    expect(() => writeFile(fs, '/no/such/dir/f.txt', 'x')).toThrow(VfsError);
  });
  it('親がファイルなら ENOTDIR', () => {
    try {
      writeFile(fs, '/etc/hosts/child', 'x');
      expect.unreachable();
    } catch (e) {
      expect((e as VfsError).code).toBe('ENOTDIR');
    }
  });
});

describe('mkdir', () => {
  it('既存を二重に作ると EEXIST', () => {
    expect(() => mkdir(fs, '/etc')).toThrow(VfsError);
  });
  it('-p なら既存でも通る', () => {
    expect(isDir(mkdir(fs, '/etc', true), '/etc')).toBe(true);
  });
  it('-p は中間も作る', () => {
    const next = mkdir(fs, '/a/b/c', true);
    expect(isDir(next, '/a/b')).toBe(true);
  });
});

describe('remove', () => {
  it('空でないディレクトリは ENOTEMPTY', () => {
    try {
      remove(fs, '/home/learner/work');
      expect.unreachable();
    } catch (e) {
      expect((e as VfsError).code).toBe('ENOTEMPTY');
    }
  });
  it('-r なら子ごと消す', () => {
    const next = remove(fs, '/home/learner/work', true);
    expect(exists(next, '/home/learner/work/a.txt')).toBe(false);
    expect(exists(next, '/home/learner/notes.txt')).toBe(true);
  });
});

describe('copy / move', () => {
  it('ファイルをコピーする', () => {
    const next = copy(fs, '/etc/hosts', '/home/learner/hosts');
    expect(readFile(next, '/home/learner/hosts')).toBe(readFile(fs, '/etc/hosts'));
  });
  it('コピー先がディレクトリなら中に入る', () => {
    const next = copy(fs, '/etc/hosts', '/home/learner');
    expect(exists(next, '/home/learner/hosts')).toBe(true);
  });
  it('ディレクトリは -r が要る', () => {
    expect(() => copy(fs, '/home/learner/work', '/tmp2')).toThrow(VfsError);
  });
  it('-r で中身ごとコピーする', () => {
    const next = copy(fs, '/home/learner/work', '/backup', true);
    expect(readFile(next, '/backup/a.txt')).toBe('A');
  });
  it('move は元を消す', () => {
    const next = move(fs, '/home/learner/notes.txt', '/home/learner/renamed.txt');
    expect(exists(next, '/home/learner/notes.txt')).toBe(false);
    expect(readFile(next, '/home/learner/renamed.txt')).toBe('hello\n');
  });
  it('無いものは move できない', () => {
    expect(() => move(fs, '/nope', '/x')).toThrow(VfsError);
  });
  it('stat はノード種別を返す', () => {
    expect(stat(fs, '/etc')?.kind).toBe('dir');
    expect(stat(fs, '/nope')).toBeUndefined();
  });
});
