/**
 * 行単位の差分。LCS（最長共通部分列）で求める。
 * P2 の 3-way マージとコンフリクトマーカ生成でも同じ実装を使う。
 */
export type DiffOp = { kind: 'equal' | 'insert' | 'delete'; line: string };

/** 動的計画法で LCS 表を作り、後ろから辿って操作列にする。 */
export function diffLines(a: readonly string[], b: readonly string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const row = table[i];
      const nextRow = table[i + 1];
      if (!row || !nextRow) continue;
      row[j] = a[i] === b[j] ? (nextRow[j + 1] ?? 0) + 1 : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'equal', line: a[i] ?? '' });
      i += 1;
      j += 1;
      continue;
    }
    const down = table[i + 1]?.[j] ?? 0;
    const right = table[i]?.[j + 1] ?? 0;
    if (down >= right) {
      ops.push({ kind: 'delete', line: a[i] ?? '' });
      i += 1;
    } else {
      ops.push({ kind: 'insert', line: b[j] ?? '' });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ kind: 'delete', line: a[i] ?? '' });
    i += 1;
  }
  while (j < m) {
    ops.push({ kind: 'insert', line: b[j] ?? '' });
    j += 1;
  }
  return ops;
}

export interface Hunk {
  aStart: number;
  aCount: number;
  bStart: number;
  bCount: number;
  lines: string[];
}

/** unified diff のハンクに畳む。context は前後に残す行数。 */
export function toHunks(ops: readonly DiffOp[], context = 3): Hunk[] {
  const changedIndexes = ops.flatMap((op, i) => (op.kind === 'equal' ? [] : [i]));
  if (changedIndexes.length === 0) return [];

  const ranges: [number, number][] = [];
  for (const index of changedIndexes) {
    const from = Math.max(0, index - context);
    const to = Math.min(ops.length - 1, index + context);
    const last = ranges[ranges.length - 1];
    if (last && from <= last[1] + 1) last[1] = to;
    else ranges.push([from, to]);
  }

  const hunks: Hunk[] = [];
  let aLine = 1;
  let bLine = 1;
  const positions = ops.map((op) => {
    const pos = { a: aLine, b: bLine };
    if (op.kind !== 'insert') aLine += 1;
    if (op.kind !== 'delete') bLine += 1;
    return pos;
  });

  for (const [from, to] of ranges) {
    const slice = ops.slice(from, to + 1);
    const start = positions[from] ?? { a: 1, b: 1 };
    hunks.push({
      aStart: start.a,
      aCount: slice.filter((o) => o.kind !== 'insert').length,
      bStart: start.b,
      bCount: slice.filter((o) => o.kind !== 'delete').length,
      lines: slice.map((o) => `${o.kind === 'insert' ? '+' : o.kind === 'delete' ? '-' : ' '}${o.line}`),
    });
  }
  return hunks;
}

export function formatUnified(
  a: readonly string[],
  b: readonly string[],
  labels: { from: string; to: string },
  context = 3,
): string {
  const hunks = toHunks(diffLines(a, b), context);
  if (hunks.length === 0) return '';
  const out = [`--- ${labels.from}`, `+++ ${labels.to}`];
  for (const hunk of hunks) {
    out.push(
      `@@ -${String(hunk.aStart)},${String(hunk.aCount)} +${String(hunk.bStart)},${String(hunk.bCount)} @@`,
    );
    out.push(...hunk.lines);
  }
  return `${out.join('\n')}\n`;
}
