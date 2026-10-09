import { useState } from 'react';
import type { ConfigState, ReadState, SimState } from '@/engines/sim/types';
import { Icon } from '@/ui/icons/Icon';
import { AssignBoard } from './AssignBoard';
import type { BoardProps } from './boardTypes';
import { ConnectBoard } from './ConnectBoard';
import { OrderBoard } from './OrderBoard';

/**
 * 模擬環境（模）の型の画面（docs/ui-design.md 7.1）。どの操作も SimAction にして act に渡す。状態を変えるのは模擬（src/engines/sim）だけ。
 * 画面の操作は、ドラッグして置く・つなぐ・並べ替える と、押すだけの選択（REWORK-PRACTICE.txt 原則 3）
 */

export function SimView({ s, act, expr }: BoardProps<SimState>) {
  switch (s.type) {
    case 'connect': return <ConnectBoard s={s} act={act} expr={expr} />;
    case 'order': return <OrderBoard s={s} act={act} expr={expr} />;
    case 'assign': return <AssignBoard s={s} act={act} expr={expr} />;
    case 'config': return <ConfigView s={s} act={act} expr={expr} />;
    case 'read': return <ReadView s={s} act={act} expr={expr} />;
  }
}

/* ---------- 読み取って答える ---------- */

function ReadView({ s, act }: BoardProps<ReadState>) {
  return (
    <div className="sim-read" data-testid="sim-read">
      <p className="sim-how">情報を読み、問いの答えを押して選ぶ。読む所を押すと、その部分が大きく出る。答え直してもよい。</p>
      {s.setup.questions.map((q) => (
        <div key={q.id} className="sim-question">
          <p className="sim-question-prompt">{q.prompt}</p>
          <div className="sim-question-options" role="group" aria-label={q.prompt}>
            {q.options.map((o) => (
              <button key={o} type="button" className={`sim-option${s.answers[q.id] === o ? ' is-picked' : ''}`} aria-pressed={s.answers[q.id] === o} onClick={() => act({ op: 'answer', question: q.id, value: o })}>
                {s.answers[q.id] === o ? <Icon name="check" size={12} /> : null}{o}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- 設定する（作り直しの間だけ残す。REWORK-PRACTICE.txt (2) で廃止する） ---------- */

function ConfigView({ s, act }: BoardProps<ConfigState>) {
  return (
    <div className="sim-config" data-testid="sim-config">
      {(s.setup.fields ?? []).map((f) => (
        <div key={f.id} className="sim-question">
          <p className="sim-question-prompt">{f.label}</p>
          {f.options ? (
            <div className="sim-question-options" role="group" aria-label={f.label}>
              {f.options.map((o) => (
                <button key={o} type="button" className={`sim-option${s.fields[f.id] === o ? ' is-picked' : ''}`} aria-pressed={s.fields[f.id] === o} data-field={f.id} onClick={() => act({ op: 'set', field: f.id, value: o })}>
                  {o}
                </button>
              ))}
            </div>
          ) : <FreeField value={s.fields[f.id] ?? ''} onSet={(v) => act({ op: 'set', field: f.id, value: v })} />}
        </div>
      ))}
      {(s.setup.tables ?? []).map((t) => <TableEditor key={t.id} table={t} rows={s.tables[t.id] ?? []} act={act} />)}
    </div>
  );
}

function FreeField({ value, onSet }: { value: string; onSet: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <form className="sim-command" onSubmit={(e) => {
      e.preventDefault();
      if (draft.trim() !== '') onSet(draft.trim());
    }}>
      <input className="sim-input" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} autoComplete="off" />
      <button type="submit" className="sim-tool is-strong">決める</button>
    </form>
  );
}

function TableEditor({ table, rows, act }: { table: NonNullable<ConfigState['setup']['tables']>[number]; rows: Record<string, string>[]; act: BoardProps<ConfigState>['act'] }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  return (
    <section className="sim-question" aria-label={table.label}>
      <p className="sim-question-prompt">{table.label}</p>
      <table className="sim-table">
        <thead><tr>{table.columns.map((c) => <th key={c.id} scope="col">{c.label}</th>)}<th scope="col" aria-label="操作" /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {table.columns.map((c) => <td key={c.id}>{r[c.id] ?? ''}</td>)}
              <td><button type="button" className="sim-tool" onClick={() => act({ op: 'del', table: table.id, index: i + 1 })}>消す</button></td>
            </tr>
          ))}
          <tr>
            {table.columns.map((c) => (
              <td key={c.id}>
                <input className="sim-input" aria-label={`新しい行の${c.label}`} value={draft[c.id] ?? ''} spellCheck={false} autoComplete="off" onChange={(e) => setDraft({ ...draft, [c.id]: e.target.value })} />
              </td>
            ))}
            <td>
              <button type="button" className="sim-tool is-strong" onClick={() => {
                if (!act({ op: 'add', table: table.id, row: draft }).error) setDraft({});
              }}>足す</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
