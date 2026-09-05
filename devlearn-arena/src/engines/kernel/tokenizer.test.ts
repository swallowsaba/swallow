import { describe, expect, it } from 'vitest';
import { ParseError, tokenize, wordText } from './tokenizer';

function words(input: string): string[] {
  return tokenize(input)
    .filter((t): t is Extract<ReturnType<typeof tokenize>[number], { type: 'word' }> => t.type === 'word')
    .map((t) => wordText(t.parts));
}

describe('tokenize', () => {
  it('空白で単語に割る', () => {
    expect(words('ls -la /etc')).toEqual(['ls', '-la', '/etc']);
  });

  it('連続する空白をまとめる', () => {
    expect(words('  echo   a  ')).toEqual(['echo', 'a']);
  });

  it("シングルクォートは展開しない断片になる", () => {
    const token = tokenize("echo '$HOME'")[1];
    expect(token?.type).toBe('word');
    if (token?.type === 'word') {
      expect(token.parts.every((p) => !p.expandable)).toBe(true);
      expect(wordText(token.parts)).toBe('$HOME');
    }
  });

  it('ダブルクォートは展開可能な断片になる', () => {
    const token = tokenize('echo "$HOME"')[1];
    if (token?.type === 'word') {
      expect(token.parts[0]?.expandable).toBe(true);
    }
  });

  it('クォート内の空白は割らない', () => {
    expect(words('echo "a b" c')).toEqual(['echo', 'a b', 'c']);
  });

  it('エスケープした空白は割らない', () => {
    expect(words('cat a\\ b')).toEqual(['cat', 'a b']);
  });

  it('演算子を切り出す', () => {
    const ops = tokenize('a | b && c || d ; e > f >> g < h')
      .filter((t) => t.type === 'op')
      .map((t) => (t.type === 'op' ? t.value : ''));
    expect(ops).toEqual(['|', '&&', '||', ';', '>', '>>', '<']);
  });

  it('ヒアドキュメントの区切り語を取る', () => {
    const token = tokenize('cat <<EOF')[1];
    expect(token).toEqual({ type: 'heredoc', delimiter: 'EOF' });
  });

  it('クォート付きの区切り語も受ける', () => {
    expect(tokenize("cat <<'EOF'")[1]).toEqual({ type: 'heredoc', delimiter: 'EOF' });
  });

  it('閉じないクォートはエラー', () => {
    expect(() => tokenize('echo "abc')).toThrow(ParseError);
    expect(() => tokenize("echo 'abc")).toThrow(ParseError);
  });

  it('バックグラウンド実行は未対応と伝える', () => {
    expect(() => tokenize('sleep 1 &')).toThrow(ParseError);
  });
});
