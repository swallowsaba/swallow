import { useState, type ReactNode } from 'react';
import { shownPanels } from '@/engines/sim/sim';
import type { Panel, SimAction, SimOutcome, SimState } from '@/engines/sim/types';
import { Icon } from '@/ui/icons/Icon';
import { PanelZoom, Panels, type PanelFocus } from './Panels';
import { SIM_NAMES } from './simNames';
import { SimView } from './SimViews';
import './Sim.css';

/**
 * 実戦の右側の、画面で操作する模擬環境（docs/ui-design.md 7.1、REWORK-PRACTICE.txt）。
 * 上に示す情報、中に型ごとの画面（ドラッグで置く・つなぐ・並べ替える）。文を打つ欄は置かない。エラーの小窓は一番下
 */

/**
 * 細い列では読めない情報を含むか（情報の列を広く取る）。
 * 3 列以上の表は 1 つの欄が 2〜3 字ごとに折れ、長いアドレスの値は途中で折れる
 */
const hasWidePanel = (panels: readonly Panel[]): boolean =>
  panels.some((p) => (p.kind === 'table' && p.columns.length >= 3) || (p.kind === 'kv' && p.rows.some(([, v]) => /^[ -~]{15,}$/.test(v))));

export function SimConsole({ sim, act, expr, onReset, restored, error }: {
  sim: SimState;
  act: (action: SimAction) => SimOutcome;
  expr: string | null;
  onReset: () => void;
  restored: boolean;
  error: ReactNode;
}) {
  const panels = shownPanels(sim);
  const [focus, setFocus] = useState<PanelFocus | null>(null);
  // 初めに戻すと、画面のその場の知らせ（赤く光った枠・止まった荷物）も消す
  const [round, setRound] = useState(0);
  // 情報が入れ替わったら（操作の結果で別の情報が出たら）、拡大を外す
  const shownFocus = focus !== null && focus.panel < panels.length ? focus : null;
  return (
    <div className="practice-console sim-console" data-testid="sim-console" data-sim={sim.type}>
      <div className="practice-console-bar">
        <span className="practice-console-name"><Icon name="graph" size={16} />模擬環境: {SIM_NAMES[sim.type]}</span>
        {restored ? <span className="sim-resumed">中断した所から続ける</span> : null}
        <button type="button" className="practice-reset" onClick={() => {
          setFocus(null);
          setRound((n) => n + 1);
          onReset();
        }} title="模擬環境を初めの状態に戻す（ヒントの記録は残る）" data-testid="practice-reset">
          <Icon name="rotate" size={14} />初めに戻す
        </button>
      </div>
      <div className="sim-body">
        <div className={`sim-layout${panels.length > 0 ? ' has-panels' : ''}${hasWidePanel(panels) ? ' has-wide-panels' : ''}`}>
          <Panels panels={panels} focus={shownFocus} onFocus={setFocus} />
          <div className="sim-main">
            <PanelZoom panels={panels} focus={shownFocus} onClose={() => setFocus(null)} />
            <SimView key={round} s={sim} act={act} expr={expr} />
          </div>
        </div>
      </div>
      {error}
    </div>
  );
}
