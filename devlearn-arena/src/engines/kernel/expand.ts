import type { Word } from './ast';

export interface ExpandContext {
  vars: ReadonlyMap<string, string>;
  lastExit: number;
  /** $( ... ) の実行。標準出力を返す（末尾改行は落とす） */
  runSubshell: (input: string) => string;
}

function readName(source: string, start: number): { name: string; end: number } {
  let i = start;
  while (i < source.length && /[A-Za-z0-9_]/.test(source[i] ?? '')) i += 1;
  return { name: source.slice(start, i), end: i };
}

/** 対応する ) までを返す（ネスト対応） */
function readSubshell(source: string, start: number): { body: string; end: number } {
  let depth = 1;
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return { body: source.slice(start, i), end: i + 1 };
    }
    i += 1;
  }
  throw new Error('$( が ) で閉じられていません');
}

function expandText(text: string, ctx: ExpandContext): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? '';
    if (ch !== '$') {
      out += ch;
      i += 1;
      continue;
    }
    const next = text[i + 1];
    if (next === undefined) {
      out += '$';
      break;
    }
    if (next === '?') {
      out += String(ctx.lastExit);
      i += 2;
      continue;
    }
    if (next === '(') {
      const { body, end } = readSubshell(text, i + 2);
      out += ctx.runSubshell(body).replace(/\n+$/, '');
      i = end;
      continue;
    }
    if (next === '{') {
      const close = text.indexOf('}', i + 2);
      if (close === -1) throw new Error('${ が } で閉じられていません');
      const name = text.slice(i + 2, close);
      out += ctx.vars.get(name) ?? '';
      i = close + 1;
      continue;
    }
    const { name, end } = readName(text, i + 1);
    if (name === '') {
      out += '$';
      i += 1;
      continue;
    }
    out += ctx.vars.get(name) ?? '';
    i = end;
  }
  return out;
}

/** リダイレクト先など、分割してはいけない場所で使う。 */
export function expandWord(word: Word, ctx: ExpandContext): string {
  return word.parts.map((p) => (p.expandable ? expandText(p.text, ctx) : p.text)).join('');
}

const IFS = /[ \t\n]+/;

/**
 * 1単語を展開してフィールド列にする。
 * クォートされていない展開結果だけが IFS で分割される。
 * 展開結果が空でクォートも無ければフィールドごと消える（bash と同じ）。
 */
export function expandWordFields(word: Word, ctx: ExpandContext): string[] {
  const fields: string[] = [''];
  let hadQuoted = false;

  const appendLast = (text: string): void => {
    fields[fields.length - 1] = (fields[fields.length - 1] ?? '') + text;
  };

  for (const part of word.parts) {
    if (!part.expandable) {
      hadQuoted = true;
      appendLast(part.text);
      continue;
    }
    const text = expandText(part.text, ctx);
    if (!part.splittable) {
      hadQuoted = true;
      appendLast(text);
      continue;
    }
    const pieces = text.split(IFS);
    appendLast(pieces[0] ?? '');
    for (const piece of pieces.slice(1)) fields.push(piece);
  }

  if (fields.length === 1 && fields[0] === '') return hadQuoted ? [''] : [];
  return fields.filter((f) => f !== '');
}
