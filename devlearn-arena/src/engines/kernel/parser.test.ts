import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { wordText } from './tokenizer';
import { ParseError } from './tokenizer';

describe('parse', () => {
  it('パイプで1つのパイプラインにまとめる', () => {
    const list = parse('a | b | c');
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.pipeline.commands).toHaveLength(3);
  });

  it('接続子でパイプラインを分ける', () => {
    const list = parse('a && b || c ; d');
    expect(list.items.map((i) => i.connector)).toEqual(['&&', '||', ';', null]);
  });

  it('リダイレクトを引数から分離する', () => {
    const command = parse('echo hi > out.txt')?.items[0]?.pipeline.commands[0];
    expect(command?.words.map((w) => wordText(w.parts))).toEqual(['echo', 'hi']);
    expect(command?.redirects[0]?.kind).toBe('>');
    expect(wordText(command?.redirects[0]?.target.parts ?? [])).toBe('out.txt');
  });

  it('ヒアドキュメント本文を取り込む', () => {
    const command = parse('cat <<EOF\nline1\nline2\nEOF')?.items[0]?.pipeline.commands[0];
    expect(command?.heredoc).toBe('line1\nline2\n');
  });

  it('閉じないヒアドキュメントはエラー', () => {
    expect(() => parse('cat <<EOF\nline1')).toThrow(ParseError);
  });

  it('リダイレクト先が無ければエラー', () => {
    expect(() => parse('echo hi >')).toThrow(ParseError);
  });

  it('空入力は空のリスト', () => {
    expect(parse('').items).toEqual([]);
  });
});
