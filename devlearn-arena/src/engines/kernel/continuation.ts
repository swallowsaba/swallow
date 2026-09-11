import { tokenize } from './tokenizer';

/**
 * その行が求めるヒアドキュメントの終端記号（出てくる順）。
 * 字句として読めない行は、続きを待たずにそのまま実行へ回す。
 */
export function heredocDelimiters(line: string): string[] {
  try {
    return tokenize(line).flatMap((t) => (t.type === 'heredoc' ? [t.delimiter] : []));
  } catch {
    return [];
  }
}

/**
 * 1行ずつ打ち込まれる入力を、実行できる単位にまとめる。
 * 本物のシェルと同じく、ヒアドキュメントの本文は終端記号の行まで同じコマンドに含める。
 */
export interface PendingInput {
  /** ここまでに受け取った行 */
  lines: readonly string[];
  /** まだ現れていない終端記号 */
  waiting: readonly string[];
}

export type FeedResult =
  | { kind: 'run'; text: string }
  | { kind: 'more'; pending: PendingInput };

export function feedLine(pending: PendingInput | null, line: string): FeedResult {
  if (pending === null) {
    // 本文ごと一度に渡されたもの（貼り付けや、画面のボタンから流し込んだもの）はそのまま実行する
    if (line.includes('\n')) return { kind: 'run', text: line };
    const waiting = heredocDelimiters(line);
    if (waiting.length === 0) return { kind: 'run', text: line };
    return { kind: 'more', pending: { lines: [line], waiting } };
  }
  const lines = [...pending.lines, line];
  const waiting = line === pending.waiting[0] ? pending.waiting.slice(1) : pending.waiting;
  if (waiting.length === 0) return { kind: 'run', text: lines.join('\n') };
  return { kind: 'more', pending: { lines, waiting } };
}

/**
 * 改行で区切った複数行の文字列を、実行する順のコマンド列にする。
 * 空行は飛ばす。ヒアドキュメントの本文は、その前の行と同じコマンドになる。
 */
export function splitCommands(text: string): string[] {
  const out: string[] = [];
  let pending: PendingInput | null = null;
  for (const raw of text.split('\n')) {
    const line = pending === null ? raw.trim() : raw;
    if (pending === null && line === '') continue;
    const result = feedLine(pending, line);
    if (result.kind === 'run') {
      out.push(result.text);
      pending = null;
    } else {
      pending = result.pending;
    }
  }
  // 閉じていないヒアドキュメントも捨てずに渡す（実行すれば本物と同じ誤りが出る）
  if (pending !== null) out.push(pending.lines.join('\n'));
  return out;
}
