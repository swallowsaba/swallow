import { useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { SkillValues } from '@/sim/hearing';
import { Icon } from '@/ui/icons/Icon';
import { Rich } from '../Rich';
import type { CityStore } from './cityStore';
import { handsModel, hearingModel, hearingTitle } from './hearingView';
import './HearingWindow.css';

/**
 * 公聴会の窓（docs/ui-design.md 10.3）。大きな窓（幅 720・高さ最大 70%・中央）。開いている間、都市の時間は止まる。
 * 左: 論点の列（理由の名前・割合・反対する集団・出した手と結果）。右: 選んだ論点の、出せる手の 3 種類を横に並べる。
 * 下: 「公聴会を終える」。スキルが無い時も、譲歩と押し切るは必ず出る
 */
export function HearingWindow({ store, skills }: { store: CityStore; skills: SkillValues }) {
  const s = useStore(store, useShallow((x) => ({
    id: x.hearingId, apps: x.world.applications, capital: x.world.politics.capital, reaction: x.reaction,
    leave: x.leaveHearing, end: x.endHearing, play: x.playHand,
  })));
  const [pick, setPick] = useState<string | null>(null);
  const world = store.getState().world;
  const m = s.id ? hearingModel(world, s.id) : null;
  const app = s.id ? world.applications.find((a) => a.id === s.id) : undefined;
  if (!m || !app) return null;
  const current = m.issues.find((i) => i.reasonId === pick) ?? m.issues.find((i) => !i.done) ?? m.issues[0];
  const hands = current ? handsModel(world, app, current.reasonId, skills) : null;
  const play = (hand: Parameters<typeof s.play>[2]): void => {
    if (!current) return;
    // 手を出した論点を選んだままにする（結果の 1 行を見せる）
    setPick(current.reasonId);
    s.play(m.id, current.reasonId, hand, skills);
  };
  return (
    <div className="hearing-backdrop">
      <section className="hearing" role="dialog" aria-modal="true" aria-labelledby="hearing-title" data-testid="hearing-window" data-label-block>
        <header className="hearing-head">
          <span className="hearing-icon"><Icon name="civic" size={20} /></span>
          <h2 id="hearing-title" className="hearing-title">{hearingTitle(m)}</h2>
          <span className="hearing-stat" title="反対率">
            反対率 <b className="num" data-testid="hearing-opposition">{m.opposition}</b><span className="hearing-unit">%</span>
          </span>
          <span className="hearing-stat" title="政治資本">
            政治資本 <b className="num" data-testid="hearing-capital">{s.capital}</b>
          </span>
          <button type="button" className="hearing-close" onClick={s.leave} title="閉じる（公聴会は終えずに待つ）" aria-label="閉じる">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="hearing-body">
          <ol className="hearing-issues" aria-label="論点" data-testid="hearing-issues">
            {m.issues.map((i) => (
              <li key={i.reasonId}>
                <button
                  type="button"
                  className={`hearing-issue${current?.reasonId === i.reasonId ? ' is-current' : ''}${i.done ? ' is-done' : ''}`}
                  data-reason={i.reasonId}
                  aria-pressed={current?.reasonId === i.reasonId}
                  onClick={() => setPick(i.reasonId)}
                >
                  <span className="hearing-issue-top">
                    <span className="hearing-issue-title">{i.title}</span>
                    <span className="hearing-issue-bar" aria-hidden="true"><span style={{ width: `${String(Math.min(100, i.share))}%` }} /></span>
                    <span className="num">{i.share}</span>
                    <span className="hearing-unit">%</span>
                  </span>
                  <span className="hearing-issue-who">{i.group}</span>
                  {i.done ? <span className="hearing-issue-done">{i.done}</span> : null}
                </button>
              </li>
            ))}
          </ol>
          {current && hands ? (
            <div className="hearing-main" data-testid="hearing-hands">
              <p className="hearing-claim"><span className="hearing-claim-who">{current.group}</span>{current.claim}</p>
              {s.reaction?.reasonId === current.reasonId ? (
                <p className="hearing-reaction" data-testid="hearing-reaction">
                  {s.reaction.text}
                  {s.reaction.lesson ? <span className="hearing-reaction-lesson" data-testid="hearing-reaction-lesson"><Icon name="learn" size={12} />学べるレッスン: {s.reaction.lesson}</span> : null}
                </p>
              ) : null}
              <div className={`hearing-hands${hands.used ? ' is-used' : ''}`}>
                <section className="hearing-hand" aria-label="譲歩する">
                  <h3 className="hearing-hand-title">譲歩する</h3>
                  <ul className="hearing-options">
                    {hands.concessions.map((c) => (
                      <li key={c.id}>
                        <button type="button" className={`hearing-option${hands.chosen === c.id ? ' is-chosen' : ''}`} data-concession={c.id} aria-pressed={hands.chosen === c.id} disabled={hands.used || !c.ok} onClick={() => play({ kind: 'concede', concessionId: c.id })}>
                          {c.tech ? <span className="hearing-tech">{c.tech}</span> : null}
                          <span className="hearing-option-text">{c.label}</span>
                          <span className="hearing-option-note">{c.effects.join('・')}</span>
                          <span className="hearing-option-note">
                            {c.cost > 0 ? `費用 ${c.cost.toLocaleString('ja-JP')} 資金（可決した時に取り分ける）` : c.cost < 0 ? `費用が ${(-c.cost).toLocaleString('ja-JP')} 資金下がる` : '費用はかからない'}
                            {c.why ? `・${c.why}` : ''}
                          </span>
                          {c.loss ? <span className="hearing-option-note"><Rich text={c.loss} /></span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="hearing-hand" aria-label="説明する">
                  <h3 className="hearing-hand-title">説明する</h3>
                  {hands.explanations.length > 0 ? (
                    <ul className="hearing-options">
                      {hands.explanations.map((e) => (
                        <li key={e.id}>
                          <button type="button" className={`hearing-option${hands.chosen === e.id ? ' is-chosen' : ''}`} data-explanation={e.id} aria-pressed={hands.chosen === e.id} disabled={hands.used} onClick={() => play({ kind: 'explain', explanationId: e.id })}>
                            <span className="hearing-option-text"><Rich text={e.text} /></span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hearing-empty" data-testid="hearing-no-explain">今出せる説明は無い。学ぶと増える</p>
                  )}
                  {hands.hidden.length > 0 ? (
                    <ul className="hearing-hidden" data-testid="hearing-hidden">
                      {hands.hidden.map((h) => <li key={h}><Icon name="learn" size={12} />{h}</li>)}
                    </ul>
                  ) : null}
                </section>
                <section className="hearing-hand" aria-label="押し切る">
                  <h3 className="hearing-hand-title">押し切る</h3>
                  <button type="button" className={`hearing-option${hands.chosen === 'push' ? ' is-chosen' : ''}`} data-testid="hearing-push" aria-pressed={hands.chosen === 'push'} disabled={hands.used || !hands.push.ok} onClick={() => play({ kind: 'push' })}>
                    <span className="hearing-option-text">政治資本 <b className="num">{hands.push.cost}</b> を使う</span>
                    <span className="hearing-option-note">反対率は下がらない。議員はこの論点を軽く見る</span>
                    <span className="hearing-option-note">{hands.push.groups}の市政への信頼が下がる</span>
                    {!hands.push.ok && !hands.used ? <span className="hearing-option-note is-warn">政治資本が足りない</span> : null}
                  </button>
                </section>
              </div>
            </div>
          ) : (
            <p className="hearing-empty">答える論点は無い（5% 以上の反対の理由が無い）</p>
          )}
        </div>
        <footer className="hearing-foot">
          <button type="button" className="hearing-end" data-testid="hearing-end" onClick={() => s.end(m.id, performance.now())}>
            公聴会を終える{m.left > 0 ? `（答えていない論点 ${String(m.left)}）` : ''}
          </button>
        </footer>
      </section>
    </div>
  );
}
