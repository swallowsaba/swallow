import type { Command, CommandList, CompoundCommand, Connector, ListItem, Pipeline, Redirect, SimpleCommand, Word } from './ast';
import { ParseError, tokenize, wordText, type OperatorToken, type Token } from './tokenizer';

/** 終わりの語（fi・done など）が来る前に入力が尽きた。端末は続きの行を待てる */
export class IncompleteError extends ParseError {
  constructor(message: string) {
    super(message);
    this.name = 'IncompleteError';
  }
}

const REDIRECTS = new Set(['>', '>>', '<', '2>', '2>>', '&>', '&>>', '2>&1', '>&2']);
/** 行き先の付け替え。後ろにファイル名を取らない */
const DUPS = new Set(['2>&1', '>&2']);

/** 読む単位。行の終わり（newline）は ; と同じ区切り。ヒアドキュメントは本文を持つ */
type Item =
  | Extract<Token, { type: 'word' }>
  | { type: 'op'; value: OperatorToken }
  | { type: 'heredoc'; delimiter: string; body: string }
  | { type: 'newline' };

function toWord(token: Extract<Token, { type: 'word' }>): Word {
  return { parts: token.parts, raw: token.raw, quoted: token.quoted };
}

/** 行ごとに字句に分け、ヒアドキュメントの本文は、その後の行から区切り語の行まで取り込む */
function lex(input: string): Item[] {
  const lines = input.split('\n');
  const items: Item[] = [];
  let i = 0;
  while (i < lines.length) {
    const tokens = tokenize(lines[i] ?? '');
    i += 1;
    for (const t of tokens) {
      if (t.type !== 'heredoc') {
        items.push(t);
        continue;
      }
      const body: string[] = [];
      let closed = false;
      while (i < lines.length) {
        const line = lines[i] ?? '';
        i += 1;
        if (line === t.delimiter) {
          closed = true;
          break;
        }
        body.push(line);
      }
      if (!closed) throw new ParseError(`ヒアドキュメントが ${t.delimiter} で閉じられていません`);
      items.push({ type: 'heredoc', delimiter: t.delimiter, body: body.length === 0 ? '' : `${body.join('\n')}\n` });
    }
    items.push({ type: 'newline' });
  }
  return items;
}

/** 予約語。コマンドの頭に、引用符無しで書いた時だけ予約語として読む */
const OPENERS = new Set(['if', 'for', 'while', 'until']);
const CLOSERS = new Set(['then', 'elif', 'else', 'fi', 'do', 'done']);

/**
 * 1 入力を読む。パイプ・&&・||・;・行の区切り・リダイレクト・ヒアドキュメントと、
 * 組み立ての形（if … then … elif … else … fi ／ for 名前 in 語 …; do … done ／ while・until … do … done）
 */
export function parse(input: string): CommandList {
  const items = lex(input);
  let pos = 0;

  const peek = (): Item | undefined => items[pos];
  const reserved = (it: Item | undefined): string | null =>
    it?.type === 'word' && !it.quoted ? wordText(it.parts) : null;
  const atWord = (word: string): boolean => reserved(peek()) === word;
  const skipNewlines = (): void => {
    while (peek()?.type === 'newline') pos += 1;
  };
  const skipSeparators = (): void => {
    for (let it = peek(); it?.type === 'newline' || (it?.type === 'op' && it.value === ';'); it = peek()) pos += 1;
  };
  const expect = (word: string, opener: string): void => {
    if (atWord(word)) {
      pos += 1;
      return;
    }
    if (peek() === undefined) throw new IncompleteError(`${opener} に対応する ${word} がありません`);
    throw new ParseError(`${opener} の後に ${word} が要ります`);
  };

  /** そのリダイレクトの行き先を読む（演算子は読み終えた所から） */
  const readRedirect = (op: string, into: Redirect[]): void => {
    if (DUPS.has(op)) {
      into.push({ kind: op as Redirect['kind'], target: { parts: [], raw: '', quoted: false } });
      return;
    }
    const next = peek();
    if (next?.type !== 'word') throw new ParseError(`${op} の後にファイル名がありません`);
    into.push({ kind: op as Redirect['kind'], target: toWord(next) });
    pos += 1;
  };

  const trailingRedirects = (): Redirect[] => {
    const out: Redirect[] = [];
    for (let it = peek(); it?.type === 'op' && REDIRECTS.has(it.value); it = peek()) {
      pos += 1;
      readRedirect(it.value, out);
    }
    return out;
  };

  const parseSimple = (): SimpleCommand => {
    const cmd: SimpleCommand = { words: [], redirects: [] };
    for (let it = peek(); it !== undefined; it = peek()) {
      if (it.type === 'newline') break;
      if (it.type === 'word') {
        cmd.words.push(toWord(it));
        pos += 1;
        continue;
      }
      if (it.type === 'heredoc') {
        cmd.heredoc = it.body;
        pos += 1;
        continue;
      }
      if (REDIRECTS.has(it.value)) {
        pos += 1;
        readRedirect(it.value, cmd.redirects);
        continue;
      }
      break;
    }
    if (cmd.words.length === 0 && cmd.redirects.length === 0 && cmd.heredoc === undefined) {
      const it = peek();
      throw new ParseError(it?.type === 'op' ? `${it.value} の前にコマンドがありません` : 'コマンドがありません');
    }
    return cmd;
  };

  const parseIf = (): CompoundCommand => {
    pos += 1;
    const clauses: { cond: CommandList; body: CommandList }[] = [];
    let opener = 'if';
    for (;;) {
      const cond = parseList(new Set(['then']), opener);
      expect('then', opener);
      const body = parseList(new Set(['elif', 'else', 'fi']), 'then');
      clauses.push({ cond, body });
      if (atWord('elif')) {
        pos += 1;
        opener = 'elif';
        continue;
      }
      break;
    }
    let otherwise: CommandList | null = null;
    if (atWord('else')) {
      pos += 1;
      otherwise = parseList(new Set(['fi']), 'else');
    }
    expect('fi', 'if');
    return { kind: 'if', clauses, otherwise, redirects: trailingRedirects() };
  };

  const parseFor = (): CompoundCommand => {
    pos += 1;
    const nameItem = peek();
    const name = nameItem?.type === 'word' ? wordText(nameItem.parts) : '';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      if (nameItem === undefined) throw new IncompleteError('for の後に変数の名前がありません');
      throw new ParseError('for の後に変数の名前が要ります');
    }
    pos += 1;
    let words: Word[] | null = null;
    skipNewlines();
    if (atWord('in')) {
      pos += 1;
      words = [];
      for (let it = peek(); it?.type === 'word'; it = peek()) {
        words.push(toWord(it));
        pos += 1;
      }
    }
    skipSeparators();
    expect('do', 'for');
    const body = parseList(new Set(['done']), 'do');
    expect('done', 'for');
    return { kind: 'for', name, words, body, redirects: trailingRedirects() };
  };

  const parseWhile = (until: boolean): CompoundCommand => {
    const opener = until ? 'until' : 'while';
    pos += 1;
    const cond = parseList(new Set(['do']), opener);
    expect('do', opener);
    const body = parseList(new Set(['done']), 'do');
    expect('done', opener);
    return { kind: 'while', until, cond, body, redirects: trailingRedirects() };
  };

  const parseCommand = (): Command => {
    const word = reserved(peek());
    if (word === 'if') return parseIf();
    if (word === 'for') return parseFor();
    if (word === 'while' || word === 'until') return parseWhile(word === 'until');
    if (word !== null && CLOSERS.has(word)) throw new ParseError(`思いがけない ${word} があります`);
    return parseSimple();
  };

  const parsePipeline = (): Pipeline => {
    const commands: Command[] = [parseCommand()];
    for (let it = peek(); it?.type === 'op' && it.value === '|'; it = peek()) {
      pos += 1;
      skipNewlines();
      if (peek() === undefined) throw new IncompleteError('| の後にコマンドがありません');
      commands.push(parseCommand());
    }
    return { commands };
  };

  /** 終わりの語（stop）か入力の終わりまでを読む。inside は、その中を読んでいる組み立ての語（閉じていない時の文に使う） */
  function parseList(stop: ReadonlySet<string>, inside: string | null): CommandList {
    const list: ListItem[] = [];
    const byNewline = new Set<ListItem>();
    for (;;) {
      skipSeparators();
      const it = peek();
      if (it === undefined) {
        if (inside !== null) throw new IncompleteError(`${inside} が閉じられていません`);
        break;
      }
      const word = reserved(it);
      if (word !== null && stop.has(word)) break;
      if (word !== null && CLOSERS.has(word) && !OPENERS.has(word)) throw new ParseError(`思いがけない ${word} があります`);
      const pipeline = parsePipeline();
      const next = peek();
      let connector: Connector = null;
      if (next?.type === 'op' && (next.value === '&&' || next.value === '||')) {
        connector = next.value;
        pos += 1;
        skipNewlines();
        if (peek() === undefined) {
          if (inside !== null) throw new IncompleteError(`${next.value} の後にコマンドがありません`);
          throw new ParseError(`${next.value} の後にコマンドがありません`);
        }
      } else if (next?.type === 'op' && next.value === ';') {
        connector = ';';
        pos += 1;
      } else if (next?.type === 'newline') {
        connector = ';';
        pos += 1;
      } else if (next !== undefined && !(next.type === 'word' && stop.has(reserved(next) ?? ''))) {
        throw new ParseError(`${next.type === 'op' ? next.value : '思いがけない語'} は使えません`);
      }
      const item: ListItem = { pipeline, connector };
      if (next?.type === 'newline') byNewline.add(item);
      list.push(item);
    }
    // 最後の区切りが行の終わりなら、続きは無い（null）。書いた ; は書いた通りに残す
    const last = list[list.length - 1];
    if (last && byNewline.has(last)) last.connector = null;
    return { items: list };
  }

  return parseList(new Set(), null);
}
