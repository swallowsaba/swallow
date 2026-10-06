/**
 * DB の実戦の判定（docs/content-spec.md 2.4 の sql）と、結果の形。sql.js を読まない（判定だけを使う所に、SQLite の本体を載せない）。
 * DB を開くのは src/engines/db/db.ts
 */

export type SqlValue = number | string | Uint8Array | null;

export type Row = Record<string, SqlValue>;

export interface ResultSet {
  columns: string[];
  rows: SqlValue[][];
}

export type ExecOutcome = { ok: true; results: ResultSet[]; changes: number } | { ok: false; error: string };

export interface SqlDb {
  /** 1 つ以上の文を実行する（エラーの文は SQLite のまま） */
  exec: (statement: string) => ExecOutcome;
  /** 問い合わせの結果を、列の名前の付いた行で返す */
  rows: (query: string) => Row[];
  close: () => void;
}

/**
 * 問い合わせの結果が、期待する値と一致するか。期待する値は、行の並び（列の名前の付いた物）か、1 つの値（1 行 1 列の結果）
 */
export function matchesExpected(db: SqlDb, query: string, expected: unknown): boolean {
  let rows: Row[];
  try {
    rows = db.rows(query);
  } catch {
    return false;
  }
  if (!Array.isArray(expected)) {
    const only = rows[0];
    return rows.length === 1 && only !== undefined && Object.keys(only).length === 1 && Object.values(only)[0] === expected;
  }
  return JSON.stringify(rows) === JSON.stringify(expected);
}

/** 結果を、端末に出す表の形にする（sqlite3 の -box に近い） */
export function formatResult(r: ResultSet): string {
  const cells = [r.columns, ...r.rows.map((row) => row.map((v) => (v === null ? 'NULL' : String(v))))];
  const widths = r.columns.map((_, i) => Math.max(...cells.map((row) => [...(row[i] ?? '')].length)));
  const line = (row: string[]): string => `│ ${row.map((c, i) => c.padEnd(widths[i] ?? 0)).join(' │ ')} │`;
  const bar = (l: string, m: string, rr: string): string => `${l}${widths.map((w) => '─'.repeat(w + 2)).join(m)}${rr}`;
  return [bar('┌', '┬', '┐'), line(cells[0] ?? []), bar('├', '┼', '┤'), ...cells.slice(1).map(line), bar('└', '┴', '┘')].join('\n');
}

/** SQLite の WebAssembly のファイルの場所（ブラウザでは、画面の入口が同梱したファイルの URL を入れる） */
export const sqlConfig: { locateFile?: (file: string) => string } = {};
