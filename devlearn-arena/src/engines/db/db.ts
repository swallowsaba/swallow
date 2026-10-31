import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { sqlConfig, type SqlDb } from './check';

export { formatResult, isCommitted, matchesExpected, type ExecOutcome, type ResultSet, type Row, type SqlDb, type SqlValue } from './check';

/**
 * DB の実戦（docs/learning-design.md 6 章: ブラウザ内で動く SQLite で本物の SQL を実行する）。sql.js の薄い包み。
 *
 * - 初期状態の SQL（表を作り、行を入れる）から DB を開く。実戦ごとに新しい DB（他の実戦と混ざらない）
 * - 判定は DB の状態で行う（docs/content-spec.md 2.4 の sql: 確かめる問い合わせの結果が、期待する行と一致するか。src/engines/db/check.ts）
 * - WebAssembly のファイルの場所は、画面の入口が sqlConfig に入れる（ここは DOM に触れない）
 */

let loading: Promise<SqlJsStatic> | null = null;

/** WebAssembly のファイルの場所を決める（ブラウザでは同梱したファイルの URL） */
export function configureSql(c: { locateFile?: (file: string) => string }): void {
  sqlConfig.locateFile = c.locateFile;
  loading = null;
}

function sql(): Promise<SqlJsStatic> {
  loading ??= initSqlJs(sqlConfig.locateFile ? { locateFile: sqlConfig.locateFile } : {});
  return loading;
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

/**
 * 実行中の処理を見て止める関数（db.a.02）。PostgreSQL と同じ名前で、初期状態の表 pg_stat_activity と _pg_locks（誰が誰を待つか）を読み書きする。
 * 止めると、その処理を待っていた処理の待ちが解ける。表の無い実戦では、表が無いと断られる
 */
function addActivityFunctions(db: Database): void {
  db.create_function('pg_blocking_pids', (pid: number) => {
    const rows = db.exec(`SELECT blocker FROM _pg_locks WHERE pid = ${String(Number(pid))} ORDER BY blocker`)[0]?.values ?? [];
    return `{${rows.map((r) => String(r[0])).join(',')}}`;
  });
  db.create_function('pg_terminate_backend', (pid: number) => {
    const id = String(Number(pid));
    if ((db.exec(`SELECT 1 FROM pg_stat_activity WHERE pid = ${id}`)[0]?.values.length ?? 0) === 0) return 'false';
    db.run(`DELETE FROM pg_stat_activity WHERE pid = ${id}; DELETE FROM _pg_locks WHERE blocker = ${id} OR pid = ${id};`);
    db.run("UPDATE pg_stat_activity SET wait_event_type = NULL WHERE wait_event_type = 'Lock' AND pid NOT IN (SELECT pid FROM _pg_locks)");
    return 'true';
  });
}

export async function openDb(setupSql = ''): Promise<SqlDb> {
  const SQL = await sql();
  const db = new SQL.Database();
  addActivityFunctions(db);
  if (setupSql) db.run(setupSql);
  return wrap(db);
}
