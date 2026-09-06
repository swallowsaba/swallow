import { describe, expect, it } from 'vitest';
import { expandBraces } from './brace';

describe('ブレース展開', () => {
  it('カンマ区切りを展開する', () => {
    expect(expandBraces('a{1,2}b')).toEqual(['a1b', 'a2b']);
  });

  it('空の要素も1つとして扱う（file{,.txt} の形）', () => {
    expect(expandBraces('reports/hosts{,.txt}')).toEqual(['reports/hosts', 'reports/hosts.txt']);
  });

  it('数値の範囲を展開する', () => {
    expect(expandBraces('log{1..3}')).toEqual(['log1', 'log2', 'log3']);
  });

  it('逆順の範囲も扱う', () => {
    expect(expandBraces('{3..1}')).toEqual(['3', '2', '1']);
  });

  it('英字の範囲を展開する', () => {
    expect(expandBraces('{a..c}')).toEqual(['a', 'b', 'c']);
  });

  it('入れ子を展開する', () => {
    expect(expandBraces('{a,b{1,2}}')).toEqual(['a', 'b1', 'b2']);
  });

  it('複数のグループを組み合わせる', () => {
    expect(expandBraces('{x,y}{1,2}')).toEqual(['x1', 'x2', 'y1', 'y2']);
  });

  it('カンマも範囲も無ければ展開しない', () => {
    expect(expandBraces('a{b}c')).toEqual(['a{b}c']);
  });

  it('閉じ括弧が無ければそのまま', () => {
    expect(expandBraces('a{b,c')).toEqual(['a{b,c']);
  });

  it('括弧が無ければそのまま', () => {
    expect(expandBraces('plain.txt')).toEqual(['plain.txt']);
  });
});
