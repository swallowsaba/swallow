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

const PRECEDENCE: Record<string, number> = {
  '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6,
};

/** $(( )) の中の整数の計算。名前は変数の値（数でなければ 0）。0 で割ると投げる */
function arithmetic(source: string, vars: ReadonlyMap<string, string>): number {
  const tokens = source.match(/\d+|[A-Za-z_][A-Za-z0-9_]*|\|\||&&|==|!=|<=|>=|[-+*/%()<>!]/g) ?? [];
  let pos = 0;
  const primary = (): number => {
    const t = tokens[pos];
    pos += 1;
    if (t === undefined) throw new Error('式が途中で終わっています');
    if (t === '(') {
      const v = binary(0);
      if (tokens[pos] !== ')') throw new Error(') がありません');
      pos += 1;
      return v;
    }
    if (t === '-') return -primary();
    if (t === '+') return primary();
    if (t === '!') return primary() === 0 ? 1 : 0;
    if (/^\d+$/.test(t)) return Number(t);
    if (/^[A-Za-z_]/.test(t)) {
      const v = Number(vars.get(t) ?? '0');
      return Number.isFinite(v) ? Math.trunc(v) : 0;
    }
    throw new Error(`式の誤り: ${t}`);
  };
  const apply = (op: string, a: number, b: number): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/':
      case '%':
        if (b === 0) throw new Error('division by 0');
        return op === '/' ? Math.trunc(a / b) : a % b;
      case '<': return a < b ? 1 : 0;
      case '<=': return a <= b ? 1 : 0;
      case '>': return a > b ? 1 : 0;
      case '>=': return a >= b ? 1 : 0;
      case '==': return a === b ? 1 : 0;
      case '!=': return a !== b ? 1 : 0;
      case '&&': return a !== 0 && b !== 0 ? 1 : 0;
      default: return a !== 0 || b !== 0 ? 1 : 0;
    }
  };
  function binary(min: number): number {
    let left = primary();
    for (let op = tokens[pos]; op !== undefined && (PRECEDENCE[op] ?? 0) > min; op = tokens[pos]) {
      pos += 1;
      left = apply(op, left, binary(PRECEDENCE[op] ?? 0));
    }
    return left;
  }
  const value = binary(0);
  if (pos < tokens.length) throw new Error(`式の誤り: ${tokens[pos] ?? ''}`);
  return value;
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
    if (next === '(' && text[i + 2] === '(') {
      // $(( 式 )) は整数の計算
      const { body, end } = readSubshell(text, i + 2);
      if (!body.endsWith(')')) throw new Error('$(( が )) で閉じられていません');
      out += String(arithmetic(expandText(body.slice(1, -1), ctx), ctx.vars));
      i = end;
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
