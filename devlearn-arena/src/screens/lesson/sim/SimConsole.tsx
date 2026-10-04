import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SimState } from '@/engines/sim/types';
import { Icon } from '@/ui/icons/Icon';
import { SIM_NAMES } from './simNames';
import { shownPanels } from '@/engines/sim/sim';
import { Panels, SimView } from './SimViews';
import './Sim.css';

/**
 * 実戦の右側の、画面で操作する模擬環境（docs/ui-design.md 7.1、docs/decisions.md D-16）。
 * 上に示す情報、中に型ごとの画面、下に操作の文の記録と、文で操作する入力欄。エラーの小窓は一番下。
 */

/** 型ごとの操作の文の書き方（入力欄の下に出す） */
const FORMS: Record<SimState['type'], string[]> = {
  connect: ['connect 部品 部品', 'cut 部品 部品', 'start 機器', 'send 送り元 宛先'],
  order: ['order 札 札,札 札（空白で次の段、, で同じ段）'],
  assign: ['put 札 枠', 'take 札'],
  config: ['set 欄 値', 'add 表 列=値 …', 'del 表 番号'],
  read: ['answer 問い 値'],
};

export function SimConsole({ sim, log, verbs, send, onReset, restored, error }: {
  sim: SimState;
  log: readonly { line: string; error: string | null }[];
  verbs: readonly string[];
  send: (line: string) => void;
  onReset: () => void;
  restored: boolean;
  error: ReactNode;
}) {
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  return (
    <div className="practice-console sim-console" data-testid="sim-console" data-sim={sim.type}>
      <div className="practice-console-bar">
        <span className="practice-console-name"><Icon name="graph" size={16} />模擬環境: {SIM_NAMES[sim.type]}</span>
        <button type="button" className="practice-reset" onClick={onReset} title="模擬環境を初めの状態に戻す（ヒントの記録は残る）" data-testid="practice-reset">
          <Icon name="rotate" size={14} />初めに戻す
        </button>
      </div>
      <div className="sim-body">
        <Panels panels={shownPanels(sim)} />
        <SimView sim={sim} send={send} />
      </div>
      <div className="sim-statements">
        <ol className="sim-log" ref={logRef} aria-label="操作の文の記録" data-testid="sim-log">
          {log.length === 0 ? <li className="sim-log-empty">{restored ? '中断した所から続ける。' : ''}操作すると、同じ意味の文がここに残る。</li> : null}
          {log.map((e, i) => (
            <li key={i} className={`sim-log-line${e.error ? ' is-error' : ''}`}>
              <code>{e.line}</code>
              {e.error ? <span className="sim-log-said">{e.error}</span> : null}
            </li>
          ))}
        </ol>
        <form className="sim-command" onSubmit={(e) => {
          e.preventDefault();
          send(draft);
          setDraft('');
        }}>
          <label className="sim-command-label" htmlFor="sim-command">文で操作する</label>
          <input id="sim-command" className="sim-input is-command" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={FORMS[sim.type][0]} spellCheck={false} autoComplete="off" data-testid="sim-command" />
          <button type="submit" className="sim-tool is-strong" disabled={draft.trim() === ''}>実行</button>
        </form>
        <p className="practice-candidates sim-forms">
          <span className="practice-candidates-label">使える操作</span>
          {FORMS[sim.type].map((f) => <code key={f} className="practice-candidate" title={verbs.join('・')}>{f}</code>)}
        </p>
      </div>
      {error}
    </div>
  );
}
