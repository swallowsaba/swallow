import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js';

/**
 * DB の実戦（docs/learning-design.md 6 章: ブラウザ内で動く SQLite で本物の SQL を実行する）。sql.js の薄い包み。
 *
 * - 初期状態の SQL（表を作り、行を入れる）から DB を開く。実戦ごとに新しい DB（他の実戦と混ざらない）
 * - 判定は DB の状態で行う（docs/content-spec.md 2.4 の sql: 確かめる問い合わせの結果が、期待する行と一致するか）
 * - WebAssembly のファイルの場所は、画面の層が configureSql で渡す（ここは DOM に触れない）
 */

let config: { locateFile?: (file: string) => string } = {};
let loading: Promise<SqlJsStatic> | null = null;

/** WebAssembly のファイルの場所を決める（ブラウザでは同梱したファイルの URL） */
export function configureSql(c: { locateFile?: (file: string) => string }): void {
  config = c;
  loading = null;
}

function sql(): Promise<SqlJsStatic> {
  loading ??= initSqlJs(config);
  return loading;
}

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

function wrap(db: Database): SqlDb {
  return {
    exec: (statement) => {
      try {
        const results = db.exec(statement).map((r) => ({ columns: r.columns, rows: r.values }));
        return { ok: true, results, changes: db.getRowsModified() };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    rows: (query) => {
      const r = db.exec(query)[0];
      if (!r) return [];
      return r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i] ?? null])));
    },
    close: () => db.close(),
  };
}

export async function openDb(setupSql = ''): Promise<SqlDb> {
  const SQL = await sql();
  const db = new SQL.Database();
  if (setupSql) db.run(setupSql);
  return wrap(db);
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
