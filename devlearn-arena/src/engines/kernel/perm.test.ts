import { describe, expect, it } from 'vitest';
import {
  allows, applyModeSpec, BASE_DIR_MODE, BASE_FILE_MODE, defaultMeta, formatMode, formatOctal,
  parseUmask, withUmask,
} from './perm';

describe('権限の表示', () => {
  it('8 進数から rwx の並びにする', () => {
    expect(formatMode(0o644, false)).toBe('-rw-r--r--');
    expect(formatMode(0o755, true)).toBe('drwxr-xr-x');
    expect(formatMode(0o600, false)).toBe('-rw-------');
    expect(formatMode(0o777, false)).toBe('-rwxrwxrwx');
    expect(formatMode(0, false)).toBe('----------');
  });

  it('8 進数の文字列にする', () => {
    expect(formatOctal(0o644)).toBe('644');
    expect(formatOctal(0o7)).toBe('007');
  });
});

describe('chmod の指定を読む', () => {
  it('8 進数はそのまま', () => {
    expect(applyModeSpec(0o644, '755', false)).toBe(0o755);
    expect(applyModeSpec(0o644, '0600', false)).toBe(0o600);
  });

  it('記号で足し引きできる', () => {
    expect(applyModeSpec(0o644, 'u+x', false)).toBe(0o744);
    expect(applyModeSpec(0o644, 'go-r', false)).toBe(0o600);
    expect(applyModeSpec(0o644, 'a=r', false)).toBe(0o444);
    expect(applyModeSpec(0o644, '+x', false)).toBe(0o755);
  });

  it('カンマで並べられる', () => {
    expect(applyModeSpec(0o000, 'u=rw,g=r,o=', false)).toBe(0o640);
  });

  it('X はディレクトリか、既に x があるときだけ効く', () => {
    expect(applyModeSpec(0o644, 'a+X', false)).toBe(0o644);
    expect(applyModeSpec(0o644, 'a+X', true)).toBe(0o755);
    expect(applyModeSpec(0o744, 'a+X', false)).toBe(0o755);
  });

  it('読めない指定は null', () => {
    expect(applyModeSpec(0o644, 'z+x', false)).toBeNull();
    expect(applyModeSpec(0o644, 'rwx', false)).toBeNull();
    expect(applyModeSpec(0o644, '8', false)).toBeNull();
  });
});

describe('許可の判定', () => {
  const meta = { mode: 0o640, owner: 'alice', group: 'alice' };

  it('所有者は所有者のビットで判定する', () => {
    expect(allows(meta, 'alice', 'read')).toBe(true);
    expect(allows(meta, 'alice', 'write')).toBe(true);
    expect(allows(meta, 'alice', 'exec')).toBe(false);
  });

  it('他人は others のビットで判定する', () => {
    expect(allows(meta, 'bob', 'read')).toBe(false);
    expect(allows({ ...meta, mode: 0o644 }, 'bob', 'read')).toBe(true);
  });

  it('root は常に通る', () => {
    expect(allows({ mode: 0, owner: 'alice', group: 'alice' }, 'root', 'write')).toBe(true);
  });
});

describe('umask', () => {
  it('出発点（ファイル 666 / ディレクトリ 777）から権限を落とす', () => {
    expect(withUmask(BASE_FILE_MODE, 0o022)).toBe(0o644);
    expect(withUmask(BASE_DIR_MODE, 0o022)).toBe(0o755);
    expect(withUmask(BASE_FILE_MODE, 0o077)).toBe(0o600);
    expect(withUmask(BASE_DIR_MODE, 0o077)).toBe(0o700);
    expect(withUmask(BASE_FILE_MODE, 0o002)).toBe(0o664);
  });

  it('ファイルに x が付かないのは出発点に x が無いから', () => {
    expect(BASE_FILE_MODE & 0o111).toBe(0);
    expect(withUmask(BASE_FILE_MODE, 0)).toBe(0o666);
  });

  it('既定の権限は出発点とは別（読み込んだファイルに使う）', () => {
    expect(defaultMeta(false).mode).toBe(0o644);
    expect(defaultMeta(true).mode).toBe(0o755);
  });

  it('8 進数として読む', () => {
    expect(parseUmask('022')).toBe(0o022);
    expect(parseUmask('7')).toBe(7);
    expect(parseUmask('abc')).toBeNull();
    expect(parseUmask('999')).toBeNull();
  });
});
