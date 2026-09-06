/**
 * ブレース展開。`a{1,2}b` → `a1b a2b`、`file{,.txt}` → `file file.txt`、
 * `{1..3}` → `1 2 3`。入れ子にも対応する。
 * 一致する閉じ括弧が無い場合や中身が単一のときは、展開せず元のまま返す（bash と同じ）。
 */
export function expandBraces(word: string): string[] {
  const open = findOpen(word);
  if (open === -1) return [word];
  const close = findClose(word, open);
  if (close === -1) return [word];

  const before = word.slice(0, open);
  const body = word.slice(open + 1, close);
  const after = word.slice(close + 1);

  const parts = splitTop(body);
  const items = parts === null ? expandRange(body) : parts;
  if (items === null) {
    // 展開対象ではない。この括弧は文字として扱い、続きを見る
    const rest = expandBraces(after);
    return rest.map((r) => `${before}{${body}}${r}`);
  }

  const tails = expandBraces(after);
  const out: string[] = [];
  for (const item of items) {
    for (const head of expandBraces(item)) {
      for (const tail of tails) out.push(`${before}${head}${tail}`);
    }
  }
  return out;
}

function findOpen(word: string): number {
  for (let i = 0; i < word.length; i += 1) {
    if (word[i] === '\\') {
      i += 1;
      continue;
    }
    if (word[i] === '{') return i;
  }
  return -1;
}

function findClose(word: string, open: number): number {
  let depth = 0;
  for (let i = open; i < word.length; i += 1) {
    const c = word[i];
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 最上位のカンマで割る。カンマが無ければ null（展開対象ではない） */
function splitTop(body: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let found = false;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i] ?? '';
    if (c === '\\') {
      current += c + (body[i + 1] ?? '');
      i += 1;
      continue;
    }
    if (c === '{') depth += 1;
    if (c === '}') depth -= 1;
    if (c === ',' && depth === 0) {
      parts.push(current);
      current = '';
      found = true;
      continue;
    }
    current += c;
  }
  parts.push(current);
  return found ? parts : null;
}

/** `1..5` や `a..e` を展開する */
function expandRange(body: string): string[] | null {
  const num = /^(-?\d+)\.\.(-?\d+)$/.exec(body);
  if (num?.[1] !== undefined && num[2] !== undefined) {
    const from = Number(num[1]);
    const to = Number(num[2]);
    const step = from <= to ? 1 : -1;
    const out: string[] = [];
    for (let v = from; step > 0 ? v <= to : v >= to; v += step) out.push(String(v));
    return out;
  }
  const alpha = /^([a-zA-Z])\.\.([a-zA-Z])$/.exec(body);
  if (alpha?.[1] !== undefined && alpha[2] !== undefined) {
    const from = alpha[1].charCodeAt(0);
    const to = alpha[2].charCodeAt(0);
    const step = from <= to ? 1 : -1;
    const out: string[] = [];
    for (let v = from; step > 0 ? v <= to : v >= to; v += step) out.push(String.fromCharCode(v));
    return out;
  }
  return null;
}
