/**
 * 本文（Rich）を読む（docs/content-spec.md 2.1）。用語は {{term:ID}} で書き、画面で用語の説明に変わる。
 * `...` で囲んだ所はコマンドやファイルの名前（等幅で出す）。
 */

export type RichPart =
  | { kind: 'text'; text: string }
  | { kind: 'term'; id: string }
  | { kind: 'code'; text: string };

const TOKEN = /\{\{term:([a-z0-9-]+)\}\}|`([^`]+)`/g;

export function parseRich(rich: string): RichPart[] {
  const parts: RichPart[] = [];
  let last = 0;
  for (const m of rich.matchAll(TOKEN)) {
    if (m.index > last) parts.push({ kind: 'text', text: rich.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ kind: 'term', id: m[1] });
    else parts.push({ kind: 'code', text: m[2] ?? '' });
    last = m.index + m[0].length;
  }
  if (last < rich.length) parts.push({ kind: 'text', text: rich.slice(last) });
  return parts;
}

/** 本文に出る用語の ID（出た順） */
export function termsIn(rich: string): string[] {
  return parseRich(rich).flatMap((p) => (p.kind === 'term' ? [p.id] : []));
}

/** 用語の印を、その用語の語に置き換えた、画面に出る文字（検索や文字数の計算に使う） */
export function plainText(rich: string, wordOf: (id: string) => string): string {
  return parseRich(rich).map((p) => (p.kind === 'term' ? wordOf(p.id) : p.text)).join('');
}
