import { describe, expect, it } from 'vitest';
import { diffLines, formatUnified, toHunks } from './diff';

describe('diffLines', () => {
  it('同一なら全て equal', () => {
    expect(diffLines(['a', 'b'], ['a', 'b']).every((o) => o.kind === 'equal')).toBe(true);
  });
  it('追加を検出する', () => {
    const ops = diffLines(['a'], ['a', 'b']);
    expect(ops.map((o) => o.kind)).toEqual(['equal', 'insert']);
  });
  it('削除を検出する', () => {
    const ops = diffLines(['a', 'b'], ['a']);
    expect(ops.map((o) => o.kind)).toEqual(['equal', 'delete']);
  });
  it('置換は削除と追加になる', () => {
    const ops = diffLines(['a', 'x', 'c'], ['a', 'y', 'c']);
    expect(ops.map((o) => o.kind)).toEqual(['equal', 'delete', 'insert', 'equal']);
  });
  it('共通部分を最大化する', () => {
    const ops = diffLines(['a', 'b', 'c', 'd'], ['a', 'c', 'd']);
    expect(ops.filter((o) => o.kind === 'equal').map((o) => o.line)).toEqual(['a', 'c', 'd']);
  });
  it('空同士は空', () => {
    expect(diffLines([], [])).toEqual([]);
  });
});

describe('unified 形式', () => {
  it('差分が無ければ空文字', () => {
    expect(formatUnified(['a'], ['a'], { from: 'x', to: 'y' })).toBe('');
  });
  it('ヘッダとハンクを出す', () => {
    const out = formatUnified(['a', 'b', 'c'], ['a', 'B', 'c'], { from: 'old', to: 'new' });
    expect(out).toContain('--- old');
    expect(out).toContain('+++ new');
    expect(out).toContain('@@');
    expect(out).toContain('-b');
    expect(out).toContain('+B');
  });
  it('離れた変更は別ハンクになる', () => {
    const a = Array.from({ length: 20 }, (_, i) => `line${String(i)}`);
    const b = [...a];
    b[1] = 'changed';
    b[18] = 'changed';
    expect(toHunks(diffLines(a, b), 1)).toHaveLength(2);
  });
});
