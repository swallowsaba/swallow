/**
 * シェルのトークナイザ。
 * 単語はクォートの種類ごとの断片(parts)として保持する。
 * '...' の中は展開しない、"..." と裸の部分は展開する、という区別を
 * 後段（expand）に渡すために必要。
 */
export type OperatorToken = '|' | '&&' | '||' | ';' | '>' | '>>' | '<';

export interface WordPart {
  text: string;
  /** $VAR や $(...) を展開してよい断片か */
  expandable: boolean;
  /** 展開結果を IFS で単語分割してよい断片か（クォートされていない部分だけ true） */
  splittable: boolean;
}

export type Token =
  | { type: 'word'; parts: WordPart[]; raw: string; quoted: boolean }
  | { type: 'op'; value: OperatorToken }
  | { type: 'heredoc'; delimiter: string };

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

const OPERATOR_CHARS = new Set(['|', '&', ';', '>', '<']);

export function wordText(parts: readonly WordPart[]): string {
  return parts.map((p) => p.text).join('');
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let parts: WordPart[] = [];
  let raw = '';
  let quoted = false;
  let started = false;
  let i = 0;

  const push = (text: string, expandable: boolean, splittable: boolean): void => {
    started = true;
    const last = parts[parts.length - 1];
    if (last && last.expandable === expandable && last.splittable === splittable) last.text += text;
    else parts.push({ text, expandable, splittable });
  };

  const flush = (): void => {
    if (!started) return;
    tokens.push({ type: 'word', parts, raw, quoted });
    parts = [];
    raw = '';
    quoted = false;
    started = false;
  };

  while (i < input.length) {
    const ch = input[i] ?? '';

    if (ch === ' ' || ch === '\t') {
      flush();
      i += 1;
      continue;
    }

    if (ch === '\\') {
      const next = input[i + 1];
      if (next === undefined) throw new ParseError('行末のバックスラッシュは未対応です');
      push(next, false, false);
      raw += ch + next;
      i += 2;
      continue;
    }

    if (ch === "'") {
      const end = input.indexOf("'", i + 1);
      if (end === -1) throw new ParseError("閉じられていない ' があります");
      push(input.slice(i + 1, end), false, false);
      raw += input.slice(i, end + 1);
      quoted = true;
      started = true;
      i = end + 1;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      let buf = '';
      let closed = false;
      while (j < input.length) {
        const c = input[j] ?? '';
        if (c === '\\') {
          const n = input[j + 1] ?? '';
          buf += ['"', '\\', '$', '`'].includes(n) ? n : `\\${n}`;
          j += 2;
          continue;
        }
        if (c === '"') {
          closed = true;
          break;
        }
        buf += c;
        j += 1;
      }
      if (!closed) throw new ParseError('閉じられていない " があります');
      push(buf, true, false);
      raw += input.slice(i, j + 1);
      quoted = true;
      started = true;
      i = j + 1;
      continue;
    }

    if (OPERATOR_CHARS.has(ch)) {
      flush();
      const two = input.slice(i, i + 2);
      if (two === '<<') {
        let j = i + 2;
        while (input[j] === ' ' || input[j] === '\t') j += 1;
        let delimiter = '';
        while (j < input.length && !/[\s;|&<>]/.test(input[j] ?? '')) {
          delimiter += input[j];
          j += 1;
        }
        if (delimiter === '') throw new ParseError('<< の後に区切り語がありません');
        tokens.push({ type: 'heredoc', delimiter: delimiter.replace(/['"]/g, '') });
        i = j;
        continue;
      }
      if (two === '&&' || two === '||' || two === '>>') {
        tokens.push({ type: 'op', value: two });
        i += 2;
        continue;
      }
      if (ch === '&') throw new ParseError('バックグラウンド実行 (&) は未対応です');
      tokens.push({ type: 'op', value: ch as OperatorToken });
      i += 1;
      continue;
    }

    push(ch, true, true);
    raw += ch;
    i += 1;
  }

  flush();
  return tokens;
}
