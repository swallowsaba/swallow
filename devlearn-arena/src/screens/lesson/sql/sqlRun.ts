import type { Practice } from '@/content/schema';
import type { ExecOutcome, ResultSet, SqlDb } from '@/engines/db/check';
import { resolveSetup } from '@/engines/environments';

/** 実行した 1 回（保存できる素のデータ） */
export interface SqlLogEntry {
  statement: string;
  /** 結果の表（SELECT など） */
  results: ResultSet[];
  /** 変わった行の数（INSERT・UPDATE・DELETE） */
  changes: number;
  error: string | null;
}

/** 実戦の初期状態の SQL */
export const setupSqlOf = (p: Practice): string => resolveSetup(p.environment, p.setup).sql ?? '';

/** 1 つの文を実行して、記録の形にする。変わった行の数は、行を変える文の時だけ数える（SELECT の後も前の数が残るため） */
export function runStatement(db: SqlDb, statement: string): { entry: SqlLogEntry; outcome: ExecOutcome } {
  const outcome = db.exec(statement);
  const entry: SqlLogEntry = outcome.ok
    ? { statement, results: outcome.results, changes: /^\s*(insert|update|delete|replace)\b/i.test(statement) ? outcome.changes : 0, error: null }
    : { statement, results: [], changes: 0, error: outcome.error };
  return { entry, outcome };
}

/** 表の名前と列（sqlite_master から。画面の上の帯に出す） */
export function tablesOf(db: SqlDb): { name: string; columns: string[] }[] {
  try {
    return db.rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid")
      .map((r) => String(r.name))
      .map((name) => ({ name, columns: db.rows(`SELECT name FROM pragma_table_info('${name.replace(/'/g, "''")}')`).map((c) => String(c.name)) }));
  } catch {
    return [];
  }
}
