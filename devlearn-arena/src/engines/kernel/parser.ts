import type { CommandList, ListItem, Pipeline, Redirect, SimpleCommand, Word } from './ast';
import { ParseError, tokenize, type Token } from './tokenizer';

function toWord(token: Extract<Token, { type: 'word' }>): Word {
  return { parts: token.parts, raw: token.raw, quoted: token.quoted };
}

/**
 * 1入力をパースする。
 * ヒアドキュメントは「1行目がコマンド行、2行目以降が本文」という形で受け取る。
 */
export function parse(input: string): CommandList {
  const lines = input.split('\n');
  const first = lines[0] ?? '';
  const rest = lines.slice(1);
  const tokens = tokenize(first);

  let restIndex = 0;
  const readHeredoc = (delimiter: string): string => {
    const body: string[] = [];
    while (restIndex < rest.length) {
      const line = rest[restIndex] ?? '';
      restIndex += 1;
      if (line === delimiter) return body.length === 0 ? '' : `${body.join('\n')}\n`;
      body.push(line);
    }
    throw new ParseError(`ヒアドキュメントが ${delimiter} で閉じられていません`);
  };

  const items: ListItem[] = [];
  let commands: SimpleCommand[] = [];
  let current: SimpleCommand = { words: [], redirects: [] };

  const endCommand = (): void => {
    if (current.words.length === 0 && current.redirects.length === 0 && current.heredoc === undefined) {
      throw new ParseError('コマンドがありません');
    }
    commands.push(current);
    current = { words: [], redirects: [] };
  };

  const endPipeline = (connector: '&&' | '||' | ';' | null): void => {
    endCommand();
    const pipeline: Pipeline = { commands };
    items.push({ pipeline, connector });
    commands = [];
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;

    if (token.type === 'word') {
      current.words.push(toWord(token));
      continue;
    }

    if (token.type === 'heredoc') {
      current.heredoc = readHeredoc(token.delimiter);
      continue;
    }

    if (token.value === '>' || token.value === '>>' || token.value === '<') {
      const next = tokens[i + 1];
      if (!next || next.type !== 'word') throw new ParseError(`${token.value} の後にファイル名がありません`);
      const redirect: Redirect = { kind: token.value, target: toWord(next) };
      current.redirects.push(redirect);
      i += 1;
      continue;
    }

    if (token.value === '|') {
      endCommand();
      continue;
    }

    endPipeline(token.value);
  }

  if (current.words.length > 0 || current.redirects.length > 0 || commands.length > 0) {
    endPipeline(null);
  }

  return { items };
}
