import { describe, expect, it } from 'vitest';
import { feedLine, heredocDelimiters, splitCommands } from './continuation';

describe('ヒアドキュメントの続きを待つ', () => {
  it('終端記号を拾う', () => {
    expect(heredocDelimiters('cat > a <<EOF')).toEqual(['EOF']);
    expect(heredocDelimiters("cat <<'END' > a")).toEqual(['END']);
    expect(heredocDelimiters('echo hi')).toEqual([]);
  });

  it('終端記号の行が来るまで続きを受け取る', () => {
    const first = feedLine(null, 'cat > a <<EOF');
    expect(first.kind).toBe('more');
    if (first.kind !== 'more') return;
    const second = feedLine(first.pending, 'hello');
    expect(second.kind).toBe('more');
    if (second.kind !== 'more') return;
    expect(feedLine(second.pending, 'EOF')).toEqual({ kind: 'run', text: 'cat > a <<EOF\nhello\nEOF' });
  });

  it('普通の行はそのまま実行する', () => {
    expect(feedLine(null, 'ls -l')).toEqual({ kind: 'run', text: 'ls -l' });
  });
});

describe('複数行をコマンド列にする', () => {
  it('1行ずつに分け、空行は飛ばす', () => {
    expect(splitCommands('mkdir a\n\n  cd a  \n')).toEqual(['mkdir a', 'cd a']);
  });

  it('ヒアドキュメントの本文は同じコマンドにまとめる', () => {
    expect(splitCommands('cat > a <<EOF\n  x = 1\nEOF\nls')).toEqual(['cat > a <<EOF\n  x = 1\nEOF', 'ls']);
  });
});
