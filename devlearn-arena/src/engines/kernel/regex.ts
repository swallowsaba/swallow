/**
 * grep / sed が使う正規表現を、JavaScript の正規表現に翻訳する。
 *
 * POSIX の基本正規表現（BRE）は、拡張正規表現（ERE）と
 * 「バックスラッシュの意味が逆」という厄介な関係にある。
 *   BRE: `a\|b` が「または」、`a|b` は文字どおりの縦棒
 *   ERE: `a|b` が「または」、`a\|b` は文字どおりの縦棒
 * 本物に寄せるため、ここで書き換えてから RegExp に渡す。
 */

const BRE_SPECIAL_WITH_BACKSLASH = new Set(['|', '+', '?', '(', ')', '{', '}']);
/** JS 側でエスケープが要る文字 */
const JS_SPECIAL = new Set(['|', '+', '?', '(', ')', '{', '}', '.', '*', '[', ']', '^', '$', '\\', '/']);

export interface TranslateResult {
  source: string;
  error: string | null;
}

/** 文字クラス `[...]` をそのまま写す。閉じ括弧の位置を返す */
function copyBracket(pattern: string, start: number): { text: string; next: number } | null {
  let i = start + 1;
  let text = '[';
  if (pattern[i] === '^') {
    text += '^';
    i += 1;
  }
  // 先頭の ] は文字としての ]
  if (pattern[i] === ']') {
    text += '\\]';
    i += 1;
  }
  while (i < pattern.length && pattern[i] !== ']') {
    const ch = pattern[i] ?? '';
    // POSIX の文字クラス [:digit:] を JS の書き方に直す
    if (ch === '[' && pattern[i + 1] === ':') {
      const end = pattern.indexOf(':]', i + 2);
      if (end !== -1) {
        const name = pattern.slice(i + 2, end);
        const mapped = POSIX_CLASS[name];
        if (mapped !== undefined) {
          text += mapped;
          i = end + 2;
          continue;
        }
      }
    }
    text += ch === '\\' ? '\\\\' : ch;
    i += 1;
  }
  if (i >= pattern.length) return null;
  return { text: `${text}]`, next: i + 1 };
}

const POSIX_CLASS: Record<string, string> = {
  digit: '0-9',
  alpha: 'a-zA-Z',
  alnum: 'a-zA-Z0-9',
  space: ' \\t\\r\\n\\f\\v',
  upper: 'A-Z',
  lower: 'a-z',
  punct: '!-/:-@\\[-`{-~',
  xdigit: '0-9a-fA-F',
};

/**
 * BRE を JS の正規表現の文字列に直す。
 * 拡張（ERE）の場合は `extended` を true にする。
 */
export function translateRegex(pattern: string, extended: boolean): TranslateResult {
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i] ?? '';

    if (ch === '[') {
      const copied = copyBracket(pattern, i);
      if (!copied) return { source: '', error: 'Unmatched [, [^, [:, [., or [=' };
      out += copied.text;
      i = copied.next;
      continue;
    }

    if (ch === '\\') {
      const next = pattern[i + 1];
      if (next === undefined) {
        out += '\\\\';
        i += 1;
        continue;
      }
      if (!extended && BRE_SPECIAL_WITH_BACKSLASH.has(next)) {
        // BRE では \| \( \) \{ \} \+ \? が「特別な意味」を持つ
        out += next;
        i += 2;
        continue;
      }
      if (extended && BRE_SPECIAL_WITH_BACKSLASH.has(next)) {
        // ERE では逆に、バックスラッシュ付きは文字そのもの
        out += `\\${next}`;
        i += 2;
        continue;
      }
      // \. \* \\ \< \> \w \s などはそのまま通す（\< \> は単語境界に直す）
      if (next === '<' || next === '>') {
        out += '\\b';
        i += 2;
        continue;
      }
      out += JS_SPECIAL.has(next) ? `\\${next}` : `\\${next}`;
      i += 2;
      continue;
    }

    if (!extended && BRE_SPECIAL_WITH_BACKSLASH.has(ch)) {
      // BRE では裸の | + ? ( ) { } は文字そのもの
      out += `\\${ch}`;
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }
  return { source: out, error: null };
}

export interface CompileOptions {
  extended?: boolean;
  ignoreCase?: boolean;
  /** 行全体に一致することを求める（grep -x） */
  wholeLine?: boolean;
  /** 正規表現として扱わない（grep -F） */
  fixed?: boolean;
  global?: boolean;
}

export interface CompileResult {
  regex: RegExp | null;
  error: string | null;
}

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** パターンを JS の RegExp にする。読めなければ理由を返す */
export function compilePattern(pattern: string, options: CompileOptions = {}): CompileResult {
  const translated = options.fixed === true
    ? { source: escapeLiteral(pattern), error: null }
    : translateRegex(pattern, options.extended ?? false);
  if (translated.error !== null) return { regex: null, error: translated.error };
  const source = options.wholeLine === true ? `^(?:${translated.source})$` : translated.source;
  const flags = `${options.ignoreCase === true ? 'i' : ''}${options.global === true ? 'g' : ''}`;
  try {
    return { regex: new RegExp(source, flags), error: null };
  } catch {
    return { regex: null, error: `Invalid regular expression: ${pattern}` };
  }
}
