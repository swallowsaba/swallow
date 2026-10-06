import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ResultSet, SqlDb } from '@/engines/db/check';
import { Icon } from '@/ui/icons/Icon';
import type { SqlLogEntry } from './sqlRun';
import './Sql.css';

/**
 * ブラウザ内 SQL（S）の右側（docs/ui-design.md 7.1: SQL の入力欄と、結果の表。書いて「実行」）。
 * DB はブラウザの中の SQLite（sql.js）。開く時に初期状態の SQL で表を作る。SQLite の本体は、この画面を開いた時に読む。
 * 実行した文と結果を上に積み、表の形（表の名前と列）を上の帯に示す
 */

export function SqlConsole({ db, log, tables, onRun, onReset, restored, answer, error }: {
  db: SqlDb | null;
  log: SqlLogEntry[];
  tables: { name: string; columns: string[] }[];
  onRun: (statement: string) => void;
  onReset: () => void;
  restored: boolean;
  /** 答える形の手順の、答えの欄 */
  answer: ReactNode;
  error: ReactNode;
}) {
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 新しい結果が見えるように、記録の一番下を見せる
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  useEffect(() => {
    if (db) inputRef.current?.focus();
  }, [db]);

  const run = (): void => {
    if (draft.trim() === '' || !db) return;
    onRun(draft.trim());
    setDraft('');
  };

  return (
    <div className="practice-console sql-console" data-testid="sql-console">
      <div className="practice-console-bar">
        <span className="practice-console-name"><Icon name="database" size={16} />ブラウザ内の DB（SQLite）</span>
        <button type="button" className="practice-reset" onClick={onReset} title="DB を初めの状態に戻す（ヒントの記録は残る）" data-testid="practice-reset">
          <Icon name="rotate" size={14} />初めに戻す
        </button>
      </div>
      <p className="sql-tables" data-testid="sql-tables">
        <span className="sql-tables-label">表</span>
        {tables.length === 0 ? <span className="sql-tables-none">まだ無い</span> : tables.map((t) => (
          <code key={t.name} className="sql-table-name">{t.name}<span className="sql-table-cols">（{t.columns.join(', ')}）</span></code>
        ))}
      </p>
      <div className="sql-log" ref={logRef} data-testid="sql-log" aria-live="polite">
        {log.length === 0 ? (
          <p className="sql-log-empty">{db ? (restored ? '中断した所から続ける。' : 'SQL を書いて「実行」を押す（Ctrl + Enter でも実行できる）。結果がここに出る。') : 'DB を用意している…'}</p>
        ) : log.map((e, i) => (
          <div key={i} className={`sql-entry${e.error ? ' is-error' : ''}`} data-testid="sql-entry">
            <pre className="sql-entry-statement"><span className="sql-prompt">sql&gt;</span> {e.statement}</pre>
            {e.error ? <p className="sql-entry-error">{e.error}</p> : null}
            {e.results.map((r, j) => <ResultTable key={j} result={r} />)}
            {!e.error && e.results.length === 0 ? <p className="sql-entry-note">{e.changes > 0 ? `${String(e.changes)} 行が変わった` : '実行した（返す行は無い）'}</p> : null}
          </div>
        ))}
      </div>
      <form className="sql-input" onSubmit={(ev) => {
        ev.preventDefault();
        run();
      }}>
        <label className="sim-command-label" htmlFor="sql-input">SQL</label>
        <textarea
          id="sql-input"
          ref={inputRef}
          className="sql-text"
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
              ev.preventDefault();
              run();
            }
          }}
          rows={3}
          spellCheck={false}
          autoComplete="off"
          disabled={!db}
          data-testid="sql-input"
        />
        <button type="submit" className="sim-tool is-strong" disabled={!db || draft.trim() === ''} data-testid="sql-run">実行</button>
      </form>
      {answer}
      {error}
    </div>
  );
}

function ResultTable({ result }: { result: ResultSet }) {
  return (
    <div className="sql-result">
      <table className="sql-table" data-testid="sql-result">
        <thead>
          <tr>{result.columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i}>{row.map((v, j) => <td key={j} className={typeof v === 'number' ? 'num' : v === null ? 'is-null' : undefined}>{v === null ? 'NULL' : String(v)}</td>)}</tr>
          ))}
        </tbody>
      </table>
      <p className="sql-result-count">{String(result.rows.length)} 行</p>
    </div>
  );
}
