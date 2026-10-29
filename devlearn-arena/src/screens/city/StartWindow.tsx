import { useState } from 'react';
import { useStore } from 'zustand';
import { Icon } from '@/ui/icons/Icon';
import { APPEAL_BORDER } from '@/sim/appeal';
import { ORGANIZATION } from '@/sim/opposition';
import { START_MODES } from '@/sim/startMode';
import { START_CAPITAL } from '@/sim/world';
import type { Difficulty } from '@/sim/types';
import type { CityStore } from './cityStore';
import './ElectionWindow.css';
import './StartWindow.css';

/**
 * 始め方の選択（docs/ui-design.md 10.12・docs/game-design.md 27 章）。都市画面の上の大きな窓（選挙の窓と同じ枠）。後ろに都市が見える。
 * 新しく始める時（初回・設定の「最初からやり直す」・落選の後の「新しい都市で始める」）に出す。
 * 3 つを横に並べ、違いを数で示す。既定は「ふつう」で、選ばずに閉じてもふつうで始まる。開いている間、都市の時間は止まる
 */

/** 始め方ごとの 1 行（反対する人たちの様子） */
const MOOD: Record<Difficulty, string> = {
  gentle: '住民は様子を見てから声を上げる。反対が集まりにくく、申し立ても少ない',
  normal: '反対する人は集まり、公聴会にも来る。答え方しだいで通る',
  tough: '住民の会がよく組織されている。反対は大きく育ち、可決の後の申し立ても多い',
};

const coef = (v: number): string => `×${v.toFixed(v * 10 === Math.round(v * 10) ? 1 : 2)}`;

export function StartWindow({ store }: { store: CityStore }) {
  const starting = useStore(store, (s) => s.starting);
  const [picked, setPicked] = useState<Difficulty>('normal');
  if (!starting) return null;
  const now = (): number => performance.now();
  return (
    <div className="election-backdrop">
      <section className="election start" role="dialog" aria-modal="true" aria-labelledby="start-title" data-testid="start-window" data-label-block>
        <header className="election-head">
          <span className="election-icon"><Icon name="stage" size={20} /></span>
          <h2 id="start-title" className="election-title">始め方を選ぶ</h2>
          <button type="button" className="election-close" onClick={() => store.getState().chooseStart(null, now())} title="ふつうで始める（Esc）" aria-label="閉じる（ふつうで始める）">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="election-body">
          <p className="start-lead">
            都市はどれも同じ、中央の空いた村から始まる（開発資金 1,500・財政 800）。違うのは、施設を建てる時に反対する住民の手ごわさだけ。
            学ぶことには関係しない。どのレッスンも、いつでも始められる。
          </p>
          <div className="start-modes" role="group" aria-label="始め方">
            {START_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`start-mode${picked === m.id ? ' is-picked' : ''}`}
                data-testid={`start-mode-${m.id}`}
                aria-pressed={picked === m.id}
                onClick={() => setPicked(m.id)}
              >
                <span className="start-name">{m.name}{m.id === 'normal' ? <span className="start-default">既定</span> : null}</span>
                <span className="start-mood">{MOOD[m.id]}</span>
                <dl className="start-facts">
                  <div>
                    <dt>反対の組織化</dt>
                    <dd><b className="start-num num">{coef(ORGANIZATION[m.id])}</b><span>反対率に掛ける</span></dd>
                  </div>
                  <div>
                    <dt>申し立ての境</dt>
                    <dd><b className="start-num num">{`${String(APPEAL_BORDER[m.id])}%`}</b><span>可決の時の反対率がこれ以上だと申し立てられる</span></dd>
                  </div>
                  <div>
                    <dt>初めの政治資本</dt>
                    <dd><b className="start-num num">{String(START_CAPITAL[m.id])}</b><span>押し切る・説得に使う</span></dd>
                  </div>
                </dl>
              </button>
            ))}
          </div>
        </div>
        <footer className="election-foot">
          <span className="election-days">選ばずに閉じると「ふつう」で始まる</span>
          <button type="button" className="election-button" data-testid="start-go" onClick={() => store.getState().chooseStart(picked, now())}>
            {`「${START_MODES.find((m) => m.id === picked)?.name ?? ''}」で始める`}
          </button>
        </footer>
      </section>
    </div>
  );
}
