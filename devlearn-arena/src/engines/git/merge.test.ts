import { describe, expect, it } from 'vitest';
import { mergeThreeWay } from './merge';

const base = 'a\nb\nc\n';

describe('3-way マージ', () => {
  it('片方だけが変えたなら、その変更を採る', () => {
    const result = mergeThreeWay(base, base, 'a\nB\nc\n');
    expect(result.conflicted).toBe(false);
    expect(result.content).toBe('a\nB\nc\n');
  });

  it('反対側だけの変更も採る', () => {
    expect(mergeThreeWay(base, 'a\nb\nC\n', base).content).toBe('a\nb\nC\n');
  });

  it('双方が同じ変更をしたら衝突しない', () => {
    const result = mergeThreeWay(base, 'a\nX\nc\n', 'a\nX\nc\n');
    expect(result.conflicted).toBe(false);
    expect(result.content).toBe('a\nX\nc\n');
  });

  it('離れた行の変更は両方とも採れる', () => {
    const result = mergeThreeWay('1\n2\n3\n4\n5\n', 'ONE\n2\n3\n4\n5\n', '1\n2\n3\n4\nFIVE\n');
    expect(result.conflicted).toBe(false);
    expect(result.content).toContain('ONE');
    expect(result.content).toContain('FIVE');
  });

  it('同じ行を別の内容に変えたら衝突する', () => {
    const result = mergeThreeWay(base, 'a\nOURS\nc\n', 'a\nTHEIRS\nc\n');
    expect(result.conflicted).toBe(true);
    expect(result.content).toContain('<<<<<<< HEAD');
    expect(result.content).toContain('OURS');
    expect(result.content).toContain('=======');
    expect(result.content).toContain('THEIRS');
    expect(result.content).toContain('>>>>>>> branch');
  });

  it('衝突マーカのラベルを指定できる', () => {
    const result = mergeThreeWay(base, 'a\nX\nc\n', 'a\nY\nc\n', { ours: 'main', theirs: 'topic' });
    expect(result.content).toContain('<<<<<<< main');
    expect(result.content).toContain('>>>>>>> topic');
  });

  it('変更が無ければそのまま', () => {
    expect(mergeThreeWay(base, base, base)).toEqual({ content: base, conflicted: false });
  });
});
